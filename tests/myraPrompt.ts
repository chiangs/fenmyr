// What Myra is told about making boards, folders and projects: boards.create is in her reply format, and projects.create
// is said to open a dialog the person finishes, so she never claims to have made the project.
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
])
  assert.ok(prompt.includes(has), `her reply format keeps ${has}`);

const library = prompt.slice(prompt.indexOf('"library" is their whole Fenmyr'));
for (const says of [
  `"boards": {"create"} makes an empty board for each name (up to ${MAX_MADE})`,
  'cards in the same reply still go on the board they asked from',
  '"projects": {"create"} only opens the New project dialog',
  'nothing exists until they do, so say you have opened it, never that you made the project',
  'The app adds a line saying what it made',
])
  assert.ok(library.includes(says), `she is told: ${says}`);
assert.ok(
  prompt.includes('("timer", "stopTimer", "animate", "boards", "folders", "projects"), just do it'),
  'she makes them herself rather than pointing at the slash commands that do the same',
);
console.log('myraPrompt: ok');
