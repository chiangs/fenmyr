// The "Myra sees" strip and the chat's status line. In Node: which chips show, what they send, and how × and + change
// one message. In the app: the board chip can't be removed, × on the selection leaves the cards out of that message
// and keeps them selected, the web and a vault go with one message as the strip says, a queued question keeps the
// chips it was sent with, even when the vault or the web is taken away before its turn, "Yes, make it" and "Search my
// vault" ask again with the chips the question had, and the header says Ready, Thinking…, Reading N notes, Not signed
// in or Needs Claude Code.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { capture, chipsOf, NO_FLIPS, type SeesInput, toggle } from '../src/web/myra/sees.ts';
import { contrast } from '../src/web/ui/color.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const input = (more: Partial<SeesInput> = {}): SeesInput => ({
  sel: [],
  one: null,
  vaults: [{ vault: 'v1', name: 'Garden' }],
  web: true,
  added: [],
  ...more,
});
const kinds = (i: SeesInput, flips = NO_FLIPS) =>
  chipsOf(i, flips).map(c => ('on' in c ? `${c.kind}:${c.on}` : c.kind));

assert.deepStrictEqual(kinds(input({ vaults: [], web: false })), ['board'], 'with nothing else, only the board');
assert.deepStrictEqual(
  kinds(input({ sel: ['a', 'b'] })),
  ['board', 'selection:true', 'vault:false', 'web:true'],
  'the selection and the web go unless left out; a vault goes only once added',
);
assert.deepStrictEqual(capture(input({ sel: ['a', 'b'] }), NO_FLIPS), {
  sel: ['a', 'b'],
  vaults: [],
  web: true,
  added: [],
});
const two = chipsOf(input({ sel: ['a', 'b'] }), NO_FLIPS);
const keyOf = (kind: string) => {
  const c = two.find(x => x.kind === kind);
  return c && 'key' in c ? c.key : '';
};
const left = toggle(toggle(NO_FLIPS, keyOf('selection')), keyOf('web')),
  added = toggle(left, keyOf('vault'));
assert.deepStrictEqual(capture(input({ sel: ['a', 'b'] }), added), { sel: [], vaults: ['v1'], web: false, added: [] });
assert.deepStrictEqual(
  kinds(input({ sel: ['a', 'b'] }), added),
  ['board', 'selection:false', 'vault:true', 'web:false'],
  'the strip shows what capture sends',
);
assert.deepStrictEqual(capture(input({ sel: ['c'] }), left).sel, ['c'], 'a different selection goes along again');
assert.deepStrictEqual(capture(input({ sel: ['b', 'a'] }), left).sel, [], 'the same cards in another order stay out');
assert.strictEqual(toggle(toggle(NO_FLIPS, 'web'), 'web').size, 0, '+ undoes ×');
assert.strictEqual(chipsOf(input({ sel: ['a'], one: 'Note · “Milk”' }), NO_FLIPS)[1]?.kind, 'selection');
console.log('SEES (Node) OK');

const l = await launch({
  boards: [replyBoard('sees', 'Sees')],
  open: 'sees',
  claude: true,
  settings: { webAccess: true },
});
const { page } = l;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

type Sent = { q: string; selected: string[]; web: boolean; read: boolean; notes: number; confirmed: boolean };
// her answers record what went with each question; a question holding "slow" waits until `release()`, one holding
// CONFIRM asks before making something, OFFER offers to search the vault, and SIGNIN fails as signed out
await page.evaluate(() => {
  const sent: Sent[] = [];
  Reflect.set(window, 'sent', sent);
  let open: () => void = () => {};
  Reflect.set(window, 'release', () => open());
  window.Fenmyr.ask = async (prompt, snap, confirmed, opts) => {
    const cards: unknown[] = Array.isArray(snap.cards) ? snap.cards : [],
      field = (c: unknown, k: string): unknown => (typeof c === 'object' && c ? Reflect.get(c, k) : undefined);
    sent.push({
      q: prompt,
      selected: cards.filter(c => field(c, 'selected')).map(c => String(field(c, 'id'))),
      web: !!opts?.web,
      read: !opts?.canVault,
      notes: opts?.vaultNotes?.length ?? 0,
      confirmed: !!confirmed,
    });
    if (prompt.includes('slow')) await new Promise<void>(r => (open = r));
    if (prompt.includes('SIGNIN')) throw new Error('Not logged in');
    if (prompt.includes('CONFIRM') && !confirmed) return JSON.stringify({ say: 'Shall I?', confirm: 'Yes, make it' });
    if (prompt.includes('OFFER') && opts?.canVault) return JSON.stringify({ say: 'I could look', offerVault: true });
    return JSON.stringify({ say: 'ok' });
  };
});
const asked = (q: string) =>
  page.evaluate(async q => {
    await window.__fenmyr.ask(q);
    const all: Sent[] = Reflect.get(window, 'sent');
    const s = all.findLast(x => x.q.endsWith(q));
    if (!s) throw new Error(`not sent: ${q}`);
    return s;
  }, q);
const strip = (sel: string) => `#mcSees ${sel}`;
const status = () => page.textContent('#mcStatus');

await page.click('#mPill');
await settle(page, 300);

await check('the board chip is always there and cannot be removed', async () => {
  assert.strictEqual(await page.locator(strip('[data-chip="board"]')).count(), 1);
  assert.strictEqual(await page.locator(strip('[data-chip="board"] button')).count(), 0, 'it has no ×');
});

await check('at rest the header says Ready', async () => {
  assert.strictEqual(await status(), 'Ready');
});

await check('× on the selection leaves the cards out of that message and keeps them selected', async () => {
  await page.evaluate(() => {
    window.__fenmyr.selectOnly(['n1', 'n2']);
    window.__fenmyr.applyToolbar();
  });
  assert.strictEqual(await page.textContent(strip('[data-chip="sel"] .mcs-t')), '2 cards');
  assert.match((await page.getAttribute('#mcInput', 'placeholder')) ?? '', /these 2/, 'the hint says they go along');
  const blue = await page.evaluate(() => {
    const chip = document.querySelector('#mcSees [data-chip="sel"]'),
      probe = document.createElement('i');
    probe.style.color = 'var(--select)';
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return chip ? getComputedStyle(chip).borderTopColor === want : false;
  });
  assert.ok(blue, 'the selection chip is blue like selection');
  const target = await page.evaluate(() => {
    const x = document.querySelector('#mcSees [data-chip="sel"] .mcs-x'),
      r = x?.getBoundingClientRect();
    if (!x || !r) return [];
    const cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    return [
      [cx - 11.5, cy],
      [cx + 11.5, cy],
      [cx, cy - 11.5],
      [cx, cy + 11.5],
    ].map(([px = 0, py = 0]) => x.contains(document.elementFromPoint(px, py)));
  });
  assert.deepStrictEqual(target, [true, true, true, true], '× answers across a 24 px target');
  await page.click(strip('[data-chip="sel"] .mcs-x'));
  assert.doesNotMatch(
    (await page.getAttribute('#mcInput', 'placeholder')) ?? '',
    /these 2/,
    'the hint stops saying so',
  );
  // hovered, it turns to full ink
  await page.mouse.move(1, 1);
  for (const dark of [false, true]) {
    const [ink, ground] = await page.evaluate(dark => {
      document.body.classList.toggle('dark', dark);
      const t = document.querySelector('#mcSees [data-chip="sel"] .mcs-t'),
        hex = (c: string) =>
          `#${(c.match(/\d+(\.\d+)?/g) ?? [])
            .slice(0, 3)
            .map(n => Math.round(Number(n)).toString(16).padStart(2, '0'))
            .join('')}`;
      let el = t instanceof Element ? t : null;
      while (el && /rgba\(.*, 0\)|transparent/.test(getComputedStyle(el).backgroundColor)) el = el.parentElement;
      const out = [hex(t ? getComputedStyle(t).color : ''), hex(el ? getComputedStyle(el).backgroundColor : '')];
      document.body.classList.remove('dark');
      return out;
    }, dark);
    assert.ok(
      contrast(ink ?? '', ground ?? '') >= 4.5,
      `${dark ? 'dark' : 'light'}: the left-out selection chip reads at 4.5:1 (${ink} on ${ground})`,
    );
  }
  const one = await asked('question one');
  assert.deepStrictEqual(one.selected, [], 'the message goes without the cards');
  assert.deepStrictEqual(await page.evaluate(() => window.__fenmyr.sel.sort()), ['n1', 'n2'], 'they stay selected');
  const next = await asked('question two');
  assert.deepStrictEqual(next.selected.sort(), ['n1', 'n2'], 'the next message has them again');
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
});

await check('the web chip shows when web is on, and × leaves the web out of that message only', async () => {
  assert.strictEqual((await asked('web one')).web, true);
  await page.click(strip('[data-chip="web"] .mcs-x'));
  assert.strictEqual(await page.locator(strip('[data-chip="web"].out')).count(), 1, 'the chip stays, dashed with +');
  assert.strictEqual((await asked('web two')).web, false, 'left out');
  assert.strictEqual((await asked('web three')).web, true, 'and back for the next message');
});

const vault = path.join(l.data, 'vault');
fs.cpSync(path.join(import.meta.dirname, 'sample-vault'), vault, { recursive: true });
await page.evaluate(async vault => {
  const M = window.__fenmyr,
    v = await window.Fenmyr.vaultAdd(vault);
  M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: true, write: false, writeTo: 'Myra' }];
  await M.openVaultPicker();
  document.getElementById('vaultPick')?.remove();
  M.applyToolbar();
}, vault);

await check('a vault is off by default and goes with one message once added', async () => {
  assert.strictEqual(await page.locator(strip('[data-chip="vault"].out')).count(), 1, 'it starts left out');
  assert.strictEqual((await asked('vault one')).read, false, 'and is not read');
  await page.click(strip('[data-chip="vault"]'));
  const added = await asked('what do I know about cloudberries?');
  assert.ok(added.read && added.notes > 0, 'once added it is read for that message');
  assert.strictEqual((await asked('vault three')).read, false, 'and not for the next');
  await page.click(strip('[data-chip="vault"]'));
  await page.click(strip('[data-chip="vault"] .mcs-x'));
  assert.strictEqual((await asked('vault four')).read, false, '× before sending takes it off again');
});

await check('the header says what she is doing, and Ready again after', async () => {
  const thinking = page.evaluate(() => window.__fenmyr.ask('slow thought'));
  await page.waitForFunction(() => document.getElementById('mcStatus')?.textContent === 'Thinking…');
  await page.evaluate(() => Reflect.get(window, 'release')());
  await thinking;
  assert.strictEqual(await status(), 'Ready');
  await page.click(strip('[data-chip="vault"]'));
  const reading = page.evaluate(() => window.__fenmyr.ask('slow: what do I know about cloudberries?'));
  await page.waitForFunction(() => /^Reading \d+ notes?$/.test(document.getElementById('mcStatus')?.textContent ?? ''));
  const n = await page.evaluate(() => {
    const all: Sent[] = Reflect.get(window, 'sent');
    return all.at(-1)?.notes ?? 0;
  });
  assert.strictEqual(await status(), `Reading ${n} note${n === 1 ? '' : 's'}`, 'it counts the notes she was given');
  await page.evaluate(() => Reflect.get(window, 'release')());
  await reading;
  assert.strictEqual(await status(), 'Ready');
});

await check('a queued question keeps the chips it was sent with', async () => {
  const sent = await page.evaluate(async () => {
    const M = window.__fenmyr,
      zero = M.ask('slow zero');
    M.selectOnly(['n1', 'n2']);
    const one = M.ask('queued one');
    M.selectOnly(['n3']);
    M.applyToolbar();
    document.querySelector<HTMLElement>('#mcSees [data-chip="vault"]')?.click();
    const two = M.ask('queued two');
    const all: Sent[] = Reflect.get(window, 'sent');
    while (!all.some(s => s.q.endsWith('slow zero'))) await new Promise(r => setTimeout(r, 20));
    Reflect.get(window, 'release')();
    await Promise.all([zero, one, two]);
    return Object.fromEntries(all.slice(-2).map(s => [s.q.split(' ').at(-1), s]));
  });
  assert.deepStrictEqual(
    sent.one?.selected.sort(),
    ['n1', 'n2'],
    'the first keeps the cards selected when it was sent',
  );
  assert.strictEqual(sent.one?.read, false, 'and goes without the vault');
  assert.deepStrictEqual(sent.two?.selected, ['n3'], 'the second has its own cards');
  assert.strictEqual(sent.two?.read, true, 'and the vault added for it');
});

const flip = (chip: string) => page.click(strip(`[data-chip="${chip}"]${chip === 'vault' ? '' : ' .mcs-x'}`));
const setAccess = (ai: boolean, web: boolean) =>
  page.evaluate(
    ([ai, web]) => {
      const M = window.__fenmyr,
        grant = M.board.vaultAccess?.[0],
        box = document.querySelector<HTMLInputElement>('[data-set="webAccess"]');
      if (!grant || !box) throw new Error('no vault grant or web setting');
      grant.ai = ai;
      box.checked = web;
      box.dispatchEvent(new Event('change', { bubbles: true }));
      M.applyToolbar();
    },
    [ai, web] as const,
  );
const sentSince = async (n: number) => {
  await page.waitForFunction(n => Reflect.get(window, 'sent').length > n, n);
  const all: Sent[] = await page.evaluate(() => Reflect.get(window, 'sent'));
  return all.slice(n);
};
const sentCount = () => page.evaluate(() => Reflect.get(window, 'sent').length);
const tap = (name: RegExp) => page.getByRole('button', { name }).last().click();

await check('a queued question goes without a vault or the web taken away before its turn', async () => {
  const zero = page.evaluate(() => window.__fenmyr.ask('slow first'));
  await page.waitForFunction(() => Reflect.get(window, 'sent').some((s: Sent) => s.q.endsWith('slow first')));
  await flip('vault');
  const queued = page.evaluate(() => window.__fenmyr.ask('taken away: what do I know about cloudberries?'));
  await setAccess(false, false);
  await page.evaluate(() => Reflect.get(window, 'release')());
  await Promise.all([zero, queued]);
  const all: Sent[] = await page.evaluate(() => Reflect.get(window, 'sent'));
  const s = all.findLast(x => x.q.includes('taken away'));
  assert.strictEqual(s?.notes, 0, 'no notes from the vault whose access was taken away');
  assert.strictEqual(s?.web, false, 'and no web once it was turned off');
  await setAccess(true, true);
});

await check('"Yes, make it" asks again with the chips the question had', async () => {
  await page.evaluate(() => {
    window.__fenmyr.selectOnly(['n1', 'n2']);
    window.__fenmyr.applyToolbar();
  });
  await flip('sel');
  await flip('web');
  await flip('vault');
  const n = await sentCount();
  await asked('CONFIRM cloudberries');
  const [first] = await sentSince(n);
  assert.deepStrictEqual(
    [first?.selected, first?.web, (first?.notes ?? 0) > 0],
    [[], false, true],
    'the question goes without the cards and the web, with the vault',
  );
  await tap(/Yes, make it/);
  const [again] = await sentSince(n + 1);
  assert.ok(again?.confirmed, 'it asks again to make it');
  assert.deepStrictEqual(
    [again?.selected, again?.web, (again?.notes ?? 0) > 0],
    [[], false, true],
    'with the same chips, not the strip as it is now',
  );
});

await check('"Search my vault" keeps the chips the question had and adds the vault', async () => {
  await page.evaluate(() => {
    window.__fenmyr.selectOnly(['n1', 'n2']);
    window.__fenmyr.applyToolbar();
  });
  await flip('sel');
  await flip('web');
  const n = await sentCount();
  await asked('OFFER cloudberries');
  const [first] = await sentSince(n);
  assert.deepStrictEqual(
    [first?.selected, first?.web, first?.notes],
    [[], false, 0],
    'the question goes as the strip said',
  );
  await tap(/Search my vault/);
  const [again] = await sentSince(n + 1);
  assert.deepStrictEqual(
    [again?.selected, again?.web, (again?.notes ?? 0) > 0],
    [[], false, true],
    'asking again keeps the cards and the web out, and reads the vault',
  );
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
});

await check('the header says Not signed in until an answer comes back', async () => {
  await asked('SIGNIN hello');
  assert.strictEqual(await status(), 'Not signed in');
  await asked('hello again');
  assert.strictEqual(await status(), 'Ready');
});

assert.deepStrictEqual(l.errors, []);
await l.close();

// without Claude Code the header says so before anything is asked
const PATH = (process.env.PATH ?? '')
  .split(':')
  .filter(p => !p.startsWith(os.homedir()))
  .join(':');
const bare = await launch({ boards: [replyBoard('bare', 'Bare')], open: 'bare', env: { PATH } });
await bare.page.click('#mPill');
await bare.page.waitForFunction(() => document.getElementById('mcStatus')?.textContent === 'Needs Claude Code');
assert.deepStrictEqual(bare.errors, []);
await bare.close();
console.log('SEES OK');
