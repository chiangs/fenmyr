// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { startTour } from './onboarding.ts';
import { $ } from '../core/dom.ts';

// ---------- what's new: a little card, once, the first time a new version opens ----------
// what's new in Fenmyr: one card per version (each item: [icon name, title, a line about it])
export const NEWS = {
  '1.0.0': [
    [
      'myra-tool',
      'Hello, I’m Myra',
      'I’m a cloudberry who lives in your boards, and I help you sort, plan and build ✦',
    ],
    [
      'palette',
      'Nordic colours',
      'Snow, Cloudberry, Lingonberry, Moss, Fjord, Heather and Birch for your cards, with warm amber shadows.',
    ],
  ],
};

// the button on each version's card: try the headline thing
const NEWS_TRY = { '1.0.0': ['Take the tour', () => startTour()] };

export const newsKey = 'fenmyr:newsSeen';

export async function maybeNews() {
  let v = null;
  try {
    v = await Fenmyr.version();
  } catch (e) {}
  if (!v) v = Object.keys(NEWS).pop();
  let seen = null;
  try {
    seen = localStorage.getItem(newsKey);
  } catch (e) {}
  try {
    localStorage.setItem(newsKey, v);
  } catch (e) {}
  // everything new since the version you last saw (a small fix release has no card of its own)
  const num = x =>
      String(x || '0')
        .replace(/^v/, '')
        .split('.')
        .map(n => +n || 0),
    after = (x, y) => {
      const a = num(x),
        b = num(y);
      for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
      return false;
    };
  const items = Object.keys(NEWS)
    .filter(k => (!seen || after(k, seen)) && !after(k, v))
    .flatMap(k => NEWS[k]);
  if (seen === v || !items.length) return;
  $('newsV').textContent = `Fenmyr ${v}`;
  $('newsList').innerHTML = items
    .map(
      ([e, t, d]) => `<li><span class="nw-e">${Icon(e)}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></li>`,
    )
    .join('');
  const tryK = Object.keys(NEWS_TRY)
      .filter(k => !after(k, v))
      .pop(),
    tr = NEWS_TRY[tryK];
  $('newsTry').textContent = tr[0];
  $('newsTry').onclick = () => {
    closeNews();
    tr[1]();
  };
  $('news').classList.add('on');
}

const closeNews = () => $('news').classList.remove('on');
export function init61() {
  $('newsOk').onclick = closeNews;

  $('news').onclick = e => {
    if (e.target === $('news')) closeNews();
  };
}
