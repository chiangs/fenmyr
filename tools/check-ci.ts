// Fails when a test that `npm test` runs has no step of its own in CI, or a CI step runs a test `npm test` skips.
// Three tests once ran only on the developer's machine because a new one was added to package.json alone.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = typeof pkg === 'object' && pkg !== null && 'scripts' in pkg ? pkg.scripts : null;
const script = typeof scripts === 'object' && scripts !== null && 'test' in scripts ? scripts.test : undefined;
if (typeof script !== 'string') throw new Error('package.json has no test script');

const local = new Set([...script.matchAll(/node (tests\/\S+\.ts)/g)].map(m => m[1]));
const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const steps = new Set([...ci.matchAll(/^\s*run: node (tests\/\S+\.ts)\s*$/gm)].map(m => m[1]));

const notInCi = [...local].filter(t => !steps.has(t));
const notLocal = [...steps].filter(t => !local.has(t));
for (const t of notInCi) console.log(`${t} runs in npm test but has no step in .github/workflows/ci.yml`);
for (const t of notLocal) console.log(`${t} has a CI step but npm test skips it`);
if (notInCi.length || notLocal.length) process.exit(1);
