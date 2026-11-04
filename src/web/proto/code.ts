import type { Board } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { closeOnOutsidePress, keepOnScreen } from '../ui/popover.ts';
import { valuesText } from './values.ts';

// The code pane: what a developer needs to build the prototype again. Fenmyr's own wiring in a React prototype (the
// page that loads it, the file that starts React, the controls' store) stays out of the list until All files, and the
// controls show as Values rather than as tweaks.json. Files sit in a row of tabs while they fit, a dropdown when not.
const VALUES = ':values';
const WIRING = new Set(['index.html', 'src/main.tsx', 'src/tweaks.ts', 'src/tweaks.json']);

let shown = '';
let all = false;
// the width the tabs need on one row, measured when they're drawn
let needed = 0;
let watching = false;

// styles.css counts once it holds more than Tailwind's import: a theme, or styles of the prototype's own
const ownStyles = (css: string) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import\s+["']tailwindcss["'][^;]*;/g, '')
    .trim() !== '';

const labelOf = (f: string) => (f === VALUES ? 'Values' : f.replace(/^src\//, ''));
const folderOf = (f: string) => {
  const l = labelOf(f);
  return f === VALUES || !l.includes('/') ? '' : l.slice(0, l.lastIndexOf('/'));
};

function fitBar() {
  const el = $('pr-code'),
    bar = el.querySelector<HTMLElement>('.pc-bar');
  if (!bar) return;
  const acts = bar.querySelector<HTMLElement>('.pc-acts')?.offsetWidth ?? 0;
  el.classList.toggle('pc-many', needed > bar.clientWidth - 16 - acts - 6);
}

const closePicker = () => document.querySelector('.pc-menu')?.remove();

// The files as a menu under the picker: the same menu as a row's right-click menu, so it follows the theme
function openPicker(btn: Element, list: string[], choose: (f: string) => void) {
  closePicker();
  const groups = new Map<string, string[]>();
  for (const f of list) groups.set(folderOf(f), [...(groups.get(folderOf(f)) ?? []), f]);
  const items = [...groups]
    .map(([folder, fs]) => {
      const buttons = fs
          .map(f => {
            const name = esc(f),
              label = esc(labelOf(f).split('/').pop() ?? f),
              on = f === shown ? ' class="on"' : '';
            return `<button data-file="${name}"${on}>${label}</button>`;
          })
          .join(''),
        heading = esc(`${folder}/`);
      return folder ? `<span class="pc-group">${heading}</span>${buttons}` : buttons;
    })
    .join('');
  const m = document.createElement('div');
  m.className = 'row-menu pc-menu';
  m.innerHTML = items;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  Object.assign(m.style, { left: `${r.left}px`, top: `${r.bottom + 4}px`, minWidth: `${r.width}px` });
  keepOnScreen(m);
  m.querySelector<HTMLElement>('.on')?.focus();
  m.onclick = e => {
    const f = closestTo(e.target, '[data-file]')?.dataset.file;
    if (!f) return;
    closePicker();
    choose(f);
  };
  m.onkeydown = e => {
    if (e.key === 'Escape') closePicker();
  };
}

function copyShown(btn: Element) {
  const text = $('pr-code').querySelector('.pc-text code')?.textContent ?? '';
  navigator.clipboard
    .writeText(text)
    .then(() => {
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = 'Copy';
      }, 1500);
    })
    .catch(() => {});
}

async function showFile(root: string, dir: string, file: string) {
  shown = file;
  const el = $('pr-code');
  for (const b of el.querySelectorAll<HTMLElement>('[data-file]')) b.classList.toggle('on', b.dataset.file === file);
  const pick = el.querySelector('.pc-pick');
  if (pick) pick.textContent = labelOf(file);
  const read = (f: string) => Fenmyr.protoRead({ root, dir, file: f });
  const text = await (file === VALUES ? read('src/tweaks.json').then(valuesText) : read(file)).catch(e =>
    e instanceof Error ? e.message : String(e),
  );
  const view = el.querySelector('.pc-text code');
  if (view) view.textContent = text;
}

// what the pane lists: every file in a plain HTML prototype, which is all its own; the prototype's code otherwise
async function entries(root: string, dir: string, react: boolean, files: string[]) {
  if (!react) return { list: files, hidden: 0 };
  const css = files.includes('src/styles.css')
    ? await Fenmyr.protoRead({ root, dir, file: 'src/styles.css' }).catch(() => '')
    : '';
  const code = files.filter(f => !WIRING.has(f) && (f !== 'src/styles.css' || ownStyles(css)));
  const values = files.includes('src/tweaks.json') ? [VALUES] : [];
  return { list: [...(all ? files : code), ...values], hidden: files.length - code.length };
}

export async function renderCode(b: Board) {
  const el = $('pr-code'),
    root = rootOf(b);
  if (b.kind !== 'prototype' || !root) {
    el.innerHTML =
      '<p class="pr-note">This prototype’s project isn’t linked to a repo, so there’s no code to show.</p>';
    return;
  }
  const { dir, stack } = b.proto;
  const files = await Fenmyr.protoFiles({ root, dir }).catch((): string[] => []);
  if (!files.length) {
    const where = esc(dir);
    el.innerHTML = `<p class="pr-note">There are no files in ${where} yet.</p>`;
    return;
  }
  const { list, hidden } = await entries(root, dir, stack === 'react', files);
  if (!list.includes(shown)) shown = list.find(f => /(^|\/)App\.tsx$/.test(f)) ?? list[0] ?? '';
  const tabs = list
    .map(f => {
      const name = esc(f),
        label = esc(labelOf(f));
      return `<button class="pc-file" data-file="${name}" title="${name}">${label}</button>`;
    })
    .join('');
  const allLabel = all ? 'Fewer files' : 'All files',
    toggle = hidden ? `<button class="pv-btn pc-all" title="Fenmyr’s own wiring too">${allLabel}</button>` : '';
  el.classList.remove('pc-many');
  el.innerHTML = `<div class="pc-bar"><div class="pc-files">${tabs}</div><button class="pv-btn pc-pick" aria-haspopup="menu"></button><div class="pc-acts"><button class="pv-btn pc-copy" title="Copy this file">Copy</button>${toggle}</div></div><pre class="pc-text"><code></code></pre>`;
  needed = el.querySelector('.pc-files')?.scrollWidth ?? 0;
  fitBar();
  if (!watching) {
    watching = true;
    new ResizeObserver(fitBar).observe(el);
    closeOnOutsidePress('.pc-menu, .pc-pick', closePicker);
  }
  el.onclick = e => {
    const f = closestTo(e.target, '[data-file]')?.dataset.file;
    if (f) showFile(root, dir, f);
    const pick = closestTo(e.target, '.pc-pick');
    if (pick)
      return document.querySelector('.pc-menu') ? closePicker() : openPicker(pick, list, f => showFile(root, dir, f));
    const copy = closestTo(e.target, '.pc-copy');
    if (copy) copyShown(copy);
    if (closestTo(e.target, '.pc-all')) {
      all = !all;
      renderCode(b);
    }
  };
  await showFile(root, dir, shown);
}
