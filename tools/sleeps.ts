// Finds the fixed sleeps in a test file, for the budget. A test that sleeps a fixed time assumes the page has finished
// moving by then, and a loaded runner breaks that; waiting on state (tests/support/settled.ts) does not. Four ways to
// write one are counted: `waitForTimeout(...)`, `T.wait(...)` in the smoke test's page code, a promise that resolves from
// a `setTimeout` (also through a helper declared in the same file, counted at each call), and `settle(page, ms)`, which
// sleeps `ms` before it checks anything. A sleep that is the point of the test, such as a debounce or a timeout under
// test, is left out by this comment on the line directly above it, with the reason after the colon:
//   // sleeps on purpose: the chat saves 600 ms after the last key
import ts from 'typescript';

export const MARKER = 'sleeps on purpose';
const MARKER_LINE = new RegExp(`^\\s*//\\s*${MARKER}\\b:?\\s*(.*?)\\s*$`);

export type SleepStyle = 'waitForTimeout' | 'T.wait' | 'promise' | 'settle';
export type Sleep = { line: number; style: SleepStyle };
export type Found = { sleeps: Sleep[]; bareMarkers: number[] };

const isName = (n: ts.Node | undefined, name: string): boolean => !!n && ts.isIdentifier(n) && n.text === name;

const isFunction = (n: ts.Node | undefined): n is ts.ArrowFunction | ts.FunctionExpression =>
  !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));

// the expression a function gives back, when that is all it does
function returned(body: ts.ConciseBody | undefined): ts.Node | undefined {
  if (!body || !ts.isBlock(body)) return body;
  const only = body.statements.length === 1 ? body.statements[0] : undefined;
  return only && ts.isReturnStatement(only) ? only.expression : undefined;
}

// `new Promise(done => setTimeout(done, n))`, or the callback `() => done()`. A promise that hands over a value late,
// such as a stub of a slow fetch, is not a sleep.
function isSleepPromise(n: ts.Node | undefined): boolean {
  if (!n || !ts.isNewExpression(n) || !isName(n.expression, 'Promise')) return false;
  const executor = n.arguments?.[0];
  const done = isFunction(executor) ? executor.parameters[0]?.name : undefined;
  if (!isFunction(executor) || !done || !ts.isIdentifier(done)) return false;
  let sleeps = false;
  const look = (c: ts.Node) => {
    if (ts.isCallExpression(c) && isName(c.expression, 'setTimeout')) {
      const first = c.arguments[0];
      const callsDone = (f: ts.Node | undefined) =>
        isFunction(f) &&
        ts.isCallExpression(f.body) &&
        isName(f.body.expression, done.text) &&
        !f.body.arguments.length;
      if (isName(first, done.text) || callsDone(first)) sleeps = true;
    }
    ts.forEachChild(c, look);
  };
  look(executor.body);
  return sleeps;
}

// `const wait = ms => new Promise(...)`: its calls are the sleeps, so its body is not counted again
function helper(n: ts.Node): { name: string; body: ts.Node } | null {
  const named =
    ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && isFunction(n.initializer)
      ? { name: n.name.text, body: returned(n.initializer.body) }
      : ts.isFunctionDeclaration(n) && n.name
        ? { name: n.name.text, body: returned(n.body) }
        : null;
  return named?.body && isSleepPromise(named.body) ? { name: named.name, body: named.body } : null;
}

function styleOf(n: ts.Node, helpers: Set<string>, helperBodies: Set<ts.Node>): SleepStyle | null {
  if (ts.isNewExpression(n)) return isSleepPromise(n) && !helperBodies.has(n) ? 'promise' : null;
  if (!ts.isCallExpression(n)) return null;
  const callee = n.expression;
  if (ts.isPropertyAccessExpression(callee)) {
    if (callee.name.text === 'waitForTimeout') return 'waitForTimeout';
    return isName(callee.expression, 'T') && callee.name.text === 'wait' ? 'T.wait' : null;
  }
  if (!ts.isIdentifier(callee)) return null;
  if (helpers.has(callee.text)) return 'promise';
  return callee.text === 'settle' && n.arguments.length > 0 ? 'settle' : null;
}

export function findSleeps(sf: ts.SourceFile): Found {
  const lines = sf.text.split('\n');
  const helpers = new Set<string>(),
    helperBodies = new Set<ts.Node>();
  const collect = (n: ts.Node) => {
    const h = helper(n);
    if (h) {
      helpers.add(h.name);
      helperBodies.add(h.body);
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const reasonAbove = (line: number) => (lines[line - 2] ?? '').match(MARKER_LINE)?.[1] ?? '';
  const sleeps: Sleep[] = [];
  const visit = (n: ts.Node) => {
    const style = styleOf(n, helpers, helperBodies);
    const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (style && !reasonAbove(line)) sleeps.push({ line, style });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const bareMarkers = lines.flatMap((text, i) => (MARKER_LINE.exec(text)?.[1] === '' ? [i + 1] : []));
  return { sleeps, bareMarkers };
}
