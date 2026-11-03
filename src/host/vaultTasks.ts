// Unfinished tasks from Obsidian notes (markdown checkboxes), for requests like "gather my open tasks". Same rules as every vault read:
// only the allowed folders, never an off-limits folder or a #private note. The app collects them here so Claude gets the tasks, not a few notes cut short.
import fs from 'node:fs';
import type { Vault, VaultTask, VaultTasks } from '../shared/ops.ts';
import { isPrivate, parseNote, reachable, STOP, titleOf, walk } from './vault.ts';

const TASK = /^(\s*)[-*+]\s+\[(.)\]\s+(.*\S)\s*$/u;
const HEADING = /^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/;
// date marks of the Tasks plugin (due, scheduled, start, created, done, cancelled) and Dataview fields; only the due date is kept
const DUE = /(?:\u{1F4C5}\s*|\bdue::?\s*)(\d{4}-\d{2}-\d{2})/iu;
const MARKS =
  /[\u{1F4C5}⏳\u{1F6EB}✅➕❌]\s*\d{4}-\d{2}-\d{2}|[[(]?\b(?:due|scheduled|start|created|completion|cancelled)::?\s*\d{4}-\d{2}-\d{2}[\])]?/giu;
// words of the request itself, not of the notes: they must not decide which tasks match
const ASK_WORDS = new Set(
  'task tasks todo todos checklist checklists completed complete finished unfinished incomplete open done kanban board boards column columns hierarchy related add added adds take keep same try put make gather collect list notes note vault everything anything where that are not all them any want need please'.split(
    ' ',
  ),
);

type Node = { indent: number; done: boolean; doing: boolean; text: string; due?: string; kids: Node[] };
const strip = (t: string) =>
  t
    .replace(MARKS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

// the top-level tasks of one note, each with its sub-tasks; a done task only counts when something under it is still open
function parse(src: string) {
  const out: (Node & { heading: string })[] = [];
  let heading = '',
    stack: Node[] = [];
  for (const raw of src.split('\n')) {
    const h = HEADING.exec(raw);
    if (h) {
      heading = (h[1] ?? '').trim();
      stack = [];
      continue;
    }
    const m = TASK.exec(raw.replace(/\t/g, '    '));
    if (!m) {
      if (raw.trim() && !/^\s/.test(raw)) stack = [];
      continue;
    }
    const mark = m[2] ?? ' ';
    if (mark === '-') continue;
    const node: Node = {
      indent: (m[1] ?? '').length,
      done: mark === 'x' || mark === 'X',
      doing: mark === '/',
      text: strip(m[3] ?? ''),
      due: DUE.exec(m[3] ?? '')?.[1],
      kids: [],
    };
    let parent = stack[stack.length - 1];
    while (parent && parent.indent >= node.indent) {
      stack.pop();
      parent = stack[stack.length - 1];
    }
    if (parent) parent.kids.push(node);
    else out.push({ ...node, heading });
    stack.push(node);
  }
  return out;
}
const flat = (n: Node, depth = 1): { t: string; done: boolean; due?: string }[] =>
  n.kids.flatMap(k => [
    {
      t: (depth > 1 ? '↳ ' : '') + k.text + (k.doing ? ' (in progress)' : ''),
      done: k.done,
      due: k.done ? undefined : k.due,
    },
    ...flat(k, depth + 1),
  ]);

export function tasks(
  vault: Vault,
  allow: string[],
  query: string,
  { maxTasks = 300, maxChars = 14000, budgetMs = 8000 } = {},
): VaultTasks {
  const terms = [
      ...new Set(
        query
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter(t => t.length >= 3 && !STOP.has(t) && !ASK_WORDS.has(t)),
      ),
    ],
    t0 = Date.now(),
    found: (VaultTask & { mtime: number; hit: boolean })[] = [];
  let scanned = 0,
    stopped = false;
  walk(vault, x => {
    if (x.dir || !reachable(vault, x.rel, allow)) return;
    if (Date.now() - t0 > budgetMs) {
      stopped = true;
      return;
    }
    let src = '';
    try {
      src = fs.readFileSync(x.full, 'utf8').slice(0, 262144);
    } catch {
      return;
    }
    scanned++;
    if (!src.includes('[') || isPrivate(parseNote(src).tags)) return;
    const mtime = fs.statSync(x.full).mtimeMs;
    for (const n of parse(src)) {
      const kids = flat(n);
      if (n.done && !kids.some(k => !k.done)) continue;
      const due = n.due ?? kids.flatMap(k => (!k.done && k.due ? [k.due] : [])).sort()[0],
        task: VaultTask = {
          rel: x.rel,
          title: titleOf(x.rel),
          heading: n.heading,
          text: n.text + (n.doing ? ' (in progress)' : ''),
          kids: kids.slice(0, 30).map(({ t, done }) => ({ t, done })),
        };
      if (due) task.due = due;
      const hay = `${n.text} ${kids.map(k => k.t).join(' ')} ${n.heading} ${task.title} ${x.rel}`.toLowerCase();
      found.push({ ...task, mtime, hit: terms.some(t => hay.includes(t)) });
    }
  });
  const pool = terms.length ? found.filter(f => f.hit) : found;
  pool.sort((a, b) => b.mtime - a.mtime);
  const sent: VaultTask[] = [];
  let used = 0;
  for (const { mtime: _m, hit: _h, ...t } of pool) {
    const size = t.text.length + t.kids.reduce((n, k) => n + k.t.length, 0) + t.rel.length;
    if (sent.length >= maxTasks || used + size > maxChars) break;
    used += size;
    sent.push(t);
  }
  return {
    tasks: sent,
    open: found.length,
    sent: sent.length,
    notes: new Set(sent.map(t => t.rel)).size,
    scanned,
    stopped,
    filtered: terms.length > 0,
  };
}
