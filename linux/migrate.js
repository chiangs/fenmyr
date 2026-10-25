// Myra started life as "Mochiboard for Linux". The first time Myra opens, it moves that version's boards and settings over:
//   ~/.local/share/mochiboard  →  ~/.local/share/myra     (boards, folders, videos, usage, the speech model)
//   ~/.config/Mochiboard        →  ~/.config/Myra          (the app's own settings: your name, theme, the tour…)
// Only when Myra has nothing of its own yet, so it never overwrites anything. Board files are the same format, so they just open.
const fs = require('fs'), os = require('os'), path = require('path');

const xdg = (v, fallback) => process.env[v] || path.join(os.homedir(), fallback);

function move(from, to) {
  if (!fs.existsSync(from)) return false;
  if (!fs.existsSync(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.renameSync(from, to); }
    catch (e) { fs.cpSync(from, to, { recursive: true }); }   // a different disk: copy, and leave the old folder where it was
    return true;
  }
  // the folder is already there (Electron makes its settings folder as it starts): bring over whatever it doesn't have yet,
  // but only if Myra hasn't saved anything of its own (no boards; no stored page settings)
  if (['boards', 'Local Storage'].some(n => fs.existsSync(path.join(to, n)))) return false;
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name), b = path.join(to, name);
    if (fs.existsSync(b)) continue;
    try { fs.renameSync(a, b); } catch (e) { fs.cpSync(a, b, { recursive: true }); }
  }
  try { fs.rmdirSync(from); } catch (e) {}   // only goes if everything moved
  return true;
}

module.exports = function migrate(userData) {
  const moved = [];
  if (move(path.join(xdg('XDG_DATA_HOME', '.local/share'), 'mochiboard'), path.join(xdg('XDG_DATA_HOME', '.local/share'), 'myra'))) moved.push('boards');
  if (move(path.join(xdg('XDG_CONFIG_HOME', '.config'), 'Mochiboard'), userData)) moved.push('settings');
  return moved;
};
