// What Myra's box and input say. No DOM, so tests/chatRules.ts checks every case in Node.

const NAME_MAX = 12;

/** Her name as the placeholder shows it: past 12 letters, the first 11 and an ellipsis. */
export function cutName(name: string): string {
  const letters = Array.from(name);
  return letters.length > NAME_MAX ? `${letters.slice(0, NAME_MAX - 1).join('')}…` : name;
}

/** The chat input's placeholder: with cards selected it says they go along with what you ask. */
export function askHint(name: string, selected: number, proto: boolean): string {
  const n = cutName(name);
  if (selected === 1) return `Ask ${n} to change this…`;
  if (selected > 1) return `Ask ${n} to change these ${selected}…`;
  return proto ? `Ask ${n} about this prototype…` : `Ask ${n}… “group these by theme”`;
}
