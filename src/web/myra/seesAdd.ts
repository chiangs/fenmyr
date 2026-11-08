import { FILE_KINDS, MAX_FILES, refusal, tooMany } from '../../shared/askFiles.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { boardMenu, when } from '../features/export.ts';
import { closestTo } from '../ui/dom.ts';
import { aiGrants, openVaultPicker } from '../vault/ask.ts';
import { say } from './say.ts';
import { addToNext, filesInNext } from './seesStrip.ts';

// Add, at the end of the "Myra sees" strip: pictures, text files or a vault note for the next message only. Files are
// checked here so a wrong one is refused at once; the host checks them again before Claude Code sees them.

const ACCEPT = [...FILE_KINDS.picture.exts, ...FILE_KINDS.text.exts].map(e => `.${e}`).join(',');

const asDataURL = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => (typeof r.result === 'string' ? res(r.result) : rej(new Error('unreadable')));
    r.onerror = () => rej(r.error ?? new Error('unreadable'));
    r.readAsDataURL(f);
  });

async function take(files: readonly File[]) {
  const why = files.map(f => refusal(f.name, f.size)).find(w => w !== null),
    ok = files.filter(f => refusal(f.name, f.size) === null),
    room = Math.max(0, MAX_FILES - filesInNext()),
    kept = ok.slice(0, room);
  const told = why ?? (kept.length < ok.length ? tooMany : null);
  if (told) say(told, 6000);
  const read = await Promise.all(kept.map(async f => ({ name: f.name, data: await asDataURL(f).catch(() => '') })));
  addToNext(read.filter(f => f.data).map(f => ({ kind: 'file', id: uid(), ...f })));
}

function openAddMenu(at: Element, input: HTMLInputElement) {
  const r = at.getBoundingClientRect(),
    note = () =>
      openVaultPicker({
        grants: aiGrants,
        pick: async (g, n) => addToNext([{ kind: 'note', id: uid(), vault: g.vault, rel: n.rel, title: n.title }]),
      });
  boardMenu({ clientX: r.left, clientY: r.bottom + 4 }, [
    { label: 'Picture or file…', run: () => input.click() },
    ...when(aiGrants(session.board).length > 0, [{ label: 'Vault note…', run: note }]),
  ]);
}

// On a prototype board a pasted picture goes on the board instead (proto/chatPictures.ts). A file dropped on the chat
// still lands on the board, as it always has.
const forChat = (files: FileList | null | undefined) => {
  if (!Fenmyr.native) return [];
  const proto = document.body.classList.contains('proto');
  return [...(files ?? [])].filter(f => !(proto && f.type.startsWith('image/')));
};

export function initSeesAdd() {
  const chat = $('mChat'),
    input = document.createElement('input');
  input.type = 'file';
  input.id = 'mcFile';
  input.multiple = true;
  input.accept = ACCEPT;
  input.hidden = true;
  chat.appendChild(input);
  input.onchange = () => {
    take([...(input.files ?? [])]);
    input.value = '';
  };
  $('mcSees').addEventListener('click', e => {
    const b = closestTo(e.target, '.mcs-add');
    if (b) openAddMenu(b, input);
  });
  chat.addEventListener('paste', e => {
    const files = forChat(e.clipboardData?.files);
    if (!files.length) return;
    e.preventDefault();
    take(files);
  });
}
