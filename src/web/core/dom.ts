// Every id the app asks for is in index.html or was just created; the few optional lookups check the result.
export const $ = (id: string) => document.getElementById(id) as HTMLElement;
export let stage: HTMLElement;
export let world: HTMLElement;
export let cardsEl: HTMLElement;
export let wires: HTMLElement;
export let grid: HTMLElement;
export function init1() {
  stage = $('stage');
  world = $('world');
  cardsEl = $('cards');
  wires = $('wires');
  grid = $('grid');
}
