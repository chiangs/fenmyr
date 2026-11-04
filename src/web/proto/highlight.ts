import './prismManual.ts';
import Prism from 'prismjs';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-json.js';
import { esc } from '../ui/dom.ts';

// The code pane's colours: a prototype's file as highlighted markup, by its extension. A file Prism has no grammar
// for, or one too big to colour quickly, shows as plain text.
const LANGS: Record<string, string> = {
  tsx: 'tsx',
  ts: 'typescript',
  jsx: 'jsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  css: 'css',
  html: 'markup',
  svg: 'markup',
  json: 'json',
};
const MAX_CHARS = 200_000;

export function highlighted(file: string, text: string) {
  const lang = LANGS[file.split('.').pop() ?? ''] ?? '',
    grammar = Prism.languages[lang];
  return grammar && text.length <= MAX_CHARS ? Prism.highlight(text, grammar, lang) : esc(text);
}
