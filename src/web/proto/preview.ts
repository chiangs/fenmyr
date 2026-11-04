import type { Board } from '../../shared/model.ts';
import type { Proto } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { child, closestTo, esc, textField } from '../ui/dom.ts';
import { buildPreview } from './bundle.ts';
import { renderGitBar } from './gitbar.ts';
import { loadKnobs, sendTweaks, tweakFromFrame } from './knobs.ts';

// The preview pane: the prototype running in a frame that may run scripts and nothing else, at a device's width or any
// width dragged to, scaled down to fit when the pane is narrower. What happens inside comes back as a log.
type Device = NonNullable<Proto['device']>;
type Line = { kind: 'error' | 'log' | 'warn'; text: string };
const WIDTHS: Record<Device, number> = { phone: 390, tablet: 820, desktop: 1280 };
const DEVICES: Device[] = ['phone', 'tablet', 'desktop'];

let board: Extract<Board, { kind: 'prototype' }> | null = null;
let root = '';
let width = WIDTHS.phone;
let html = '';
let pointing = false;
// what went wrong and what was logged since the last build, newest last
const log: Line[] = [];

// the errors, for Myra to fix with her next change
export const previewErrors = () =>
  log
    .filter(l => l.kind === 'error')
    .map(l => l.text)
    .join('\n');

// other parts of the page post messages too, so this can run before any preview exists
const frame = () => document.querySelector<HTMLIFrameElement>('#pr-preview iframe');

function scale() {
  const stage = $('pr-preview').querySelector<HTMLElement>('.pv-stage'),
    box = $('pr-preview').querySelector<HTMLElement>('.pv-frame');
  if (!stage || !box) return;
  const s = Math.min(1, (stage.clientWidth - 24) / width),
    pct = Math.round(s * 100);
  box.style.width = `${width}px`;
  box.style.height = `${(stage.clientHeight - 24) / s}px`;
  box.style.transform = `scale(${s})`;
  const shown = pct < 100 ? `${width} px · ${pct}%` : `${width} px`;
  const readout = $('pr-preview').querySelector('.pv-w');
  if (readout) readout.textContent = shown;
  for (const b of $('pr-preview').querySelectorAll<HTMLElement>('[data-dev]'))
    b.classList.toggle(
      'on',
      WIDTHS[b.dataset.dev === 'tablet' ? 'tablet' : b.dataset.dev === 'desktop' ? 'desktop' : 'phone'] === width,
    );
}

function showLog() {
  const el = $('pr-preview').querySelector('.pv-log');
  if (!el) return;
  const rows = log
    .slice(-30)
    .map(l => {
      const text = esc(l.text),
        kind = l.kind;
      return `<div class="pv-line ${kind}">${text}</div>`;
    })
    .join('');
  el.innerHTML = rows;
  el.scrollTop = el.scrollHeight;
}

async function refreshPreview() {
  if (!board || !root) return;
  const { dir, stack } = board.proto;
  const files = await Fenmyr.protoFiles({ root, dir }).catch((): string[] => []);
  const built = await buildPreview(
    stack,
    files,
    file => Fenmyr.protoRead({ root, dir, file }),
    file => Fenmyr.protoModule({ root, file }),
  );
  log.length = 0;
  const problem = $('pr-preview').querySelector<HTMLElement>('.pv-error');
  if (built.kind === 'error') {
    log.push({ kind: 'error', text: built.message });
    if (problem) {
      problem.hidden = false;
      problem.textContent = `The preview couldn’t be built. ${built.message}`;
    }
  } else {
    if (problem) problem.hidden = true;
    html = built.html;
    const f = frame();
    await loadKnobs(child($('pr-preview'), '.pv-knobs'), { root, dir, files }, frame, () => {
      if (board) renderGitBar(board);
    });
    if (f) {
      // a fresh frame starts with the saved values, so it's given the ones moved but not yet kept
      f.onload = () => sendTweaks(f);
      f.srcdoc = html;
    }
  }
  showLog();
}

function setPointing(on: boolean) {
  pointing = on;
  frame()?.contentWindow?.postMessage({ fenmyrPoint: on }, '*');
  $('pr-preview').querySelector('[data-pv="point"]')?.classList.toggle('on', on);
}

// what the frame reports, and only from the frame
addEventListener('message', e => {
  const f = frame();
  if (!f || e.source !== f.contentWindow || typeof e.data !== 'object' || e.data === null) return;
  const d: Record<string, unknown> = e.data;
  if (d.fenmyrPreview !== true) return;
  const text = String(d.text ?? '').slice(0, 2000);
  if (d.type === 'error') log.push({ kind: 'error', text: d.where ? `${text} (${String(d.where)})` : text });
  if (d.type === 'console')
    log.push({ kind: d.level === 'error' ? 'error' : d.level === 'warn' ? 'warn' : 'log', text });
  if (d.type === 'tweak') tweakFromFrame(child($('pr-preview'), '.pv-knobs'), String(d.key), String(d.value));
  if (d.type === 'point') {
    const field = textField('mcInput'),
      said = text ? ` “${text}”` : '';
    field.value = `${field.value}${field.value ? ' ' : ''}[this: ${String(d.selector)}${said}] `;
    field.focus();
    setPointing(false);
  }
  if (log.length > 200) log.splice(0, log.length - 200);
  showLog();
});

function dragWidth(handle: HTMLElement) {
  handle.onpointerdown = e => {
    const start = width,
      x0 = e.clientX,
      s = Math.min(1, ((handle.closest<HTMLElement>('.pv-stage')?.clientWidth ?? width) - 24) / width);
    handle.setPointerCapture(e.pointerId);
    handle.onpointermove = m => {
      width = Math.round(Math.max(240, Math.min(1920, start + (m.clientX - x0) / s)));
      scale();
    };
    handle.onpointerup = () => {
      handle.onpointermove = null;
    };
  };
}

export async function renderPreview(b: Board) {
  const el = $('pr-preview');
  root = rootOf(b) ?? '';
  if (b.kind !== 'prototype' || !root) {
    board = null;
    el.innerHTML = '<p class="pr-note">This prototype’s project isn’t linked to a repo, so there’s nothing to run.</p>';
    return;
  }
  if (board?.id !== b.id) width = WIDTHS[b.proto.device ?? (b.proto.stack === 'html' ? 'desktop' : 'phone')];
  board = b;
  const devices = DEVICES.map(d => {
    const label = `${d.charAt(0).toUpperCase()}${d.slice(1)}`;
    return `<button data-dev="${d}">${label}</button>`;
  }).join('');
  el.innerHTML = `<div class="pv-bar"><div class="seg pv-dev">${devices}</div><span class="pv-w"></span><button class="pv-btn" data-pv="point" title="Click something in the preview to point Myra at it">Point</button><button class="pv-btn" data-pv="refresh">Refresh</button><button class="pv-btn" data-pv="open">Open in browser</button></div><div class="pv-knobs" hidden></div><div class="pv-stage"><div class="pv-frame"><iframe sandbox="allow-scripts" title="Prototype preview"></iframe><div class="pv-handle" title="Drag to any width"></div></div><p class="pv-error" hidden></p></div><div class="pv-log"></div>`;
  el.onclick = e => {
    const dev = closestTo(e.target, '[data-dev]')?.dataset.dev,
      act = closestTo(e.target, '[data-pv]')?.dataset.pv;
    const d = DEVICES.find(x => x === dev);
    if (d) {
      width = WIDTHS[d];
      scale();
    }
    if (act === 'point') setPointing(!pointing);
    if (act === 'refresh') refreshPreview();
    if (act === 'open' && html) Fenmyr.previewOpen({ html, name: b.name || 'prototype' });
  };
  dragWidth(child(el, '.pv-handle'));
  new ResizeObserver(scale).observe(child(el, '.pv-stage'));
  pointing = false;
  scale();
  await refreshPreview();
}
