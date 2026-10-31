// Fails on undeclared names in modules that skip type checking. ES modules are strict, so assigning to one throws at runtime.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(import.meta.dirname, '..');
const WINDOW_GLOBALS = new Set(['Fenmyr', 'Icon', 'Goo', 'FenmyrEditor', 'FenmyrDocx']);
const UNDECLARED = new Set([2304, 2552]);

const { config } = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
const host = ts.createCompilerHost(options);
const read = host.readFile.bind(host);
host.readFile = file => read(file)?.replace('// @ts-nocheck', '');
const program = ts.createProgram(
  fileNames.filter(f => f.includes('/src/web/') && fs.existsSync(f)),
  options,
  host,
);

const found = program
  .getSourceFiles()
  .filter(sf => sf.fileName.includes('/src/web/'))
  .flatMap(sf => program.getSemanticDiagnostics(sf))
  .filter(d => UNDECLARED.has(d.code) && d.file && d.start !== undefined)
  .map(d => {
    const name = d.file?.text.slice(d.start, (d.start ?? 0) + (d.length ?? 0)) ?? '';
    const line = d.file?.getLineAndCharacterOfPosition(d.start ?? 0).line ?? 0;
    return { name, where: `${path.relative(ROOT, d.file?.fileName ?? '')}:${line + 1}` };
  })
  .filter(x => !WINDOW_GLOBALS.has(x.name));

for (const x of found) console.log(`undeclared ${x.name}: ${x.where}`);
if (found.length) process.exit(1);
