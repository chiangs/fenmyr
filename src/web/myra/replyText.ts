import { parseReply } from '../../shared/myraReply.ts';
import { settings } from '../settings/settings.ts';
import { type MyraReply } from '../../shared/myraReply.ts';
import { type Card } from '../../shared/model.ts';

// emojis off means off: the prompt asks, and this makes sure (her own ✦ isn't an emoji, so it stays)
export const noEmoji = (t: string) =>
  settings.emoji
    ? t
    : String(t)
        .replace(/(\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(\uFE0F|\u200D|\u20E3|[\u{1F3FB}-\u{1F3FF}])*/gu, '')
        .replace(/ {2,}/g, ' ')
        .trim();

export const parse = (raw: unknown): MyraReply => {
  const s = String(raw),
    a = s.indexOf('{'),
    b = s.lastIndexOf('}');
  if (a < 0) return { say: s.trim() };
  try {
    return parseReply(JSON.parse(s.slice(a, b + 1)));
  } catch (e) {
    return { say: s.trim() };
  }
};

export function guessNext(r: MyraReply, added: Card[]) {
  const has = (t: string) => added.some(c => c.type === t);
  if (r.screens?.length)
    return added.some(c => c.type === 'box' && c.img)
      ? ['Make the mobile version', 'Try a different colour style', 'Write the real copy']
      : ['Add the next screen', 'Make it a website too', 'Try a different style'];
  if (has('font')) return ['Pair these with colours', 'Show them on a landing page', 'Narrow it down to two'];
  if (has('swatch')) return ['Pick fonts that match', 'Build a page in these colours'];
  if (has('todo')) return ['Break it into smaller steps', 'Put dates on it'];
  if (added.length >= 3) return ['Group these by theme', 'What am I missing?', 'Turn this into a plan'];
  return [];
}
