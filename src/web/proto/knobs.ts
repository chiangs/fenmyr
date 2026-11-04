import { openColor } from '../ui/colorPicker.ts';
import { type ColourFormat, readColour, writeColour } from '../ui/colourFormat.ts';
import { esc } from '../ui/dom.ts';

// The prototype's controls from its src/tweaks.json, drawn above the preview the same way in every prototype. Moving
// one changes the preview at once; nothing is saved until Keep these values. A custom control is the prototype's own
// and shows inside the frame instead; its changes still come back here to be kept.
type Knob =
  | { kind: 'choice'; label: string; options: string[]; value: string }
  | { kind: 'number'; label: string; min: number; max: number; step: number; unit: string; value: number }
  | { kind: 'text'; label: string; value: string }
  | { kind: 'colour'; label: string; value: string }
  | { kind: 'toggle'; label: string; value: boolean }
  | { kind: 'custom'; label: string; value: unknown };

let knobs: Record<string, Knob> = {};
let current: Record<string, unknown> = {};
let saved = '';
let where: { root: string; dir: string } | null = null;
// the format each colour control is written in, HSL until the person picks another
const formats: Record<string, ColourFormat> = {};

const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const str = (x: unknown, d = '') => (typeof x === 'string' ? x : d);

// tweaks.json is the prototype's own file, so each entry is checked here and one it can't read is left out
function readKnob(x: unknown): Knob | null {
  if (typeof x !== 'object' || x === null) return null;
  const t: Record<string, unknown> = { ...x },
    label = str(t.label, 'Control');
  switch (t.kind) {
    case 'choice': {
      const options = Array.isArray(t.options) ? t.options.filter(o => typeof o === 'string') : [];
      return options.length ? { kind: 'choice', label, options, value: str(t.value, options[0]) } : null;
    }
    case 'number':
      return {
        kind: 'number',
        label,
        min: num(t.min, 0),
        max: num(t.max, 100),
        step: num(t.step, 1),
        unit: str(t.unit),
        value: num(t.value, num(t.min, 0)),
      };
    case 'text':
      return { kind: 'text', label, value: str(t.value) };
    case 'colour':
      return { kind: 'colour', label, value: readColour(str(t.value)) ? str(t.value) : '#000000' };
    case 'toggle':
      return { kind: 'toggle', label, value: t.value === true };
    case 'custom':
      return { kind: 'custom', label, value: t.value };
    default:
      return null;
  }
}

const field = (key: string, k: Exclude<Knob, { kind: 'custom' }>) => {
  const label = esc(k.label),
    name = esc(key);
  switch (k.kind) {
    case 'choice': {
      const buttons = k.options
        .map(o => {
          const v = esc(o),
            on = o === current[key] ? ' on' : '';
          return `<button class="kb-opt${on}" data-k="${name}" data-v="${v}">${v}</button>`;
        })
        .join('');
      return `<div class="kb"><span>${label}</span><div class="seg">${buttons}</div></div>`;
    }
    case 'number': {
      const v = num(current[key], k.value),
        shown = esc(`${v}${k.unit}`);
      return `<label class="kb"><span>${label}<b>${shown}</b></span><input type="range" data-k="${name}" min="${k.min}" max="${k.max}" step="${k.step}" value="${v}"></label>`;
    }
    case 'text': {
      const v = esc(str(current[key], k.value));
      return `<label class="kb"><span>${label}</span><input type="text" data-k="${name}" value="${v}"></label>`;
    }
    case 'colour': {
      const hex = readColour(str(current[key], k.value)) ?? '#000000',
        shown = esc(writeColour(hex, formats[key] ?? 'hsl'));
      return `<div class="kb"><span>${label}<b>${shown}</b></span><button class="kb-colour" data-colour="${name}" style="background:${hex}" title="Choose a colour"></button></div>`;
    }
    case 'toggle': {
      const checked = current[key] === true ? ' checked' : '';
      return `<label class="kb kb-toggle"><span>${label}</span><input type="checkbox" class="tgl" data-k="${name}"${checked}></label>`;
    }
    default: {
      const unhandled: never = k;
      return unhandled;
    }
  }
};

const changed = () => JSON.stringify(current) !== saved;

// Reset and Keep, shown once something was moved; drawn on their own so a slider being dragged is never replaced
function drawActs(el: HTMLElement) {
  const acts = el.querySelector('.kb-acts');
  if (!acts) return;
  acts.innerHTML = changed()
    ? '<button class="pv-btn kb-reset">Reset</button><button class="pv-btn hot kb-keep">Keep these values</button>'
    : '';
}

function draw(el: HTMLElement) {
  const shown = Object.entries(knobs).flatMap(([key, k]) => (k.kind === 'custom' ? [] : [field(key, k)])),
    fields = shown.join('');
  el.hidden = !Object.keys(knobs).length;
  el.innerHTML = `${fields}<div class="kb-acts"></div>`;
  drawActs(el);
}

export function sendTweaks(frame: HTMLIFrameElement | null) {
  frame?.contentWindow?.postMessage({ fenmyrTweaks: current }, '*');
}

// after each build: the controls in tweaks.json, keeping what was moved but not yet kept
export async function loadKnobs(
  el: HTMLElement,
  at: { root: string; dir: string; files: string[] },
  frame: () => HTMLIFrameElement | null,
  kept: () => void,
) {
  const { root, dir, files } = at;
  where = { root, dir };
  const raw = files.includes('src/tweaks.json')
    ? await Fenmyr.protoRead({ root, dir, file: 'src/tweaks.json' }).catch(() => '{}')
    : '{}';
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {}
  const entries = typeof parsed === 'object' && parsed !== null ? Object.entries(parsed) : [];
  knobs = Object.fromEntries(
    entries.flatMap(([key, x]) => {
      const k = readKnob(x);
      return k ? [[key, k]] : [];
    }),
  );
  const before = current;
  current = Object.fromEntries(Object.entries(knobs).map(([key, k]) => [key, key in before ? before[key] : k.value]));
  saved = JSON.stringify(Object.fromEntries(Object.entries(knobs).map(([key, k]) => [key, k.value])));
  draw(el);
  el.oninput = e => {
    const input = e.target instanceof HTMLInputElement ? e.target : null,
      key = input?.dataset.k;
    if (!input || !key) return;
    current[key] =
      input.type === 'range' ? Number(input.value) : input.type === 'checkbox' ? input.checked : input.value;
    sendTweaks(frame());
    const k = knobs[key],
      readout = input.closest('.kb')?.querySelector('b');
    if (k?.kind === 'number' && readout) readout.textContent = `${current[key]}${k.unit}`;
    drawActs(el);
  };
  // the colour picker Fenmyr uses everywhere, in HSL unless the person picks RGB or hex
  const pickColour = (key: string, at: DOMRect) => {
    const k = knobs[key];
    if (k?.kind !== 'colour') return;
    const set = (hex: string) => {
      current[key] = writeColour(hex, formats[key] ?? 'hsl');
      sendTweaks(frame());
      draw(el);
    };
    openColor({
      tint: true,
      title: k.label,
      hex: readColour(str(current[key], k.value)) ?? '#000000',
      presets: [],
      at: { x: at.left, y: at.bottom + 8 },
      format: {
        value: formats[key] ?? 'hsl',
        pick: f => {
          formats[key] = f;
          set(readColour(str(current[key], k.value)) ?? '#000000');
        },
      },
      apply: set,
      reset: () => {
        current[key] = k.value;
        sendTweaks(frame());
        draw(el);
      },
    });
  };
  el.onclick = async e => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (t?.dataset.colour) return pickColour(t.dataset.colour, t.getBoundingClientRect());
    if (t?.dataset.k && t.dataset.v !== undefined) {
      current[t.dataset.k] = t.dataset.v;
      sendTweaks(frame());
      draw(el);
    }
    if (t?.classList.contains('kb-reset')) {
      current = { ...JSON.parse(saved) };
      sendTweaks(frame());
      draw(el);
    }
    if (t?.classList.contains('kb-keep') && where) {
      const next = Object.fromEntries(Object.entries(knobs).map(([key, k]) => [key, { ...k, value: current[key] }]));
      await Fenmyr.protoWriteTweaks({ ...where, json: JSON.stringify(next) });
      knobs = Object.fromEntries(
        Object.entries(knobs).map(([key, k]) => [key, readKnob({ ...k, value: current[key] }) ?? k]),
      );
      saved = JSON.stringify(current);
      draw(el);
      kept();
    }
  };
}

// a custom control inside the frame moved: its value is kept with the rest
export function tweakFromFrame(el: HTMLElement, key: string, value: string) {
  if (!(key in knobs)) return;
  try {
    current[key] = JSON.parse(value);
  } catch {
    return;
  }
  draw(el);
}
