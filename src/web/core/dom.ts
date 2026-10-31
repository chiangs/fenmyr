// @ts-nocheck

export const $ = id => document.getElementById(id);
export let stage;
export let world;
export let cardsEl;
export let wires;
export let grid;
export function init1() {
  stage = $('stage');
  world = $('world');
  cardsEl = $('cards');
  wires = $('wires');
  grid = $('grid');
}
