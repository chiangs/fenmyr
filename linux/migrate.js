// Myra started life as "Mochiboard for Linux". The first time Myra opens, it moves that version's boards and settings over:
//   ~/.local/share/mochiboard  →  ~/.local/share/myra     (boards, folders, videos, usage, the speech model)
//   ~/.config/Mochiboard        →  ~/.config/Myra          (the app's own settings: your name, theme, the tour…)
// Only when Myra has nothing of its own yet, so it never overwrites anything. Board files are the same format, so they just open.
const fs = require('fs'), os = require('os'), path = require('path');

const xdg = (v, fallback) => process.env[v] || path.join(os.homedir(), fallback);

function move(from, to) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try { fs.renameSync(from, to); }
  catch (e) { fs.cpSync(from, to, { recursive: true }); }   // a different disk: copy, and leave the old folder where it was
  return true;
}

module.exports = function migrate(userData) {
  const moved = [];
  if (move(path.join(xdg('XDG_DATA_HOME', '.local/share'), 'mochiboard'), path.join(xdg('XDG_DATA_HOME', '.local/share'), 'myra'))) moved.push('boards');
  if (move(path.join(xdg('XDG_CONFIG_HOME', '.config'), 'Mochiboard'), userData)) moved.push('settings');
  return moved;
};
