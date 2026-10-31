// Caelestia (the Hyprland shell, github.com/caelestia-dots) rewrites $XDG_STATE_HOME/caelestia/scheme.json,
// { name, mode, colours: { primary: "a6c8ff", … } }, whenever the wallpaper, scheme or light/dark mode changes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CaelestiaScheme } from '../shared/ops.ts';
import { isRecord, readJSON } from './util.ts';

const dir = path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'caelestia');
const file = path.join(dir, 'scheme.json');

export function read(): CaelestiaScheme | null {
  const j = readJSON(file);
  if (!isRecord(j)) return null;
  const colours: Record<string, string> = {};
  for (const [k, v] of Object.entries(isRecord(j.colours) ? j.colours : {}))
    if (/^#?[0-9a-f]{6}$/i.test(String(v))) colours[k] = `#${String(v).replace(/^#/, '').toLowerCase()}`;
  return colours.primary && colours.surface
    ? { name: typeof j.name === 'string' ? j.name : '', mode: j.mode === 'light' ? 'light' : 'dark', colours }
    : null;
}

export function watch(onChange: (s: CaelestiaScheme | null) => void) {
  let last = JSON.stringify(read()),
    tick: NodeJS.Timeout | undefined;
  const changed = () => {
    clearTimeout(tick);
    tick = setTimeout(() => {
      const s = read(),
        j = JSON.stringify(s);
      if (j !== last) {
        last = j;
        onChange(s);
      }
    }, 150);
  };
  const start = () => {
    try {
      // the folder, since the file is replaced, not edited
      fs.watch(dir, (_ev, name) => {
        if (!name || name === 'scheme.json') changed();
      });
      return true;
    } catch {
      return false;
    }
  };
  // Caelestia may be installed later, so keep looking for it
  if (!start()) {
    const t = setInterval(() => {
      if (start()) {
        clearInterval(t);
        changed();
      }
    }, 30000);
    t.unref();
  }
}
