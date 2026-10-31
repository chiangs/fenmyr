// @ts-nocheck
import { $ } from '../core/dom.ts';

// ---------- Myra on the board ----------
// her hop: she jumps right up out of her pill, then squishes a little as she lands
export function hopMyra() {
  goo.hop();
  const c = $('goo');
  c.classList.remove('hopping');
  void c.offsetWidth;
  c.classList.add('hopping');
}
export let goo;
const SMALL = { headroom: 8 };
export let goos;
export function init24() {
  goo = Goo($('goo'), { headroom: 8 });
  // small Myras get room above them
  goos = [
    goo,
    Goo($('obGoo'), { headroom: 8 }),
    Goo($('obGoo2'), { headroom: 8 }),
    Goo($('coachGoo'), SMALL),
    Goo($('setGoo'), SMALL),
  ];
}
