import fs from 'node:fs';
import path from 'node:path';

// What each file and area is for, in one line. Kept by hand in descriptions.json; check.ts fails when one is missing.
export type Descriptions = { areas: Record<string, string>; files: Record<string, string> };

export const DESCRIPTIONS = path.join(import.meta.dirname, 'descriptions.json');
export const MAX_LENGTH = 200;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function strings(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(v)) for (const [k, text] of Object.entries(v)) if (typeof text === 'string') out[k] = text;
  return out;
}

export function parseDescriptions(raw: unknown): Descriptions {
  return isRecord(raw) ? { areas: strings(raw.areas), files: strings(raw.files) } : { areas: {}, files: {} };
}

export function readDescriptions(file = DESCRIPTIONS): Descriptions {
  return parseDescriptions(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export type Problems = {
  missingFiles: string[];
  staleFiles: string[];
  missingAreas: string[];
  staleAreas: string[];
  long: string[];
};

export function problemsWith(d: Descriptions, files: string[], areas: string[]): Problems {
  const fileSet = new Set(files),
    areaSet = new Set(areas);
  const texts = [...Object.entries(d.files), ...Object.entries(d.areas)];
  return {
    missingFiles: files.filter(f => !d.files[f]?.trim()),
    staleFiles: Object.keys(d.files).filter(f => !fileSet.has(f)),
    missingAreas: areas.filter(a => !d.areas[a]?.trim()),
    staleAreas: Object.keys(d.areas).filter(a => !areaSet.has(a)),
    long: texts.filter(([, text]) => text.length > MAX_LENGTH).map(([k]) => k),
  };
}

export const isClean = (p: Problems) => Object.values(p).every(list => list.length === 0);
