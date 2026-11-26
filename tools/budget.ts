// Counts what the codebase is paying down and fails when any count goes up:
// files that skip type checking, `any`, `as` casts, files over the line limit, logic inside markup templates,
// raw colours in the stylesheet that should come from a variable, and `body.dark` rules, which a theme's token set
// should make unnecessary: a token that is one colour in light and another in dark replaces the pair of rules. Tests are
// also counted for fixed sleeps (tools/sleeps.ts), which should wait on the page's state instead, for a marker that
// excuses a sleep without saying why, and for an async predicate given to waitForFunction (tools/asyncWaits.ts), which
// Playwright doesn't await, so the wait ends at once.
// Lower the budget after paying some down: node tools/budget.ts --write
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { findAsyncWaits } from './asyncWaits.ts';
import { findSleeps, MARKER } from './sleeps.ts';

const KINDS = [
  'uncheckedFiles',
  'anys',
  'casts',
  'longFiles',
  'markupLogic',
  'rawColours',
  'darkRules',
  'fixedSleeps',
  'unexplainedSleeps',
  'asyncWaits',
] as const;
type Kind = (typeof KINDS)[number];
type Counts = Record<Kind, number>;
type Finding = { file: string; line: number; kind: Kind };

const ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET = path.join(ROOT, 'tools', 'budget.json');
const MAX_LINES = 400;
// Myra's prompts are text for a model; their <angle> words are not markup
const NOT_MARKUP = new Set(['src/host/prompts.ts']);
const MARKUP = /<\/?[a-zA-Z][\w-]*[\s>/]|<!doctype/i;

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src', 'tests', 'tools'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(f => f.endsWith('.ts') && !f.startsWith('tools/editor/') && fs.existsSync(path.join(ROOT, f)));

// a plain value: a name, or a chain of property reads off one
const isPlainValue = (e: ts.Expression): boolean =>
  ts.isIdentifier(e) || (ts.isPropertyAccessExpression(e) && isPlainValue(e.expression));

function inspect(file: string): Finding[] {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: Finding[] = [];
  const add = (node: ts.Node, kind: Kind) =>
    found.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, kind });
  if (/^\s*\/\/\s*@ts-nocheck/m.test(source)) found.push({ file, line: 1, kind: 'uncheckedFiles' });
  const lines = source.split('\n').length;
  if (lines > MAX_LINES) found.push({ file, line: lines, kind: 'longFiles' });
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) add(node, 'anys');
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && !ts.isConstTypeReference(node.type))
      add(node, 'casts');
    if (ts.isTemplateExpression(node)) {
      const text = [node.head.text, ...node.templateSpans.map(s => s.literal.text)].join('');
      if (!NOT_MARKUP.has(file) && MARKUP.test(text))
        for (const span of node.templateSpans) if (!isPlainValue(span.expression)) add(span.expression, 'markupLogic');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (file.startsWith('tests/')) {
    const { sleeps, bareMarkers } = findSleeps(sf);
    for (const s of sleeps) found.push({ file, line: s.line, kind: 'fixedSleeps' });
    for (const line of bareMarkers) found.push({ file, line, kind: 'unexplainedSleeps' });
    for (const line of findAsyncWaits(sf)) found.push({ file, line, kind: 'asyncWaits' });
  }
  return found;
}

// A colour is defined once, as a custom property (--ink: #3b342d), and used through var(). A hex, rgb() or hsl() value
// written straight into any other property is raw. Comments are blanked first, keeping their newlines for line numbers.
const STYLESHEETS = ['web/style.css'];
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(\s*[\d.]/g;
function rawColours(file: string): Finding[] {
  const css = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const found: Finding[] = [];
  // only inside a rule's braces: a selector like [style*="color: #302c26"] matches a literal in the page, and has to stay
  for (const block of css.matchAll(/\{([^{}]*)\}/g))
    for (const d of (block[1] ?? '').matchAll(/([^;:]+):([^;]*)/g)) {
      if (d[1]?.trim().startsWith('--')) continue;
      const line = css.slice(0, (block.index ?? 0) + 1 + (d.index ?? 0)).split('\n').length,
        n = (d[2] ?? '').match(RAW_COLOUR)?.length ?? 0;
      found.push(...Array.from({ length: n }, () => ({ file, line, kind: 'rawColours' as const })));
    }
  return found;
}

// a selector that starts from `body.dark`: it is a second rule for something the light rule already styles
function darkRules(file: string): Finding[] {
  const css = fs
    .readFileSync(path.join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    .replace(/\{[^{}]*\}/g, m => `{${m.replace(/[^\n]/g, '')}}`);
  return Array.from(css.matchAll(/body\.dark(?![\w-])/g), m => ({
    file,
    line: css.slice(0, m.index).split('\n').length,
    kind: 'darkRules' as const,
  }));
}

const findings = [...files.flatMap(inspect), ...STYLESHEETS.flatMap(rawColours), ...STYLESHEETS.flatMap(darkRules)];
const counts: Counts = {
  uncheckedFiles: 0,
  anys: 0,
  casts: 0,
  longFiles: 0,
  markupLogic: 0,
  rawColours: 0,
  darkRules: 0,
  fixedSleeps: 0,
  unexplainedSleeps: 0,
  asyncWaits: 0,
};
for (const f of findings) counts[f.kind]++;
const raw: unknown = fs.existsSync(BUDGET) ? JSON.parse(fs.readFileSync(BUDGET, 'utf8')) : {};
const saved = (k: Kind) => {
  const v = typeof raw === 'object' && raw !== null && k in raw ? Reflect.get(raw, k) : undefined;
  return typeof v === 'number' ? v : counts[k];
};
const budget: Counts = {
  uncheckedFiles: saved('uncheckedFiles'),
  anys: saved('anys'),
  casts: saved('casts'),
  longFiles: saved('longFiles'),
  markupLogic: saved('markupLogic'),
  rawColours: saved('rawColours'),
  darkRules: saved('darkRules'),
  fixedSleeps: saved('fixedSleeps'),
  unexplainedSleeps: saved('unexplainedSleeps'),
  asyncWaits: saved('asyncWaits'),
};
const keys = KINDS;

if (process.argv.includes('--write')) {
  const lowered = Object.fromEntries(keys.map(k => [k, Math.min(counts[k], budget[k])]));
  fs.writeFileSync(BUDGET, `${JSON.stringify(lowered, null, 2)}\n`);
  console.log('budget written', lowered);
  process.exit(0);
}
const over = keys.filter(k => counts[k] > budget[k]);
const under = keys.filter(k => counts[k] < budget[k]);
for (const k of keys) console.log(`${k.padEnd(17)} ${String(counts[k]).padStart(5)} / ${budget[k]}`);
// a new sleep is one among a thousand old ones, so list the ones in the files this branch touches
function touchedFiles(): Set<string> {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(
        '\n',
      );
    } catch {
      return [];
    }
  };
  return new Set([
    ...git('diff', '--name-only', 'HEAD'),
    ...git('ls-files', '-o', '--exclude-standard'),
    ...git('diff', '--name-only', 'origin/main...HEAD'),
  ]);
}
const touched = over.includes('fixedSleeps') ? touchedFiles() : new Set<string>();
for (const k of over) {
  const all = findings.filter(x => x.kind === k);
  const mine = k === 'fixedSleeps' ? all.filter(x => touched.has(x.file)) : [];
  for (const f of mine.length ? mine : all) console.log(`  ${k}: ${f.file}:${f.line}`);
}
if (under.length) console.log(`Paid down ${under.join(', ')}: run node tools/budget.ts --write to lower the budget.`);
if (over.length) {
  console.log(`OVER BUDGET: ${over.join(', ')}`);
  if (over.includes('fixedSleeps'))
    console.log(
      `A new fixed sleep: wait on the page instead (still() and rect() in tests/support/settled.ts, or waitForFunction). ` +
        `A sleep that is the point of the test takes "// ${MARKER}: <why>" on the line above it.`,
    );
  if (over.includes('unexplainedSleeps')) console.log(`A "// ${MARKER}" comment needs its reason after the colon.`);
  if (over.includes('asyncWaits'))
    console.log(
      "waitForFunction doesn't await its predicate, so an async one ends the wait at once: " +
        'poll a sync predicate that keeps the answer on the page.',
    );
  process.exit(1);
}
