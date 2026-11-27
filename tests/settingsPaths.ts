// Every path to a place in Settings ("Settings", an arrow, a tab, then more arrows and places) a person or a contributor can read names a place that exists: the first step one of the
// tabs, and each step after it a heading, a row's name or a button inside that tab in web/index.html. It reads the
// app's code and comments, the tests and tools, the docs, the issue forms, the skills, and only the newest section of
// WHATSNEW.md, whose older lines are left as they were written. A rename of a tab or a heading fails here until every
// path that names it moves too. Another program's settings ("System Settings → Privacy & Security") are not ours.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');

const ENTITIES: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>' };
const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-z]+);/g, (m, name: string) => ENTITIES[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

const tabsBand = html.match(/id="setTabs"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
const TABS = [...tabsBand.matchAll(/<button[^>]*data-tab="([a-z]+)"[^>]*>([^<]*)<\/button>/g)].map(m => ({
  id: m[1] ?? '',
  name: text(m[2] ?? ''),
}));
assert.ok(TABS.length >= 7, `found ${TABS.length} Settings tabs in web/index.html; the band's markup has changed`);

// what can follow a tab: its sections' headings, the names of their rows, and their buttons
const PLACES = new Map<string, string[]>(TABS.map(t => [t.id, []]));
for (const m of html.matchAll(/<section\b[^>]*\bdata-tab="([a-z]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
  const names = PLACES.get(m[1] ?? '');
  if (!names) continue;
  for (const el of (m[2] ?? '').matchAll(/<(h3|b|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const name = text(el[2] ?? '');
    if (name) names.push(name);
  }
}

const startsWith = (rest: string, names: readonly string[]) =>
  names.filter(n => rest.toLowerCase().startsWith(n.toLowerCase())).sort((a, b) => b.length - a.length)[0];

// The steps of one path, from just after "Settings". Bold and code marks around a step are dropped first.
function check(after: string): string | null {
  let rest = after.replace(/[*`]/g, '');
  const arrow = /^\s*→\s*/;
  const first = rest.match(arrow);
  if (!first) return null;
  rest = rest.slice(first[0].length);
  const tab = TABS.find(
    t =>
      t.name ===
      startsWith(
        rest,
        TABS.map(x => x.name),
      ),
  );
  if (!tab) return `no tab is called "${rest.slice(0, 30)}…"`;
  rest = rest.slice(tab.name.length);
  for (let step = rest.match(arrow); step; step = rest.match(arrow)) {
    rest = rest.slice(step[0].length);
    const place = startsWith(rest, PLACES.get(tab.id) ?? []);
    if (!place) return `${tab.name} has no heading, row or button called "${rest.slice(0, 30)}…"`;
    rest = rest.slice(place.length);
  }
  return null;
}

const tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(
    f =>
      /^(src|tools|tests)\/.*\.ts$/.test(f) ||
      /^(docs\/.*|[A-Z][A-Z-]*)\.md$/.test(f) ||
      /^\.github\/.*\.ya?ml$/.test(f) ||
      /^\.claude\/skills\/.*\.md$/.test(f) ||
      f === 'web/index.html',
  )
  .filter(f => !f.startsWith('tools/editor/') && fs.existsSync(path.join(ROOT, f)));

// only the newest section of WHATSNEW.md: from its first "## " to its second
const newest = (body: string) => {
  const lines = body.split('\n');
  const starts = lines.flatMap((l, i) => (l.startsWith('## ') ? [i] : []));
  return lines.map((l, i) => ((starts[0] ?? 0) <= i && i < (starts[1] ?? lines.length) ? l : ''));
};

const wrong: string[] = [];
let read = 0;
for (const file of tracked) {
  const body = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const lines = file === 'WHATSNEW.md' ? newest(body) : body.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/(\w+ )?Settings(?=\s*\**\s*→)/g)) {
      if (m[1] && /^(System|Windows|macOS) $/.test(m[1])) continue;
      read++;
      const why = check(line.slice((m.index ?? 0) + m[0].length));
      if (why) wrong.push(`${file}:${i + 1}: ${why}`);
    }
  });
}

assert.ok(read > 20, `read only ${read} Settings paths; the search has stopped finding them`);
assert.deepStrictEqual(wrong, [], `Settings paths that lead nowhere:\n${wrong.join('\n')}`);
console.log(`SETTINGS PATHS OK: ${read} paths, each a real tab and place`);
