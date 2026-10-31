// Counts what the codebase is paying down and fails when any count goes up:
// files that skip type checking, `any`, `as` casts, files over the line limit, and logic inside markup templates.
// Lower the budget after paying some down: node tools/budget.ts --write
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const KINDS = ['uncheckedFiles', 'anys', 'casts', 'longFiles', 'markupLogic'] as const;
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
  return found;
}

const findings = files.flatMap(inspect);
const counts: Counts = { uncheckedFiles: 0, anys: 0, casts: 0, longFiles: 0, markupLogic: 0 };
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
for (const k of keys) console.log(`${k.padEnd(15)} ${String(counts[k]).padStart(5)} / ${budget[k]}`);
for (const k of over) for (const f of findings.filter(x => x.kind === k)) console.log(`  ${k}: ${f.file}:${f.line}`);
if (under.length) console.log(`Paid down ${under.join(', ')}: run node tools/budget.ts --write to lower the budget.`);
if (over.length) {
  console.log(`OVER BUDGET: ${over.join(', ')}`);
  process.exit(1);
}
