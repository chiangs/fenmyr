import fs from 'node:fs';

/** A file's text, or null while it isn't there. Git and the host put a file back by removing it and writing it again,
 *  so a poll that reads one meets it gone for a moment, and that is "not yet", not a failure. */
export function textIfThere(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}
