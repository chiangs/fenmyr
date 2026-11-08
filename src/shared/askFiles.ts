// The pictures and text files a person can add to one message to Myra, and their limits. The renderer checks them when
// they are picked; the host checks them again, with the bytes, before Claude Code sees them.

/** A file added to one message, as a data: URL. */
export type AskFile = { name: string; data: string };

export type FileKind = 'picture' | 'text';

const MB = 1024 * 1024;

export const FILE_KINDS: { readonly [K in FileKind]: { exts: readonly string[]; maxBytes: number; noun: string } } = {
  picture: { exts: ['png', 'jpg', 'jpeg', 'webp', 'gif'], maxBytes: 5 * MB, noun: 'A picture' },
  text: { exts: ['txt', 'md', 'markdown', 'csv', 'json'], maxBytes: MB, noun: 'A text file' },
};

export const MAX_FILES = 4;

/** Starts the host's message when it refuses a file, so the chat shows it as it is. */
export const NOT_SENT = 'Not sent.';

const extOf = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';

export function kindOf(name: string): FileKind | null {
  const ext = extOf(name);
  if (FILE_KINDS.picture.exts.includes(ext)) return 'picture';
  if (FILE_KINDS.text.exts.includes(ext)) return 'text';
  return null;
}

export const wrongKind = (name: string) =>
  `“${name}” can’t be added. Add a picture (PNG, JPEG, WebP or GIF) or a text file (TXT, MD, CSV or JSON).`;

export function tooBig(name: string, kind: FileKind) {
  const { noun, maxBytes } = FILE_KINDS[kind],
    mb = maxBytes / MB;
  return `“${name}” is too big. ${noun} can be up to ${mb} MB.`;
}

/** Why a file can't go with a message, in words for the person, or null when it can. */
export function refusal(name: string, bytes: number): string | null {
  const kind = kindOf(name);
  if (!kind) return wrongKind(name);
  return bytes > FILE_KINDS[kind].maxBytes ? tooBig(name, kind) : null;
}

export const tooMany = `Up to ${MAX_FILES} files can go with one message.`;
