// The toolbar table: what reading it promises, checked on small tables of its own so that rearranging the shipped one
// never touches this test, then what the real app builds from the shipped one.
import assert from 'node:assert';
import { TOOLBAR, toolbarOf } from '../src/web/ui/toolbarTable.ts';

const t = (id: string, priority?: number) => ({ id, label: id, icon: id, priority });
const ids = (xs: readonly { id: string }[]) => xs.map(x => x.id);

// the bar follows the lines, and a tool is in the group named above its line
const grouped = toolbarOf(['a', t('x'), t('y'), 'b', t('z')]);
assert.deepStrictEqual(
  grouped.tools.map(x => `${x.group}/${x.id}`),
  ['a/x', 'a/y', 'b/z'],
  'the tools come in line order, each in the group above its line',
);
assert.deepStrictEqual(ids(toolbarOf(['a', t('y'), t('x')]).tools), ['y', 'x'], 'moving a line moves the tool');
assert.strictEqual(grouped.tool('y')?.group, 'a', 'y starts in a');
assert.strictEqual(
  toolbarOf(['a', t('x'), 'b', t('y'), t('z')]).tool('y')?.group,
  'b',
  'moving its line under another name moves the tool to that group',
);
assert.strictEqual(grouped.tool('nope'), undefined, 'an id the table does not have is not a tool');

// the mistakes types can't catch say which line to look at
assert.throws(() => toolbarOf(['a', t('x'), t('x')]), /"x"/, 'an id twice names the id');
assert.throws(() => toolbarOf(['a', 'b', t('x')]), /"a"/, 'a group with no tools names the group');
assert.throws(() => toolbarOf(['a', t('x'), 'b']), /"b"/, 'a last group with no tools names the group');
assert.throws(() => toolbarOf(['a', t('x'), 'a', t('y')]), /"a"/, 'a group named twice names the group');

// no priority: from the end of the bar the person sees, and a hidden tool is not in it
const plain = toolbarOf(['a', t('x'), t('y'), t('z')]);
assert.deepStrictEqual(plain.tuckOrder(['x', 'y', 'z']), ['z', 'y', 'x'], 'with no priority the last tucks first');
assert.deepStrictEqual(plain.tuckOrder(['z', 'x', 'y']), ['y', 'x', 'z'], 'a personal order tucks from its own end');
assert.deepStrictEqual(plain.tuckOrder(['x', 'z']), ['z', 'x'], 'a switched-off tool is not in the bar');
// priority: the lowest first, and of equal priority the last in the bar
assert.deepStrictEqual(
  toolbarOf(['a', t('x', -1), t('y'), t('z')]).tuckOrder(['x', 'y', 'z']),
  ['x', 'z', 'y'],
  'a lower priority tucks before the rest, which tuck from the end',
);
assert.deepStrictEqual(
  toolbarOf(['a', t('x'), t('y'), t('z', 1)]).tuckOrder(['x', 'y', 'z']),
  ['y', 'x', 'z'],
  'a higher priority stays after the rest',
);
assert.deepStrictEqual(
  toolbarOf(['a', t('x', 1), t('y', 1), t('z')]).tuckOrder(['x', 'y', 'z']),
  ['z', 'y', 'x'],
  'tools of equal priority tuck from the end',
);

// the three hand edits the table's header describes, made to one table: the bar, its groups and its tuck order follow
const before = toolbarOf(['a', t('x'), t('y'), 'b', t('z')]),
  after = toolbarOf(['a', t('x', 1), t('z'), 'b', t('y')]);
assert.deepStrictEqual(ids(before.tools), ['x', 'y', 'z']);
assert.deepStrictEqual(ids(after.tools), ['x', 'z', 'y'], 'the lines moved, so the bar did');
assert.deepStrictEqual([before.tool('z')?.group, after.tool('z')?.group], ['b', 'a'], 'z moved to the group above it');
assert.deepStrictEqual(before.tuckOrder(ids(before.tools)), ['z', 'y', 'x']);
assert.deepStrictEqual(after.tuckOrder(ids(after.tools)), ['y', 'z', 'x'], 'x was given priority, so it tucks last');

// whatever arrangement ships, the tuck order covers the bar exactly once
const shipped = ids(TOOLBAR.tools);
assert.deepStrictEqual([...TOOLBAR.tuckOrder(shipped)].sort(), [...shipped].sort(), 'every tool tucks once');

console.log('toolbarTable: ok');
