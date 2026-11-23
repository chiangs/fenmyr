import { DEFAULTS, type ExportOptions } from '../../shared/fenmyrStrip.ts';
import { child, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { plural } from './homeTiles.ts';

// What there is to export, for the line at the top of the dialog and for which ticks it shows.
export type Found = {
  projects: number;
  folders: number;
  boards: number;
  canvases: number;
  pictures: number;
  memos: number;
  videos: number;
  videoBytes: number;
  chats: boolean;
  vaultNotes: number;
};
type Ask = { name: string; found: Found; native: boolean; sizeFor: (o: ExportOptions) => number };

function fmtSize(bytes: number) {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${Math.round(bytes / 1e6)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

const tick = (id: string, label: string, on: boolean) => {
  const checked = on ? ' checked' : '',
    words = esc(label);
  return `<label class="fc-row"><input type="checkbox" id="${id}"${checked}><span>${words}</span></label>`;
};

// What goes in the zip is asked with ticks, each shown only when there is something for it; the size follows them.
// Answers the options, or null when they change their mind.
export function askExport({ name, found, native, sizeFor }: Ask) {
  return new Promise<ExportOptions | null>(res => {
    const title = esc(`Export “${name}”`),
      rows = [
        native && found.videos
          ? tick('zxVideos', `Include videos (${fmtSize(found.videoBytes)})`, DEFAULTS.videos)
          : '',
        found.chats ? tick('zxChats', 'Include my chats with Myra', DEFAULTS.chats) : '',
        found.vaultNotes ? tick('zxVault', 'Include the text of vault notes', DEFAULTS.vaultText) : '',
      ].join(''),
      browserNote =
        !native && found.videos ? '<p class="set-note">Videos can’t go in a zip made in a browser.</p>' : '',
      d = showDialog(
        `<div class="tdlg" role="dialog" aria-modal="true" aria-label="${title}"><h3>${title}</h3><p class="set-note" id="zxWhat"></p>${rows}${browserNote}<p class="set-note">Vault links, repo links and a prototype’s code stay on this computer.</p><div class="tdlg-btns"><button class="set-btn" id="zxNo">Cancel</button><button class="set-btn hot" id="zxOk">Export…</button></div></div>`,
        'zipExport',
      );
    const on = (id: string) => d.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false;
    const options = (): ExportOptions => ({
      videos: native && (found.videos === 0 || on('zxVideos')),
      chats: on('zxChats'),
      vaultText: on('zxVault'),
    });
    const paint = () => {
      const o = options(),
        inner = found.canvases ? ` (${found.canvases} inside canvases)` : '',
        parts = [
          found.projects && plural(found.projects, 'project'),
          found.folders && plural(found.folders, 'folder'),
          `${plural(found.boards, 'board')}${inner}`,
          found.pictures && plural(found.pictures, 'picture'),
          found.memos && plural(found.memos, 'voice memo'),
          o.videos && found.videos && plural(found.videos, 'video'),
          `about ${fmtSize(sizeFor(o))}`,
        ];
      child(d, '#zxWhat').textContent = parts.filter(Boolean).join(' · ');
    };
    const done = (o: ExportOptions | null) => {
      d.remove();
      res(o);
    };
    paint();
    d.onchange = paint;
    d.onclick = e => {
      const id = e.target instanceof Element ? e.target.id : '';
      if (e.target === d || id === 'zxNo') done(null);
      if (id === 'zxOk') done(options());
    };
    d.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Escape') done(null);
    };
    child(d, '#zxOk').focus();
  });
}
