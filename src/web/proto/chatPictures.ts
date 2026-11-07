import { selectOnly } from '../canvas/wires.ts';
import { addImages } from '../cards/spotify.ts';
import { $ } from '../core/dom.ts';
import { say } from '../myra/say.ts';

// On a prototype board, pictures pasted or dropped into Myra's chat go on the board, selected, so she can use them as
// context for what she builds.
const onPrototype = () => document.body.classList.contains('proto');

async function take(files: FileList | undefined | null, e: Event) {
  const imgs = [...(files ?? [])].filter(f => f.type.startsWith('image/'));
  if (!onPrototype() || !imgs.length) return;
  e.preventDefault();
  e.stopPropagation();
  const made = await addImages(imgs, null);
  selectOnly(made.map(c => c.id));
  const them = imgs.length === 1 ? 'it' : 'them';
  say(`I put ${them} on the board and selected ${them}, so I'll use ${them} when I build ✦`, 6000);
}

export function initChatPictures() {
  const chat = $('mChat');
  chat.addEventListener('paste', e => take(e.clipboardData?.files, e));
  chat.addEventListener('dragover', e => {
    if (onPrototype() && e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  chat.addEventListener('drop', e => take(e.dataTransfer?.files, e));
}
