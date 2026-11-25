import { $ } from '../core/dom.ts';
import { elementById } from '../ui/dom.ts';

const canvas = (id: string) => elementById(id, HTMLCanvasElement);

// ---------- Myra on the board ----------
// her hop: she jumps right up out of her pill, then squishes a little as she lands
export function hopMyra() {
  goo.hop();
  const c = $('goo');
  c.classList.remove('hopping');
  void c.offsetWidth;
  c.classList.add('hopping');
}
// Myra on the board, the one the other modules move
export let goo: ReturnType<typeof Goo>;
const SMALL = { headroom: 8 };
export let goos: ReturnType<typeof Goo>[] = [];
// the small Myra in the chat's header, wherever she doesn't sit there herself (on a phone): she makes the faces and
// wears the looks the one on the board does, with no room for a prop
function mirrored(main: ReturnType<typeof Goo>, head: ReturnType<typeof Goo>): ReturnType<typeof Goo> {
  head.room(false);
  return {
    ...main,
    hop() {
      main.hop();
      head.hop();
    },
    busy(look) {
      main.busy(look);
      head.busy(look);
    },
    wiggle(ms) {
      main.wiggle(ms);
      head.wiggle(ms);
    },
    lively(on) {
      main.lively(on);
      head.lively(on);
    },
    pose(p) {
      main.pose(p);
      head.pose(p);
    },
    hat(on) {
      main.hat(on);
      head.hat(on);
    },
    setColors(c) {
      main.setColors(c);
      head.setColors(c);
    },
  };
}
export function init24() {
  goo = mirrored(Goo(canvas('goo'), { headroom: 8 }), Goo(canvas('mcGoo'), { headroom: 4 }));
  // small Myras get room above them
  goos = [
    goo,
    Goo(canvas('obGoo'), { headroom: 8 }),
    Goo(canvas('obGoo2'), { headroom: 8 }),
    Goo(canvas('coachGoo'), SMALL),
    Goo(canvas('setGoo'), SMALL),
  ];
}
