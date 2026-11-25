// Myra has a look of her own for each kind of work: a question she is answering gives her the thinking look and a build
// the laptop, for as long as each runs, and every other job its own, the newest job's look winning. Each look draws
// its own prop, which slides in and is put away as the work ends, stays when calm mode or reduced motion stills her,
// and goes when a docked chat is too narrow for it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { repo } = freshRepo('fenmyr-busy-looks-');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const l = await launch({ boards: [replyBoard('b', 'Board')], open: 'b', claude: true });
const { page } = l;
const standIn = buildStandIn(l);

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const look = () => page.evaluate(() => window.__fenmyr.busyLook());
const lookIs = async (want: string | null, what: string) => {
  await page.waitForFunction(w => window.__fenmyr.busyLook() === w, want, { timeout: 15000 }).catch(() => {});
  assert.strictEqual(await look(), want, what);
};

// How many pixels of `hex` a sprite of her own draws for `look`, `ms` after the look began; still: calm, room: false
// for a narrow docked chat, away: put away `ms` before.
type Frame = { look: string | null; hex: string; ms: number; still?: boolean; room?: boolean; away?: boolean };
const pixels = (f: Frame) =>
  page.evaluate(f => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 56;
    const goo = window.Goo(c, { headroom: 8, manual: true }),
      LOOKS = ['thinking', 'reading', 'explaining', 'painting', 'writing', 'building'] as const,
      chosen = LOOKS.find(n => n === f.look) ?? null;
    goo.busy(chosen);
    if (f.away) goo.busy(null);
    goo.room(f.room ?? true);
    window.myraCalm = !!f.still;
    // after a blink, so her eyes are open
    goo.draw(performance.now() + f.ms);
    window.myraCalm = false;
    const g = c.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    const d = g.getImageData(0, 0, c.width, c.height).data,
      want = [1, 3, 5].map(i => parseInt(f.hex.slice(i, i + 2), 16));
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === want[0] && d[i + 1] === want[1] && d[i + 2] === want[2]) n++;
    return n;
  }, f);
// a colour only each look's prop has
const PROP: Record<string, string> = {
  thinking: '#fffdf7',
  reading: '#c0533e',
  explaining: '#45302a',
  painting: '#7a4a2a',
  writing: '#4f6fcf',
  building: '#9aa3ad',
};

try {
  await check('each look draws its own prop, which no other look and no resting sprite has', async () => {
    for (const [name, hex] of Object.entries(PROP)) {
      assert.ok((await pixels({ look: name, hex, ms: 600 })) > 0, `${name} draws its prop`);
      assert.strictEqual(await pixels({ look: null, hex, ms: 600 }), 0, `resting has no ${name} prop`);
      for (const other of Object.keys(PROP).filter(o => o !== name))
        assert.strictEqual(await pixels({ look: other, hex, ms: 600 }), 0, `${other} has no ${name} prop`);
    }
  });

  await check('a prop slides in as the work starts and is put away as it ends', async () => {
    const hex = PROP.building ?? '';
    const early = await pixels({ look: 'building', hex, ms: 60 }),
      full = await pixels({ look: 'building', hex, ms: 600 }),
      leaving = await pixels({ look: 'building', hex, ms: 60, away: true }),
      gone = await pixels({ look: 'building', hex, ms: 600, away: true });
    assert.ok(early < full, `the laptop is partly up at first: ${early} of ${full}`);
    assert.ok(leaving > 0 && leaving < full, `going down as she puts it away: ${leaving}`);
    assert.strictEqual(gone, 0, 'and gone once put away');
  });

  await check('calm mode keeps each prop, still', async () => {
    for (const [name, hex] of Object.entries(PROP)) {
      const a = await pixels({ look: name, hex, ms: 400, still: true }),
        b = await pixels({ look: name, hex, ms: 1300, still: true });
      assert.ok(a > 0, `${name} keeps its prop in calm mode`);
      assert.strictEqual(a, b, `${name}'s prop doesn't move in calm mode`);
    }
  });

  await check('reduced motion keeps each prop, still', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      for (const [name, hex] of Object.entries(PROP)) {
        const a = await pixels({ look: name, hex, ms: 400 }),
          b = await pixels({ look: name, hex, ms: 1300 });
        assert.ok(a > 0 && a === b, `${name}'s prop stays, still: ${a} then ${b}`);
      }
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });

  await check('with no room, no prop is drawn', async () => {
    for (const [name, hex] of Object.entries(PROP))
      assert.strictEqual(await pixels({ look: name, hex, ms: 600, room: false }), 0, `${name} draws no prop`);
  });

  await check('each kind of job gives her its look, the newest winning, and none once they end', async () => {
    const kinds = [
      [{ kind: 'reading', notes: 2 }, 'reading'],
      [{ kind: 'pictures', n: 1 }, 'painting'],
      [{ kind: 'rewriting' }, 'writing'],
      [{ kind: 'explaining', board: 'b', name: 'Board' }, 'explaining'],
    ] as const;
    // every job started here, ended whatever the check finds, so one left running doesn't change the checks after it
    const endAll = () =>
      page.evaluate(() => {
        const jobs: unknown = Reflect.get(window, 'jobs');
        if (Array.isArray(jobs))
          for (const job of jobs)
            if (job && typeof job === 'object' && 'end' in job && typeof job.end === 'function') job.end();
        Reflect.set(window, 'jobs', []);
      });
    try {
      for (const [busy, want] of kinds) {
        await page.evaluate(b => Reflect.set(window, 'jobs', [window.__fenmyr.startJob(b)]), busy);
        await lookIs(want, `${busy.kind} gives her the ${want} look`);
        await endAll();
        await lookIs(null, `and none once ${busy.kind} ends`);
      }
      await page.evaluate(() => {
        const M = window.__fenmyr;
        Reflect.set(window, 'jobs', [M.startJob({ kind: 'rewriting' }), M.startJob({ kind: 'pictures', n: 2 })]);
      });
      await lookIs('painting', 'the newest job gives her its look');
    } finally {
      await endAll();
    }
    await lookIs(null, 'and none once both end');
  });

  await check('a question she is answering gives her the thinking look until her answer is in', async () => {
    await page.evaluate(() => {
      window.Fenmyr.ask = () =>
        new Promise(ok => Reflect.set(window, 'answer', () => ok(JSON.stringify({ say: 'Here you go.' }))));
      void window.__fenmyr.ask('what next?');
    });
    // answered whatever the check finds, so a question left out doesn't hold up the build after it
    try {
      await lookIs('thinking', 'she thinks while the question is out');
    } finally {
      await page.evaluate(() => {
        const answer: unknown = Reflect.get(window, 'answer');
        if (typeof answer === 'function') answer();
      });
    }
    await lookIs(null, 'and stops once her answer is in');
  });

  await check('a build gives her the laptop while it runs, put away with a happy face when it is built', async () => {
    await page.evaluate(async repo => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
      await window.Fenmyr.save({
        id: 'pb',
        name: 'Checkout',
        folder: 'pf',
        kind: 'prototype',
        proto,
        cards: [],
        links: [],
        tray: [],
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('pb');
      window.__fenmyr.forgetReactions();
    }, repo);
    standIn.next({ files: { 'src/App.tsx': 'export const App = () => null;\n' }, hold: true, reply: 'Built.' });
    await page.evaluate(() =>
      window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Make it' } }, 'build it'),
    );
    await lookIs('building', 'the laptop is out while the build runs');
    standIn.release();
    await lookIs(null, 'and put away when it ends');
    await page.waitForFunction(() => window.__fenmyr.lastReaction().name === 'happy', null, { timeout: 15000 });
  });

  await check('a docked chat too narrow for a prop leaves her without one', async () => {
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.propRoom()), true, 'a wide docked chat has room');
    const d = await page.locator('.pr-div[data-d="chat"]').boundingBox();
    assert.ok(d, 'the docked chat’s divider is on screen');
    await page.mouse.move(d.x + d.width / 2, d.y + 10);
    await page.mouse.down();
    await page.mouse.move(d.x + 600, d.y + 10, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => !window.__fenmyr.propRoom(), null, { timeout: 5000 }).catch(() => {});
    const w = await page.evaluate(() => document.getElementById('mChat')?.offsetWidth);
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.propRoom()), false, `no room at ${w} px`);
  });
} finally {
  await l.close();
}
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('MYRA BUSY LOOKS OK');
