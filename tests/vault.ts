// @ts-nocheck
// The vault module on its own (no app): parsing a note, and the rules that keep private things unread.
//   node tests/vault.ts
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-vault-'));
process.env.XDG_DATA_HOME = data;
const V = await import('../src/host/vault.ts');
const sample = path.join(import.meta.dirname, 'sample-vault'),
  copy = path.join(data, 'vault');
fs.cpSync(sample, copy, { recursive: true });

const v = V.add(copy);
assert.strictEqual(v.name, 'vault');
assert(v.obsidianFolder);
assert.strictEqual(V.add(copy).id, v.id, 'adding twice keeps one');
const sc = V.scan(v);
assert.strictEqual(sc.notes, 6);
assert(sc.folders.includes('Projects/Bog Notes') && !sc.folders.some(f => f.startsWith('.')));

// a folder's own folders come right after it, even when a sibling's name continues with a hyphen ("Tracking-Fitness" must not land between "Tracking" and "Tracking/01_Weekly")
{
  const tracked = path.join(data, 'tracked');
  for (const d of ['Tracking/01_Weekly', 'Tracking/02_Monthly', 'Tracking/10_Yearly', 'Tracking-Fitness/Runs'])
    fs.mkdirSync(path.join(tracked, d), { recursive: true });
  for (const d of ['Tracking/01_Weekly', 'Tracking-Fitness/Runs'])
    fs.writeFileSync(path.join(tracked, d, 'a.md'), '# a');
  const tv = V.add(tracked);
  assert.deepStrictEqual(V.scan(tv).folders, [
    'Tracking',
    'Tracking/01_Weekly',
    'Tracking/02_Monthly',
    'Tracking/10_Yearly',
    'Tracking-Fitness',
    'Tracking-Fitness/Runs',
  ]);
  V.remove(tv.id);
}

// unfinished tasks: open and in-progress ones come back with their sub-tasks and due date; done, cancelled, private and off-limits ones do not
{
  const T = await import('../src/host/vaultTasks.ts');
  const tv = path.join(data, 'tasks');
  fs.mkdirSync(path.join(tv, 'Tracking/01_Weekly'), { recursive: true });
  fs.mkdirSync(path.join(tv, 'Tracking/Secret'), { recursive: true });
  fs.writeFileSync(
    path.join(tv, 'Tracking/01_Weekly/2026-W44.md'),
    [
      '# Week 44',
      '## Gifts',
      '- [x] Send the report',
      '- [ ] Buy a gift for Ruth 📅 2026-12-20',
      '  - [x] Pick a shop',
      '  - [/] Wrap it',
      '    - [ ] Find the paper',
      '- [-] Cancelled thing for Max',
      '- [x] Done parent',
      '  - [ ] Still open under a done parent',
      '- [ ] Take the car in [due:: 2026-11-30]',
      '  - [ ] Book the garage',
      '## Later',
      '- [ ] Unrelated chore',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(tv, 'Tracking/Secret/p.md'), '- [ ] hidden xmas task');
  fs.writeFileSync(path.join(tv, 'Tracking/private.md'), '---\ntags: [private]\n---\n- [ ] private xmas task');
  const vt = V.add(tv);
  V.update(vt.id, { off: ['Tracking/Secret'] });
  const all = T.tasks(V.byId(vt.id), ['Tracking'], 'take all my unfinished tasks');
  const texts = all.tasks.map(t => t.text);
  assert(
    texts.includes('Buy a gift for Ruth') && texts.includes('Take the car in') && texts.includes('Unrelated chore'),
  );
  assert(
    !texts.some(x => /Send the report|Cancelled|hidden|private/.test(x)),
    'done, cancelled, off-limits and private tasks stay out',
  );
  assert(texts.includes('Done parent'), 'a done task with open sub-tasks is kept');
  const gift = all.tasks.find(t => t.text === 'Buy a gift for Ruth');
  assert.strictEqual(gift?.due, '2026-12-20');
  assert.strictEqual(gift?.heading, 'Gifts');
  assert.deepStrictEqual(gift?.kids, [
    { t: 'Pick a shop', done: true },
    { t: 'Wrap it (in progress)', done: false },
    { t: '↳ Find the paper', done: false },
  ]);
  assert.strictEqual(
    all.tasks.find(t => t.text === 'Take the car in')?.due,
    '2026-11-30',
    'a due:: field counts and is not left in the words',
  );
  assert.strictEqual(all.filtered, false);
  const some = T.tasks(
    V.byId(vt.id),
    ['Tracking'],
    'add a kanban board where all tasks related to xmas/ruth/max are added',
  );
  assert.deepStrictEqual(
    some.tasks.map(t => t.text),
    ['Buy a gift for Ruth'],
    'only tasks that match the names, not the words of the request',
  );
  assert(some.filtered && some.open > some.sent);
  assert.strictEqual(
    T.tasks(V.byId(vt.id), ['Elsewhere'], '').tasks.length,
    0,
    'outside the allowed folders nothing is read',
  );
  V.remove(vt.id);
}

// parsing: frontmatter in three styles, inline tags, links, no tags from headings
const n = V.note(v, 'Projects/Bog Notes/Trip plan.md', ['']);
assert.deepStrictEqual(n.tags.sort(), ['cloudberries', 'today', 'trip']);
assert.strictEqual(n.links, 2);
assert.deepStrictEqual(
  n.props.map(p => p[0]),
  ['status', 'project', 'due'],
);
assert(n.excerpt.startsWith('Pack boots'));
assert.deepStrictEqual(V.note(v, 'Projects/Bog Notes/East bog.md', ['']).tags.sort(), ['cloudberries', 'place']);
assert.deepStrictEqual(V.note(v, 'Reading/Cloudberries.md', ['']).tags, ['reading']);

// full text only when asked for: frontmatter stripped, capped
assert.strictEqual(n.body, undefined, 'the preview never carries the whole note');
const nf = V.note(v, 'Projects/Bog Notes/Trip plan.md', [''], true);
assert(
  nf.body.startsWith('# Trip plan') &&
    !nf.body.includes('status: doing') &&
    nf.body.includes('Related: [[Cloudberries]]') &&
    !nf.truncated,
);
fs.writeFileSync(path.join(copy, 'Reading', 'Long.md'), 'x'.repeat(30000));
const nl = V.note(v, 'Reading/Long.md', [''], true);
assert.strictEqual(nl.body.length, 20000);
assert(nl.truncated);
fs.rmSync(path.join(copy, 'Reading', 'Long.md'));
// grants: only the folders allowed
assert.throws(() => V.note(v, 'Daily/2026-10-20.md', ['Projects']), /blocked/);
assert.doesNotThrow(() => V.note(v, 'Projects/Bog Notes/East bog.md', ['Projects']));
assert.throws(() => V.note(v, 'Projects/Bog Notes/East bog.md', []), /blocked/, 'no folders allowed means nothing');
// off-limits folders and #private win over any grant
V.update(v.id, { off: ['Private'] });
const v2 = V.byId(v.id);
assert.throws(() => V.note(v2, 'Private/Diary.md', ['']), /blocked/);
assert.throws(() => V.note(v2, 'Ideas/Secret.md', ['']), /blocked/);
const all = V.list(v2, [''], '').map(x => x.rel);
assert(!all.includes('Private/Diary.md') && !all.includes('Ideas/Secret.md') && all.length === 4, all.join());
assert.deepStrictEqual(
  V.list(v2, ['Projects'], 'trip').map(x => x.title),
  ['Trip plan'],
);
// paths that try to leave the vault, hidden folders, other file types, and a link pointing outside
for (const bad of ['../outside.md', 'Projects/../../outside.md', '.obsidian/app.json', '/etc/passwd'])
  assert.throws(() => V.note(v2, bad, ['']), /blocked|missing/, bad);
fs.writeFileSync(path.join(data, 'outside.md'), 'outside');
fs.symlinkSync(path.join(data, 'outside.md'), path.join(copy, 'Daily', 'link.md'));
assert.throws(() => V.note(v2, 'Daily/link.md', ['']), /missing/, 'a symlink out of the vault is not followed');
// the Obsidian link
assert.strictEqual(
  V.obsidianURL(v2, 'Projects/Bog Notes/Trip plan.md'),
  'obsidian://open?vault=vault&file=Projects%2FBog%20Notes%2FTrip%20plan',
);
// search for Myra: only reachable, non-private notes matching the question, a few of them, each cut short
const sr = V.search(v2, ['Projects'], 'what do I know about cloudberries and the east bog?');
assert.deepStrictEqual(sr.map(x => x.title).sort(), ['East bog', 'Trip plan'], sr.map(x => x.title).join());
assert(sr.every(x => x.text.length <= 1500 && !('body' in x)));
assert.deepStrictEqual(
  V.search(v2, [''], 'cloudberries')
    .map(x => x.title)
    .sort(),
  ['Cloudberries', 'East bog', 'Trip plan'],
  'the private note and the off-limits folder never come back',
);
assert.deepStrictEqual(V.search(v2, [''], 'diary'), [], 'off-limits');
assert(
  !V.search(v2, [''], 'nobody should read this even though its folder is open').some(x => x.title === 'Secret'),
  '#private',
);
assert.deepStrictEqual(V.search(v2, [], 'cloudberries'), [], 'no folders allowed means nothing');
assert.deepStrictEqual(V.search(v2, [''], 'what is the'), [], 'only filler words');
assert.strictEqual(V.search(v2, [''], 'cloudberries', { max: 1 }).length, 1);
assert.strictEqual(
  V.search(v2, [''], 'cloudberries', { total: 40 }).reduce((n, x) => n + x.text.length, 0) <= 40,
  true,
);
V.remove(v.id);
assert.strictEqual(V.vaults().length, 0);
console.log('VAULT OK');
