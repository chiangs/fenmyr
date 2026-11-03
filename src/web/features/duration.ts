import { type TimerAsk, type TimerRequest, timer } from './timer.ts';

// how long, exactly as entered: "25" (minutes), "25m", "1h30", "2m10s", "1 min 1 sec", "69 seconds", "half an hour". Whatever follows is the purpose.
const UNIT_S: Record<string, number> = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
};

const DUR_WORDS: [RegExp, number][] = [
  [/^\s*an hour and a half\b/i, 5400],
  [/^\s*half an hour\b/i, 1800],
  [/^\s*(?:an|one) hour\b/i, 3600],
  [/^\s*a minute\b/i, 60],
  [/^\s*a second\b/i, 1],
];

function parseDuration(str: string, needUnit: boolean) {
  // from the start of str: { secs, rest } or null (needUnit: a bare number is not enough, for plain sentences)
  const w = DUR_WORDS.find(([re]) => re.test(str));
  if (w) return { secs: w[1], rest: str.replace(w[0], '') };
  let rest = str,
    total = 0,
    prev = Infinity,
    got = 0,
    anyUnit = false;
  for (;;) {
    const m = /^\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)?(?![a-z])/i.exec(
      rest,
    );
    if (!m) break;
    const u = m[2] ? (UNIT_S[m[2].toLowerCase()] ?? 0) : !got ? 60 : prev === 3600 ? 60 : prev === 60 ? 1 : 0; // a bare number is minutes, or the next unit down after hours or minutes ("1h30")
    if (!u || u >= prev) break;
    if (m[2]) anyUnit = true;
    total += Number(m[1]) * u;
    prev = u;
    got++;
    rest = rest.slice(m[0].length);
  }
  return got && (anyUnit || !needUnit) ? { secs: Math.round(total), rest } : null;
}

export function parseTimer(arg?: string): TimerAsk | null {
  const d = parseDuration(arg || '', false);
  if (!d || !/^(\s|$)/.test(d.rest)) return null;
  return d.secs >= 1 && d.secs <= 36000 ? { secs: d.secs, purpose: d.rest.trim().slice(0, 60) } : null;
}

export const durText = (secs: number) => {
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    sec = secs % 60;
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(' ') || '0 sec';
};

// plain sentences: "set a timer for 25 minutes for the intro", "give me a 2 minute 10 second timer", "remind me in 20 minutes to stretch", "cancel my timer", "how much time is left?"
export function timerRequest(q: string): TimerRequest | null {
  if (/\b(cancel|stop|clear|end|turn off|kill)\b[^.?!]*\btimer\b/i.test(q)) return { stop: true };
  if (/\b(how (much )?(time|long)\b[^.?!]*\b(left|remain\w*)|time (left|remaining))\b/i.test(q) && timer)
    return { status: true };
  const asks =
    /\b(set|start|begin|make|give me|create|run|put on|can i (get|have)|could (you|i) (get|have))\b[^.?!]*\btimer\b|\btimer\b[^.?!]*\b(for|of)\b|\b(\d+\s*(min|minute|sec|second|hour|hr)\w*[ -]*timer)\b|\bremind me\b[^.?!]*\bin\b/i.test(
      q,
    ) || /^\s*timer\b/i.test(q);
  if (!asks) return null;
  for (const m of q.matchAll(/(?:\d|\b(?:half an hour|an hour|a minute|a second)\b)/gi)) {
    const d = parseDuration(q.slice(m.index ?? 0), true);
    if (!d || d.secs < 1 || d.secs > 36000) continue;
    const purpose = d.rest
      .replace(/^[\s,.-]*(?:timer|alarm)\b[\s,.]*/i, '')
      .replace(/^[\s,.]+/, '')
      .replace(/^(?:for|to|so i can|while i|so that i can|called|named|labell?ed)\s+/i, '')
      .replace(/[\s.?!]+$/, '')
      .slice(0, 60);
    return { secs: d.secs, purpose: /^(me|please|thanks?|now)$/i.test(purpose) ? '' : purpose };
  }
  return null;
}
