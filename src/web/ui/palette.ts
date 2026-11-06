import { renderCard } from '../canvas/render.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { boardMenu } from '../features/export.ts';
import { chirp } from '../myra/say.ts';
import { addAtCenter } from '../panels/zoomMenu.ts';
import { colorOf, myColors } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { boardBg, openColor, palette } from './colorPicker.ts';
import { child } from './dom.ts';

export const PRESETS: Record<string, string[]> = {
  bg: ['#faf7f2', '#ffffff', '#fff8ef', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#1d1a16', '#232733', '#2c2620'],
  dot: ['#e4dccf', '#f2c9da', '#cfe8d9', '#cfe0f5', '#e6dcff', '#d8d2dd', '#3a332b', '#4a4452'],
  panel: ['#ffffff', '#fff8ef', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#28231d', '#2f2a36'],
  accent: ['#e88a24', '#ff8a5c', '#f3c84a', '#3fbf86', '#4aa3f0', '#9b7bff', '#3b342d'],
  cursor: ['#f6b45e', '#ffc8a6', '#f8e08a', '#a8e6c3', '#aed3ff', '#cdb8ff', '#ffffff', '#3b342d'],
};

const COLOR_TITLES: Record<string, string> = {
  bg: 'Board background',
  dot: 'Dots',
  panel: 'Panels',
  accent: 'Accent',
  cursor: 'Your cursor',
};

// open the wheel for a UI color; `forBoard` means just this board's background (from a right-click)
export function tintPicker(key: string, at: { x: number; y: number }, forBoard?: boolean) {
  const set = (hex: string) => {
    if (key === 'cursor') settings.cursor = hex;
    else if (forBoard) {
      session.board.bg = hex;
      save();
    } else myColors()[key] = hex;
    applySettings();
  };
  openColor({
    tint: true,
    title: forBoard ? 'This board’s background' : (COLOR_TITLES[key] ?? ''),
    hex: key === 'cursor' ? settings.cursor : forBoard ? boardBg() || colorOf('bg') : colorOf(key),
    presets: PRESETS[key] ?? [],
    at,
    apply: set,
    reset: () => {
      if (key === 'cursor') settings.cursor = '#f6b45e';
      else if (forBoard) {
        delete session.board.bg;
        save();
      } else delete myColors()[key];
      applySettings();
    },
  });
}

export function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  if (!palette().length) {
    el.innerHTML =
      '<div class="palette-empty">Custom colours for this board and Myra to use.<br>Add a Colour card from the toolbar, then choose Save to board colours</div>';
    return;
  }
  palette().forEach((p, i) => {
    const r = document.createElement('div');
    r.className = 'pal';
    r.title = 'Click to add to the board';
    const code = p.hex.slice(1);
    r.innerHTML = `<i style="background:${p.hex}"></i><span></span><small>${code}</small>`;
    r.title = 'Click to add it to the board. Right-click to rename, change or remove it';
    const name = child(r, 'span');
    name.textContent = p.name ?? '';
    const rename = () => {
      name.contentEditable = 'true';
      name.focus();
      getSelection()?.selectAllChildren(name);
      const done = () => {
        name.contentEditable = 'false';
        const v = (name.textContent ?? '').trim();
        if (v) {
          p.name = v;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === p.hex)
            .forEach(c => {
              c.label = v;
              renderCard(c);
            });
        }
        renderPalette();
        save();
      };
      name.onblur = done;
      name.onkeydown = ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          name.blur();
        }
        if (ev.key === 'Escape') {
          name.textContent = p.name ?? '';
          name.blur();
        }
        ev.stopPropagation();
      };
    };
    // change the color itself: color cards on the board that use it follow along
    const recolor = () => {
      const was = p.hex,
        rr = r.getBoundingClientRect();
      openColor({
        tint: true,
        title: `Change “${p.name}”`,
        hex: p.hex,
        presets: [
          p.hex,
          ...palette()
            .filter(x => x !== p)
            .map(x => x.hex),
        ].slice(0, 10),
        at: { x: rr.right + 12, y: rr.top - 60 },
        apply: hex => {
          const from = p.hex;
          p.hex = hex;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === from)
            .forEach(c => {
              c.hex = hex;
              renderCard(c);
            });
          child(r, 'i').style.background = hex;
          child(r, 'small').textContent = hex.slice(1);
          save();
        },
        reset: () => {
          const from = p.hex;
          p.hex = was;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === from)
            .forEach(c => {
              c.hex = was;
              renderCard(c);
            });
          renderPalette();
          save();
        },
      });
    };
    r.onclick = () => {
      if (name.isContentEditable) return;
      addAtCenter('swatch', { hex: p.hex, label: p.name });
    };
    r.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      boardMenu(e, [
        { label: 'Add to the board', run: () => addAtCenter('swatch', { hex: p.hex, label: p.name }) },
        { label: 'Rename', run: rename },
        { label: 'Change colour…', run: recolor },
        '-',
        {
          label: 'Remove from board colours',
          danger: true,
          run: () => {
            palette().splice(i, 1);
            renderPalette();
            save();
            chirp(`Removed “${p.name}” from this board's colours`, 2500);
          },
        },
      ]);
    };
    el.appendChild(r);
  });
}
