// @ts-nocheck
import { esc } from '../canvas/render.ts';
import { $ } from '../core/dom.ts';
import { docCard, ed, mdToHTML } from './editor.ts';
import { hidePop } from './menus.ts';
import { GUIDE, SIGNIN } from '../myra/chat.ts';
import { goo } from '../myra/goos.ts';
import { say } from '../settings/licenses.ts';

// ---------- Myra rewrites the words you selected ----------
export async function rewrite(how) {
  hidePop();
  if (!ed) return;
  const { from, to } = ed.state.selection;
  if (from === to) return;
  const text = ed.state.doc.textBetween(from, to, '\n'),
    size = ed.state.doc.content.size;
  const around = ed.state.doc.textBetween(Math.max(0, from - 700), Math.min(size, to + 700), '\n');
  $('docview').classList.add('myra-busy');
  goo.think(true);
  $('dvSaved').textContent = 'Myra is rewriting…';
  try {
    const out = ((await Fenmyr.rewrite(text, how, docCard?.text || '', around)) || '').trim();
    if (!out) throw new Error('Myra came back empty-handed');
    const multi = /\n/.test(out);
    ed.chain()
      .focus()
      .insertContentAt({ from, to }, multi ? mdToHTML(out) : esc(out))
      .run();
    const end = ed.state.selection.from;
    ed.commands.setTextSelection({ from, to: end });
    say('Rewritten ✦ Undo brings back your words.', 6000, [
      { label: 'Undo', run: () => ed.chain().focus().undo().run() },
    ]);
  } catch (err) {
    const m = err.message || '';
    if (/Claude Code/.test(m))
      say("I need Claude Code to rewrite things. It's a one-time setup with your Claude account.", 0, [
        { label: 'Show me how to connect', run: () => Fenmyr.openURL(GUIDE) },
      ]);
    else if (SIGNIN.test(m))
      say("Claude Code is here, but it isn't signed in yet. Open a terminal, type claude, and sign in.", 0, [
        { label: 'Show me how', run: () => Fenmyr.openURL(GUIDE) },
      ]);
    else
      say(
        Fenmyr.native ? "Hmm, I couldn't rewrite that: " + m : 'Myra rewrites text with Claude in the desktop app ✦',
        8000,
      );
  } finally {
    $('docview').classList.remove('myra-busy');
    goo.think(false);
    $('dvSaved').textContent = '';
  }
}
