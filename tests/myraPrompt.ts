// What Myra is told about making boards, folders and projects: boards.create is in her reply format, and projects.create
// is said to open a dialog the person finishes, so she never claims to have made the project. Filing and moving make no
// project, and move's project is the one to look in first.
import assert from 'node:assert';
import { ask } from '../src/host/prompts.ts';
import { MAX_MADE } from '../src/shared/myraReply.ts';

const prompt = ask({
  request: 'make a board called Backlog',
  boardJSON: '{}',
  style: { name: 'Myra', chat: 'normal', emoji: true },
  commands: [{ cmd: 'board', arg: '[name]', desc: 'Add a board to this folder and open it' }],
  confirmed: false,
  mobbin: false,
  higgs: false,
  web: false,
  vaultNotes: [],
  vaultTasks: undefined,
  canVault: false,
  prototype: false,
  files: [],
  plan: undefined,
});

for (const has of [
  '"boards": {"create": ["board name"]}',
  '"projects": {"create": ["project name"]',
  '"folders": {"create": [{"name": "folder name", "project": "project name or null"}]',
  '"file": [{"folder": "folder name", "project": "an existing project\'s name, or null to take it out of its project"}]',
  '"move": [{"board": "board id", "folder": "folder name, or null to take it out of its folder", "project": "optional: an existing project\'s name, to look for the folder in first"}]',
])
  assert.ok(prompt.includes(has), `her reply format keeps ${has}`);

const library = prompt.slice(prompt.indexOf('"library" is their whole Fenmyr'));
for (const says of [
  `"boards": {"create"} makes an empty board for each name (up to ${MAX_MADE})`,
  'cards in the same reply still go on the board they asked from',
  '"projects": {"create"} only opens the New project dialog',
  'nothing exists until they do, so say you have opened it, never that you made the project',
  'The app adds a line saying what it made',
  'Moving a board into a folder that doesn\'t exist yet creates it, in the project you name in the move\'s "project"',
  '"file" and "move" never make a project: one you name must already be in "library"',
  'offer to start it; a yes leads to "projects": {"create"}',
  "a folder that isn't there is left out, never made",
  'and in "move" the project you name is looked in before that',
])
  assert.ok(library.includes(says), `she is told: ${says}`);
assert.ok(!library.includes('creates the project'), 'filing a folder into a project is no longer said to make it');
assert.ok(
  prompt.includes('("timer", "stopTimer", "animate", "boards", "folders", "projects"), just do it'),
  'she makes them herself rather than pointing at the slash commands that do the same',
);
console.log('myraPrompt: ok');
