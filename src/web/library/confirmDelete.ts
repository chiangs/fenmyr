import { esc } from '../ui/dom.ts';
import type { Kind, Thing } from './rowMenu.ts';

// the question before a delete: the same for a board, a folder and a project; only what is inside it differs
export function confirmDelete(kind: Kind, obj: Thing, n: number) {
  const canvases = n > 2 ? 'es' : '',
    boards = n === 1 ? '' : 's',
    inside =
      kind === 'board'
        ? n > 1
          ? ` and the ${n - 1} canvas${canvases} inside it`
          : ''
        : n
          ? ` and the ${n} board${boards} inside it`
          : '',
    name = esc(obj.name),
    question = `Delete “${name}”${inside}?`,
    label = `Delete “${name}”`;
  return `<p class="rm-q">${question}</p><p class="rm-sub">This can’t be undone.</p><div><button data-m="yes" class="danger solid" title="${label}"><span>${label}</span></button><button data-m="no">Cancel</button></div>`;
}
