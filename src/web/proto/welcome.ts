import type { Card } from '../../shared/model.ts';
import { card } from '../model/boards.ts';

// A new prototype board's first cards: three notes from Myra on how to start, and her, bouncing on the first one.
// Ordinary cards, so people move, edit or delete them like any other.
const W = 440,
  H = 470,
  GAP = 60,
  // right of the widget column, which covers the left of a prototype board's narrow column
  LEFT = 300;

const WHAT_WE_BUILD = `This is where ideas stop being pictures and start being things you can click. I write the code, it lives in a folder of your project’s repo, and nothing is locked inside Fenmyr.

What we can build

Components: a button, a card, a form, a menu. The small things that make a big difference.

Layouts: whole screens, at phone or desktop size.
Workflows: a few screens linked into a flow you can click through, and argue about.

Complete apps: let’s not make the same mistakes as the Jurassic Park scientists; just because we could, doesn’t mean we should. 😅

This chat stays with the board, so we’ll always know how it got built.`;

const WHAT_I_NEED = `I’m good, but I’m not a mind reader. Put these on the board (paste them in or draw them here) and select the ones that matter before you ask. I read what you’ve selected every time I build.

A description: what is it, and who is it for?
The goal: what should be true when it works?
User stories: the things people need to do, one line each.
Wireframes: draw them with the wireframe pieces, or drop in sketches.

A design or style guide: colours, fonts, spacing, tone. Pictures of things you like count too.
Real content: the actual words, numbers and images, not “lorem ipsum” if you can help it.

You don’t need all six. A description and one wireframe is a perfectly respectable start.`;

const HOW_WE_WORK = `Ask for one thing: “build the sign-in screen from my wireframe”. Have a look at the preview and tell me what’s wrong with it. I’ll take it well, mostly.

As I build, I’ll ask which things you’d like to adjust yourself: colours, sizes, spacing, text. I’ll give each one a control in the preview, so you can fiddle without having to ask.

I only write inside this prototype’s folder, and I’ll show you which files I touched. Nothing gets committed, pushed or sent anywhere until you press the button ✦`;

export function prototypeWelcome(): Card[] {
  const note = (i: number, name: string, text: string, color: string, r: number, tagText = '') =>
    card('note', { x: LEFT + i * (W + GAP), y: 0, w: W, h: H, r, name, text, color, ...(tagText ? { tagText } : {}) });
  return [
    note(0, 'A new prototype? Exciting!', WHAT_WE_BUILD, 'butter', -1, 'Welcome!'),
    note(1, 'The more I know, the less I guess', WHAT_I_NEED, 'sky', 0.5),
    note(2, 'Start small, then steer', HOW_WE_WORK, 'mint', 1),
    card('stamp', { x: LEFT - 34, y: -62, w: 56, h: 56, src: 'stamps/myra-bounce.gif', r: -4 }),
  ];
}
