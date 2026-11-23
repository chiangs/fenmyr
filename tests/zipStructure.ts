// How a project and a folder are carried in a Fenmyr zip, with no app running: the table's rows for them (a project's repo
// and vault grants, a folder's prototyping kind) are cut on the way out and again on the way in, a cover is only read when
// it is a picture, and an id listed twice is read once.
import assert from 'node:assert';
import { STRIP, stripStructure } from '../src/shared/fenmyrStrip.ts';
import { foldersOut, projectsOut, readManifest } from '../src/shared/fenmyrZip.ts';
import type { Folder, Project } from '../src/shared/model.ts';
import { manifestFor } from './support/zipKit.ts';

const COVER = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const project: Project = {
  id: 'p1',
  name: 'Acme',
  color: 'mint',
  open: true,
  cover: COVER,
  repo: { path: '/home/me/acme', github: { owner: 'me', name: 'acme', account: 'me' } },
  vaults: [{ vault: 'v1', folders: ['a'], ai: true, write: true, writeTo: 'Myra' }],
};
const folder: Folder = {
  id: 'f1',
  name: 'Protos',
  project: 'p1',
  parent: null,
  open: true,
  cover: COVER,
  kind: 'prototyping',
};
const keys = (o: object) => Object.keys(o).sort();

assert.deepStrictEqual(
  [keys(project), keys(folder)],
  [
    ['color', 'cover', 'id', 'name', 'open', 'repo', 'vaults'],
    ['cover', 'id', 'kind', 'name', 'open', 'parent', 'project'],
  ],
  'a project and a folder with every field they have',
);
assert.deepStrictEqual(
  [
    STRIP.filter(r => r.from === 'project').flatMap(r => r.fields),
    STRIP.filter(r => r.from === 'folder').flatMap(r => r.fields),
  ],
  [['repo', 'vaults'], ['kind']],
  'the table says what a project and a folder lose',
);
assert.deepStrictEqual(
  [keys(stripStructure('project', project)), keys(stripStructure('folder', folder))],
  [
    ['color', 'cover', 'id', 'name', 'open'],
    ['cover', 'id', 'name', 'open', 'parent', 'project'],
  ],
  'the cut takes those and nothing else',
);
assert.deepStrictEqual(
  projectsOut([project]),
  [{ id: 'p1', name: 'Acme', color: 'mint', cover: COVER }],
  'a project goes with its name, colour and cover',
);
assert.deepStrictEqual(
  foldersOut([folder]),
  [{ id: 'f1', name: 'Protos', project: 'p1', parent: null, cover: COVER }],
  'a prototyping folder goes as an ordinary one',
);

// a zip made by hand can't carry them in, or anything else the manifest has no room for
const base = JSON.parse(JSON.stringify(manifestFor(['b1'])));
const handmade = readManifest({
  ...base,
  root: { kind: 'project', id: 'p1' },
  projects: [{ ...project, token: 'secret' }],
  folders: [{ ...folder, token: 'secret' }],
});
assert.ok(handmade.ok);
assert.deepStrictEqual(
  [handmade.value.projects, handmade.value.folders],
  [projectsOut([project]), foldersOut([folder])],
  'what is read is what an export would have written',
);
assert.ok(!/repo|vaults|prototyping|secret|\/home\/me/.test(JSON.stringify(handmade.value)), 'with none of it');

// a cover goes into a CSS url(), so only a picture the app made is read
for (const cover of [
  "x');background:red;/*",
  'https://example.com/x.png',
  'data:text/html;base64,AAAA',
  'data:image/svg+xml;base64,AAAA',
])
  assert.strictEqual(projectsOut([{ ...project, cover }])[0]?.cover, undefined, `${JSON.stringify(cover)} is not kept`);

// an id twice would give the walk over the folders a loop: the first of each is the one that counts
const twice = readManifest({
  ...base,
  root: { kind: 'folder', id: 'f1' },
  folders: [
    { id: 'f1', name: 'A', project: null, parent: null },
    { id: 'f1', name: 'B', project: null, parent: 'f1' },
  ],
});
assert.ok(twice.ok);
assert.deepStrictEqual(
  twice.value.folders.map(f => f.name),
  ['A'],
  'a folder listed twice is read once',
);

console.log('zipStructure ok');
