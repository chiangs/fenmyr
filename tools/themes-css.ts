// Writes web/themes.css from the theme table in src/web/settings/themes.ts: one block of variables per theme, which is
// the only place the core colours are defined. A theme is applied by the class on <body>, so switching is one class
// change. The table is where a colour is chosen and where the contrast tests and the solver read it; this file is what
// the page reads.
//
//   node tools/themes-css.ts            writes web/themes.css
//   node tools/themes-css.ts --check    fails if the file on disk isn't what the table gives (part of check:fast)
import fs from 'node:fs';
import path from 'node:path';
import { DERIVED } from '../src/web/settings/derived.ts';
import { CSS_VARS, THEMES, type Theme } from '../src/web/settings/themes.ts';

const FILE = path.resolve(import.meta.dirname, '..', 'web', 'themes.css');

// Default is :root and body.dark. Another theme is a class on <body>, written after them so it wins at the same weight,
// and a dark one also carries .dark so the rest of the stylesheet's dark rules still apply.
function selectorOf(t: Theme) {
  const name = t.id.replace(/-(light|dark)$/, '');
  if (name === 'default') return t.mode === 'dark' ? 'body.dark' : ':root';
  return `body.${t.mode === 'dark' ? 'dark.' : ''}theme-${name}`;
}

function blockOf(t: Theme) {
  const lines = Object.entries(CSS_VARS).map(([key, name]) => `  ${name}: ${Reflect.get(t.tokens, key)};`);
  for (const [key, card] of Object.entries(t.tokens.cards)) lines.push(`  --card-${key}: ${card.fill};`);
  // one link colour for every card; the table keeps one per card because a dark Snow card needs its own
  lines.push(`  --card-link: ${t.tokens.cards.butter?.link};`);
  return `${selectorOf(t)} {\n${lines.join('\n')}\n}`;
}

// The area colours made from the core ones. They sit on <body>, not :root: a variable is worked out where it is
// declared, so on <html> it would use the light core colours whatever theme or mode the page is in.
const derivedBlock = () => {
  const entries = Object.entries(DERIVED),
    light = entries.map(([name, e]) => `  ${name}: ${Array.isArray(e) ? e[0] : e};`).join('\n'),
    // a colour that keeps its old dark value is a constant there, so it can't be a mix
    dark = entries.flatMap(([name, e]) => (Array.isArray(e) ? [`  ${name}: ${e[1]};`] : [])).join('\n');
  return `body {\n${light}\n}\nbody.dark {\n${dark}\n}`;
};

const themesCss = () =>
  `/* Written by tools/themes-css.ts from src/web/settings/themes.ts. Change the table, not this file. */\n${[...THEMES.map(blockOf), derivedBlock()].join('\n')}\n`;

if (process.argv[2] === '--check') {
  if (!fs.existsSync(FILE) || fs.readFileSync(FILE, 'utf8') !== themesCss()) {
    console.error('web/themes.css is out of date. Run: node tools/themes-css.ts');
    process.exit(1);
  }
  console.log('themes.css matches the theme table');
} else {
  fs.writeFileSync(FILE, themesCss());
  console.log(`wrote ${path.relative(process.cwd(), FILE)}`);
}
