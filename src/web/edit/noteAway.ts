// Focus can leave a note being typed in for a box or bar that works on it. The note keeps its edit and its selection
// until focus comes back or goes somewhere else.
export type Away = { readonly t: HTMLElement; readonly range: Range; readonly resume: HTMLElement['onblur'] };
// back: focus went back into the note by itself. refocus: the note gets its selection back. leave: the edit ends.
export type Return = 'back' | 'refocus' | 'leave';

export function stepAway(t: HTMLElement): Away | null {
  const s = getSelection();
  if (!s?.rangeCount) return null;
  const away = { t, range: s.getRangeAt(0).cloneRange(), resume: t.onblur };
  t.onblur = null;
  return away;
}

export function comeBack({ t, range, resume }: Away, how: Return) {
  t.onblur = resume;
  if (how === 'refocus') {
    t.focus();
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(range);
  } else if (how === 'leave' && document.activeElement !== t) t.dispatchEvent(new FocusEvent('blur'));
}
