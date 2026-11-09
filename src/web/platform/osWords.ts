import { isRecord } from '../../shared/model.ts';

// 'mac', 'linux' or 'windows'
export let OS = 'mac';

// newer Chromium says the platform here; older browsers only have navigator.platform
function uaPlatform() {
  const data: unknown = Reflect.get(navigator, 'userAgentData');
  return isRecord(data) && typeof data.platform === 'string' ? data.platform : '';
}
export function init3() {
  // ---------- on Windows and Linux: ⌘K reads Ctrl+K, ⇧⌘G reads Ctrl+Shift+G (the keys themselves already take Ctrl), and the app's own words say PC, not Mac ----------
  // the browser version on a Windows or Linux computer counts too (an iPhone or iPad keeps ⌘)
  OS =
    Fenmyr.platform !== 'web'
      ? Fenmyr.platform
      : /Win/i.test(uaPlatform() || navigator.platform || navigator.userAgent)
        ? 'windows'
        : /Linux|X11|CrOS/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent)
          ? 'linux'
          : 'mac';

  if (OS === 'windows' || OS === 'linux') {
    const MOD: Record<string, string> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' },
      ORDER = ['Ctrl', 'Alt', 'Shift'];
    const winKeys = (t: string) =>
      t
        .replace(/([⌃⌥⇧⌘]+)(\s?)([^\s⌃⌥⇧⌘]?)/g, (_m, mods: string, sp: string, key: string) => {
          const ms = ORDER.filter(o => [...mods].some(c => MOD[c] === o));
          return (
            ms.join('+') +
            (key === '-' ? '-' : key ? (sp ? ` ${key}` : `+${key === '↩' ? 'Enter' : key.toUpperCase()}`) : '')
          ); // "⇧ for 10" stays "Shift for 10"   // ⌘-click reads Ctrl-click
        })
        .replace(/Ctrl\+(\S)\s*\/\s*ctrl/i, 'Ctrl+$1'); // "⌘/ctrl" said twice
    const PC = OS === 'windows' ? 'PC' : 'computer';
    const WORDS: [RegExp, string][] = [
      [/\b(this|your|a|my) Mac’s\b/g, `$1 ${PC}’s`],
      [/\b(this|your|a|my) Mac\b/g, `$1 ${PC}`],
      [/\bShow in Finder\b/g, 'Show in File Explorer'],
      [/\bFinder\b/g, 'File Explorer'],
      [/\bTerminal\b/g, OS === 'windows' ? 'PowerShell' : 'a terminal'],
    ];
    const MACWORDS = /Mac|Finder|Terminal/;
    const theirs = (n: Node) =>
      n.parentElement?.closest('#cards, .docview, .mc-msg.me, .pasted-text, [contenteditable="true"], input, textarea'); // never touch what people wrote
    const winWords = (t: string) => WORDS.reduce((x, [re, to]) => x.replace(re, to), t);
    const sayPC = (n: Text) => {
      if (!MACWORDS.test(n.data) || theirs(n)) return;
      const v = winWords(n.data);
      if (v !== n.data) n.data = v;
    }; // only write when it changes, or the watcher below would loop
    const ATTRS = ['title', 'data-tip', 'aria-label', 'placeholder'];
    const fix = (n: Node) => {
      if (n instanceof Text) {
        if (/[⌃⌥⇧⌘]/.test(n.data)) n.data = winKeys(n.data);
        sayPC(n);
        return;
      }
      if (!(n instanceof Element)) return;
      ATTRS.forEach(a => {
        const v = n.getAttribute(a);
        if (v && /[⌃⌥⇧⌘]/.test(v)) n.setAttribute(a, winKeys(v));
      });
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      for (let t = w.nextNode(); t; t = w.nextNode()) {
        if (!(t instanceof Text)) continue;
        if (/[⌃⌥⇧⌘]/.test(t.data)) t.data = winKeys(t.data);
        sayPC(t);
      }
      n.querySelectorAll(ATTRS.map(a => `[${a}]`).join(',')).forEach(e => {
        ATTRS.forEach(a => {
          const v = e.getAttribute(a);
          if (v && /[⌃⌥⇧⌘]/.test(v)) e.setAttribute(a, winKeys(v));
        });
      });
    };
    fix(document.body);
    new MutationObserver(ms =>
      ms.forEach(m => {
        if (m.type === 'characterData') fix(m.target);
        else if (m.type === 'attributes') fix(m.target);
        else m.addedNodes.forEach(fix);
      }),
    ).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }
}
