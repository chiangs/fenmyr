// Myra's voice check: asks the real Myra a set of tricky questions and prints what she says, for a person to read.
// Run it after changing her prompts (linux/prompts.js) or her model:  npm run voice   (or: node tests/voice.js 4 7)
// Needs Claude Code signed in, costs a few requests, and is never part of npm test or CI. Things to look for:
// the voice holds, the length matches the tone, wit is aimed at the board and never the person, and no emojis when off.
const { ask } = require('../linux/claude');

const note = (id, text, x, y) => ({ id, type: 'note', x, y, w: 220, h: 140, color: 'butter', text });
const empty = { name: 'Untitled', cards: [], links: [], unsorted: [] };
const busy = { name: 'Launch', cards: [note('a', 'final_final_v3', 0, 0), note('b', 'final_v2 (real?)', 40, 20), note('c', 'logo ideas??', 900, 600), note('d', 'TODO: everything', 300, -200), note('e', 'final_final_v3 copy', 60, 40)], links: [], unsorted: [] };
const style = (chat, emoji = false) => ({ name: '', chat, emoji });

const CASES = [
  { name: 'Terse person', chat: 'normal', board: busy, q: 'ok' },
  { name: 'Out of scope', chat: 'normal', board: busy, q: 'Can you give me legal advice on my lease?' },
  { name: 'Empty board', chat: 'normal', board: empty, q: 'hi' },
  { name: 'Frustrated, on chatty (wit should switch off)', chat: 'chatty', board: busy, q: "Nothing on this board makes sense and I'm so fed up." },
  { name: 'Quiet + out of scope (one sentence)', chat: 'quiet', board: busy, q: 'Book me a flight to Oslo.' },
  { name: 'Chatty + emojis off (no emojis, wit still tasteful)', chat: 'chatty', board: busy, q: 'What do you think of my board?' },
  { name: 'Chatty + chaotic board (wit at the board, not the person)', chat: 'chatty', board: busy, q: 'Tidy this up please.' },
];

const say = raw => { const s = String(raw), a = s.indexOf('{'), b = s.lastIndexOf('}'); try { return JSON.parse(s.slice(a, b + 1)).say || '(no "say")'; } catch (e) { return '(not JSON) ' + s.slice(0, 300); } };

(async () => {
  const pick = process.argv.slice(2).map(Number).filter(Boolean);
  for (const [i, c] of CASES.entries()) {
    if (pick.length && !pick.includes(i + 1)) continue;
    process.stdout.write(`\n${i + 1}. ${c.name}  [${c.chat}]\n   Person: ${c.q}\n`);
    try { console.log('   Myra:   ' + say(await ask({ prompt: c.q, board: { ...c.board, myraStyle: style(c.chat) }, web: false, mobbin: false, higgs: false }))); }
    catch (e) { console.log('   (failed) ' + e.message); }
  }
})();
