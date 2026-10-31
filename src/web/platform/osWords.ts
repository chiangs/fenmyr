// @ts-nocheck
export let OS;
export function init3() {
  // ---------- on Windows and Linux: ⌘K reads Ctrl+K, ⇧⌘G reads Ctrl+Shift+G (the keys themselves already take Ctrl), and the app's own words say PC, not Mac ----------
  // the browser version on a Windows or Linux computer counts too (an iPhone or iPad keeps ⌘)
  OS =
    Fenmyr.platform !== 'web'
      ? Fenmyr.platform
      : /Win/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent)
        ? 'windows'
        : /Linux|X11|CrOS/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent)
          ? 'linux'
          : 'mac';

  if (OS === 'windows' || OS === 'linux') {
    const MOD = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' },
      ORDER = ['Ctrl', 'Alt', 'Shift'];
    const winKeys = t =>
      t
        .replace(/([⌃⌥⇧⌘]+)(\s?)([^\s⌃⌥⇧⌘]?)/g, (m, mods, sp, key) => {
          const ms = ORDER.filter(o => [...mods].some(c => MOD[c] === o));
          return (
            ms.join('+') +
            (key === '-' ? '-' : key ? (sp ? ' ' + key : '+' + (key === '↩' ? 'Enter' : key.toUpperCase())) : '')
          ); // "⇧ for 10" stays "Shift for 10"   // ⌘-click reads Ctrl-click
        })
        .replace(/Ctrl\+(\S)\s*\/\s*ctrl/i, 'Ctrl+$1'); // "⌘/ctrl" said twice
    const PC = OS === 'windows' ? 'PC' : 'computer';
    const WORDS = [
      [/\b(this|your|a|my) Mac’s\b/g, `$1 ${PC}’s`],
      [/\b(this|your|a|my) Mac\b/g, `$1 ${PC}`],
      [/\bShow in Finder\b/g, 'Show in File Explorer'],
      [/\bFinder\b/g, 'File Explorer'],
      [/\bTerminal\b/g, OS === 'windows' ? 'PowerShell' : 'a terminal'],
    ];
    const MACWORDS = /Mac|Finder|Terminal/;
    const theirs = n =>
      n.parentElement?.closest('#cards, .docview, .msg.me, [contenteditable="true"], input, textarea'); // never touch what people wrote
    const winWords = t => WORDS.reduce((x, [re, to]) => x.replace(re, to), t);
    const sayPC = n => {
      if (!MACWORDS.test(n.nodeValue) || theirs(n)) return;
      const v = winWords(n.nodeValue);
      if (v !== n.nodeValue) n.nodeValue = v;
    }; // only write when it changes, or the watcher below would loop
    const ATTRS = ['title', 'data-tip', 'aria-label', 'placeholder'];
    const fix = n => {
      if (n.nodeType === 3) {
        if (/[⌃⌥⇧⌘]/.test(n.nodeValue)) n.nodeValue = winKeys(n.nodeValue);
        sayPC(n);
        return;
      }
      if (n.nodeType !== 1) return;
      ATTRS.forEach(a => {
        const v = n.getAttribute(a);
        if (v && /[⌃⌥⇧⌘]/.test(v)) n.setAttribute(a, winKeys(v));
      });
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = w.nextNode())) {
        if (/[⌃⌥⇧⌘]/.test(t.nodeValue)) t.nodeValue = winKeys(t.nodeValue);
        sayPC(t);
      }
      n.querySelectorAll?.(ATTRS.map(a => `[${a}]`).join(',')).forEach(e =>
        ATTRS.forEach(a => {
          const v = e.getAttribute(a);
          if (v && /[⌃⌥⇧⌘]/.test(v)) e.setAttribute(a, winKeys(v));
        }),
      );
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
