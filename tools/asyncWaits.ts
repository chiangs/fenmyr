// Finds the waitForFunction calls in a test file whose predicate is async, for the budget. Playwright calls the predicate
// without awaiting it, so an async one returns a promise, which is truthy, and the wait ends at once and waits for nothing.
import ts from 'typescript';

const isAsyncFunction = (n: ts.Node | undefined): boolean =>
  !!n &&
  (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
  !!n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);

export function findAsyncWaits(sf: ts.SourceFile): number[] {
  const lines: number[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === 'waitForFunction' &&
      isAsyncFunction(n.arguments[0])
    )
      lines.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return lines;
}
