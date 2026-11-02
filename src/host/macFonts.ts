import { isRecord, text } from './util.ts';

// Reads `system_profiler SPFontsDataType -json`. A leading dot marks fonts macOS keeps for itself.
export function parseMacFonts(json: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  const fonts = isRecord(data) && Array.isArray(data.SPFontsDataType) ? data.SPFontsDataType : [];
  return fonts.flatMap(font => {
    const faces = isRecord(font) && Array.isArray(font.typefaces) ? font.typefaces : [];
    return faces.map(face => (isRecord(face) ? text(face.family) : '')).filter(n => n && !n.startsWith('.'));
  });
}
