import { type Knob, readKnobs } from './knobs.ts';

// The code pane's Values: the prototype's controls as last kept, the way a developer rebuilding it needs them, one
// line each with its range or options.
function line(k: Knob): [string, string] {
  switch (k.kind) {
    case 'choice':
      return [k.value, `one of ${k.options.join(', ')}`];
    case 'number':
      return [`${k.value}${k.unit}`, `${k.min} to ${k.max}${k.unit}${k.step === 1 ? '' : `, in steps of ${k.step}`}`];
    case 'text':
      return [JSON.stringify(k.value), ''];
    case 'colour':
      return [k.value, ''];
    case 'toggle':
      return [k.value ? 'on' : 'off', ''];
    case 'custom':
      return [JSON.stringify(k.value) ?? '', 'set inside the prototype'];
    default: {
      const unhandled: never = k;
      return unhandled;
    }
  }
}

export function valuesText(tweaksJson: string) {
  const rows = Object.values(readKnobs(tweaksJson)).map(k => [k.label, ...line(k)]);
  if (!rows.length) return 'This prototype has no controls yet.';
  const width = (i: number) => Math.max(...rows.map(r => (r[i] ?? '').length)) + 3;
  const [a, b] = [width(0), width(1)];
  return rows
    .map(([label = '', value = '', note = '']) => `${label.padEnd(a)}${value.padEnd(b)}${note}`.trimEnd())
    .join('\n');
}
