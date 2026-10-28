// Caelestia (the Hyprland shell, github.com/caelestia-dots) keeps its current colour scheme in one file, rewritten whenever the
// wallpaper, scheme or light/dark mode changes:  $XDG_STATE_HOME/caelestia/scheme.json  { mode, colours: { primary: "a6c8ff", … } }
// Fenmyr reads it, and watches it so Settings → General → "Follow Caelestia" restyles the board live.
const fs = require('fs'), os = require('os'), path = require('path');

const dir = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'caelestia');
const file = path.join(dir, 'scheme.json');

// { name, mode: 'dark' | 'light', colours: { primary: '#a6c8ff', … } }, or null without Caelestia
function read() {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8')), colours = {};
    for (const [k, v] of Object.entries(j.colours || {})) if (/^#?[0-9a-f]{6}$/i.test(v)) colours[k] = '#' + String(v).replace(/^#/, '').toLowerCase();
    return colours.primary && colours.surface ? { name: j.name || '', mode: j.mode === 'light' ? 'light' : 'dark', colours } : null;
  } catch (e) { return null; }
}

// calls onChange(scheme) whenever the scheme changes; if Caelestia isn't there yet, looks again every 30 seconds
function watch(onChange) {
  let last = JSON.stringify(read()), tick = null;
  const changed = () => { clearTimeout(tick); tick = setTimeout(() => { const s = read(), j = JSON.stringify(s); if (j !== last) { last = j; onChange(s); } }, 150); };
  const start = () => {
    try { fs.watch(dir, (ev, name) => { if (!name || name === 'scheme.json') changed(); }); return true; }   // the folder, since the file is replaced, not edited
    catch (e) { return false; }
  };
  if (!start()) { const t = setInterval(() => { if (start()) { clearInterval(t); changed(); } }, 30000); t.unref && t.unref(); }
}

module.exports = { read, watch, file };
