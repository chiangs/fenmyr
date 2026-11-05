import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

export type RawGraph = {
  files: { path: string; lines: number }[];
  /** typeOnly is true only when every import of `to` from `from` is `import type` */
  edges: { from: string; to: string; typeOnly: boolean }[];
  external: Map<string, Set<string>>;
};

const SOURCE = /\.(ts|tsx|js|mjs|cjs)$/;
// bundles and files other tools generate say nothing about how the code is organised
const SKIPPED = /(^|\/)node_modules\/|^(web\/vendor|web\/dist|dist)\/|^web\/(icons\/pack|licenses)\.js$/;
const TRIED = ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js'];

function sourceFiles(root: string): string[] {
  const listed = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed
    .split('\n')
    .filter(f => SOURCE.test(f) && !SKIPPED.test(f) && fs.existsSync(path.join(root, f)))
    .sort();
}

type Found = { spec: string; typeOnly: boolean };

function importsOf(file: string, text: string): Found[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Found[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const allTypes = !!named && ts.isNamedImports(named) && !clause.name && named.elements.every(e => e.isTypeOnly);
      found.push({ spec: node.moduleSpecifier.text, typeOnly: !!clause?.isTypeOnly || allTypes });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ spec: node.moduleSpecifier.text, typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) found.push({ spec: arg.text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const packageOf = (spec: string) =>
  spec
    .split('/')
    .slice(0, spec.startsWith('@') ? 2 : 1)
    .join('/');

// Reads every source file's import lines, so the graph is what the code does and not what anyone wrote down.
export function readGraph(root: string): RawGraph {
  const paths = sourceFiles(root),
    known = new Set(paths);
  const files: RawGraph['files'] = [];
  const edges = new Map<string, { from: string; to: string; typeOnly: boolean }>();
  const external = new Map<string, Set<string>>();
  for (const file of paths) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    files.push({ path: file, lines: text.split('\n').length });
    for (const { spec, typeOnly } of importsOf(file, text)) {
      if (spec.startsWith('.')) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
        const to = TRIED.map(x => base + x).find(c => known.has(c));
        if (!to) continue;
        const key = `${file}\u0001${to}`,
          was = edges.get(key);
        edges.set(key, { from: file, to, typeOnly: (was ? was.typeOnly : true) && typeOnly });
      } else if (!isBuiltin(spec)) {
        const pkg = packageOf(spec);
        external.set(pkg, (external.get(pkg) ?? new Set()).add(file));
      }
    }
  }
  return { files, edges: [...edges.values()], external };
}
