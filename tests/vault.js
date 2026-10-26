// The vault module on its own (no app): parsing a note, and the rules that keep private things unread.
//   node tests/vault.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'myra-vault-')); process.env.XDG_DATA_HOME = data;
const V = require('../linux/vault');
const sample = path.join(__dirname, 'sample-vault'), copy = path.join(data, 'vault'); fs.cpSync(sample, copy, { recursive: true });

const v = V.add(copy); assert.strictEqual(v.name, 'vault'); assert(v.obsidianFolder); assert.strictEqual(V.add(copy).id, v.id, 'adding twice keeps one');
const sc = V.scan(v); assert.strictEqual(sc.notes, 6); assert(sc.folders.includes('Projects/Bog Notes') && !sc.folders.some(f => f.startsWith('.')));

// parsing: frontmatter in three styles, inline tags, links, no tags from headings
const n = V.note(v, 'Projects/Bog Notes/Trip plan.md', ['']);
assert.deepStrictEqual(n.tags.sort(), ['cloudberries', 'today', 'trip']); assert.strictEqual(n.links, 2);
assert.deepStrictEqual(n.props.map(p => p[0]), ['status', 'project', 'due']); assert(n.excerpt.startsWith('Pack boots'));
assert.deepStrictEqual(V.note(v, 'Projects/Bog Notes/East bog.md', ['']).tags.sort(), ['cloudberries', 'place']);
assert.deepStrictEqual(V.note(v, 'Reading/Cloudberries.md', ['']).tags, ['reading']);

// full text only when asked for: frontmatter stripped, capped
assert.strictEqual(n.body, undefined, 'the preview never carries the whole note');
const nf = V.note(v, 'Projects/Bog Notes/Trip plan.md', [''], true); assert(nf.body.startsWith('# Trip plan') && !nf.body.includes('status: doing') && nf.body.includes('Related: [[Cloudberries]]') && !nf.truncated);
fs.writeFileSync(path.join(copy, 'Reading', 'Long.md'), 'x'.repeat(30000)); const nl = V.note(v, 'Reading/Long.md', [''], true); assert.strictEqual(nl.body.length, 20000); assert(nl.truncated);
fs.rmSync(path.join(copy, 'Reading', 'Long.md'));
// grants: only the folders allowed
assert.throws(() => V.note(v, 'Daily/2026-10-20.md', ['Projects']), /blocked/);
assert.doesNotThrow(() => V.note(v, 'Projects/Bog Notes/East bog.md', ['Projects']));
assert.throws(() => V.note(v, 'Projects/Bog Notes/East bog.md', []), /blocked/, 'no folders allowed means nothing');
// off-limits folders and #private win over any grant
V.update(v.id, { off: ['Private'] }); const v2 = V.byId(v.id);
assert.throws(() => V.note(v2, 'Private/Diary.md', ['']), /blocked/);
assert.throws(() => V.note(v2, 'Ideas/Secret.md', ['']), /blocked/);
const all = V.list(v2, [''], '').map(x => x.rel); assert(!all.includes('Private/Diary.md') && !all.includes('Ideas/Secret.md') && all.length === 4, all.join());
assert.deepStrictEqual(V.list(v2, ['Projects'], 'trip').map(x => x.title), ['Trip plan']);
// paths that try to leave the vault, hidden folders, other file types, and a link pointing outside
for (const bad of ['../outside.md', 'Projects/../../outside.md', '.obsidian/app.json', '/etc/passwd']) assert.throws(() => V.note(v2, bad, ['']), /blocked|missing/, bad);
fs.writeFileSync(path.join(data, 'outside.md'), 'outside'); fs.symlinkSync(path.join(data, 'outside.md'), path.join(copy, 'Daily', 'link.md'));
assert.throws(() => V.note(v2, 'Daily/link.md', ['']), /missing/, 'a symlink out of the vault is not followed');
// the Obsidian link
assert.strictEqual(V.obsidianURL(v2, 'Projects/Bog Notes/Trip plan.md'), 'obsidian://open?vault=vault&file=Projects%2FBog%20Notes%2FTrip%20plan');
// opening a file follows the same rules
assert.strictEqual(path.basename(V.fileFor(v2, 'Projects/Bog Notes/Trip plan.md', [''])), 'Trip plan.md');
assert.throws(() => V.fileFor(v2, 'Ideas/Secret.md', ['']), /blocked/); assert.throws(() => V.fileFor(v2, 'Private/Diary.md', ['']), /blocked/); assert.throws(() => V.fileFor(v2, 'Daily/2026-10-20.md', ['Projects']), /blocked/);
V.remove(v.id); assert.strictEqual(V.vaults().length, 0);
console.log('VAULT OK');
