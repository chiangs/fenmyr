import type { Zone } from './types.ts';

// An area is the folder a file belongs to, one level down inside src/web.
export function areaOf(path: string): string {
  const [first, second, third] = path.split('/');
  if (first === 'src') {
    if (second === 'web') return path.split('/').length > 3 && third ? `web/${third}` : 'web (root)';
    return second ?? 'src';
  }
  if (first === 'web') return 'static';
  if (first === 'tests') return second === 'smoke' ? 'tests/smoke' : 'tests';
  return first === 'tools' ? 'tools' : 'other';
}

export function zoneOf(area: string): Zone {
  if (area === 'host') return 'host';
  if (area === 'shared') return 'shared';
  if (area === 'static') return 'static';
  if (area.startsWith('tests')) return 'tests';
  if (area === 'tools' || area === 'other') return 'tools';
  return 'renderer';
}
