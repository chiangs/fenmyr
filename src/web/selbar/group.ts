import type { CardType } from '../../shared/cardTypes.ts';
import type { Card, CardOf } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { closestTo } from '../ui/dom.ts';
import type { SelBarContext } from './context.ts';
import { selCards } from './selected.ts';

/** One group on the selection bar: what it acts on in this context, or null when it doesn't show; its markup, made
 *  from that alone; and its handlers, wired on the bar once. */
type Group<T> = {
  on: (ctx: SelBarContext) => T | null;
  html: (t: T) => string;
  init?: (place: () => void) => void;
};
export type BarGroup = { html: (ctx: SelBarContext) => string; init: (place: () => void) => void };

export const group = <T>(g: Group<T>): BarGroup => ({
  html: ctx => {
    const t = g.on(ctx);
    return t === null ? '' : g.html(t);
  },
  init: g.init ?? (() => {}),
});

type Cards = [Card, ...Card[]];
const nonEmpty = (cs: Card[]): cs is Cards => cs.length > 0;
const isOf = <K extends CardType>(c: Card, type: K): c is CardOf<K> => c.type === type;

/** The selected cards while the bar is about them: not a connector, and not a picture being cropped. */
const cardsOf = (ctx: SelBarContext) => (ctx.kind === 'selection' && !ctx.crop ? ctx.cards : []);

/** The selected cards, when the bar is about cards. */
export const cards = (ctx: SelBarContext): Cards | null => {
  const cs = cardsOf(ctx);
  return nonEmpty(cs) ? cs : null;
};

/** Every selected card when each one passes. */
export const every =
  (test: (c: Card) => boolean) =>
  (ctx: SelBarContext): Cards | null => {
    const cs = cardsOf(ctx);
    return nonEmpty(cs) && cs.every(test) ? cs : null;
  };

/** The selected cards that pass, when any do. */
export const some =
  (test: (c: Card) => boolean) =>
  (ctx: SelBarContext): Cards | null => {
    const cs = cardsOf(ctx).filter(test);
    return nonEmpty(cs) ? cs : null;
  };

/** Two or more selected cards. */
export const many = (ctx: SelBarContext): Cards | null => {
  const cs = cardsOf(ctx);
  return nonEmpty(cs) && cs.length > 1 ? cs : null;
};

/** The one selected card. */
export const one = (ctx: SelBarContext): Card | null => {
  const cs = cardsOf(ctx);
  return cs.length === 1 ? (cs[0] ?? null) : null;
};

/** The one selected card, when it is of this kind. */
export const only = <K extends CardType>(ctx: SelBarContext, type: K): CardOf<K> | null => {
  const c = one(ctx);
  return c && isOf(c, type) ? c : null;
};

/** A click on the bar on something carrying `data-<attr>`: its value, the selection (never empty, since the bar is up)
 *  and the element clicked. */
export function onBar(attr: string, run: (value: string, cs: Cards, el: HTMLElement) => void) {
  $('selbar').addEventListener('click', e => {
    const el = closestTo(e.target, `[data-${attr}]`, HTMLElement),
      value = el?.getAttribute(`data-${attr}`),
      cs = selCards();
    if (el && typeof value === 'string' && nonEmpty(cs)) run(value, cs, el);
  });
}
