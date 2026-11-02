import { cardEl } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { host } from './shapes.ts';
import { spotifyFill, spotifyOf } from './spotify.ts';
import { save } from '../core/history.ts';
import { removeSelected } from '../myra/helpers.ts';
import { session } from '../core/state.ts';
import type { CardOf } from '../../shared/model.ts';
import type { LinkPreview } from '../../shared/ops.ts';

// ---------- links: type or paste right into the card, then it fills in the site's name and picture ----------
export function wireLinkInput(c: CardOf<'link'>) {
  const el = cardEl(c.id),
    inp = el?.querySelector('.link-in input');
  if (!(inp instanceof HTMLInputElement) || inp.dataset.wired) return;
  inp.dataset.wired = '1';
  if (!c.loading)
    setTimeout(() => {
      inp.focus();
      inp.select();
    }, 20);
  inp.oninput = () => {
    c.draft = inp.value;
  };
  inp.onkeydown = async ev => {
    ev.stopPropagation();
    if (ev.key === 'Escape') {
      inp.blur();
      if (!inp.value.trim() && !c.title) {
        session.sel = new Set([c.id]);
        removeSelected();
      }
      return;
    }
    if (ev.key !== 'Enter' || !inp.value.trim()) return;
    const u = inp.value.trim(),
      url = /^https?:/i.test(u) || /^spotify:/i.test(u) ? u : 'https://' + u;
    if (spotifyOf(url)) {
      await spotifyFill(c, url);
      selectOnly([c.id]);
      return;
    }
    c.loading = true;
    renderCard(c);
    selectOnly([c.id]);
    let p: Partial<LinkPreview> = {};
    try {
      p = await Fenmyr.linkPreview(url);
    } catch {}
    Object.assign(c, {
      url,
      title: p.title || host(url),
      desc: p.desc || host(url),
      image: p.image || '',
      loading: false,
      draft: '',
    });
    c.h = c.image ? 210 : 52;
    renderCard(c);
    selectOnly([c.id]);
    save();
  };
}
