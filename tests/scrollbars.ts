// Every scrollbar is the thin one. `scrollbar-width` is not inherited, so one rule on `*` gives it to everything that
// scrolls, and the only things that may say otherwise are the places that hide their bar. This reads the stylesheet for any
// scrolling rule that asks for the wide default, then measures real bars on a plain box, on boxes with the classes the app
// scrolls with, and on a textarea, against a box that asks for thin and a box that asks for the default.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const board = { id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };
// scrolling classes that used to fall back to the wide default: Unsorted, a panel body, settings, the home page
const CLASSES = ['tray-list', 'pr-body', 'set-body', 'home', 'sh-body', 'vp-list'];

const l = await launch({ boards: [board], open: 'b' });
try {
  const { page } = l;

  const rules = await page.evaluate(() => {
    const found: { selector: string; width: string; scrolls: boolean }[] = [];
    const walk = (list: CSSRuleList) => {
      for (const r of list) {
        if (r instanceof CSSStyleRule) {
          const overflow = ['overflow', 'overflow-x', 'overflow-y'].map(p => r.style.getPropertyValue(p)).join(' ');
          found.push({
            selector: r.selectorText,
            width: r.style.getPropertyValue('scrollbar-width'),
            scrolls: /\b(auto|scroll|overlay)\b/.test(overflow),
          });
        }
        if ('cssRules' in r && r.cssRules instanceof CSSRuleList) walk(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules);
    return found;
  });
  const wide = rules.filter(r => r.width === 'auto').map(r => r.selector);
  assert.deepStrictEqual(wide, [], 'no rule asks for the wide default scrollbar');
  const all = rules.find(r => r.selector === '*');
  assert.strictEqual(all?.width, 'thin', 'the rule on * makes every scrollbar thin');
  const repeated = rules.filter(r => r.scrolls && r.width === 'thin').map(r => r.selector);
  assert.deepStrictEqual(repeated, [], 'no scrolling rule repeats what the rule on * already says');

  const bars = await page.evaluate(classes => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;display:flex;gap:6px';
    document.body.append(host);
    const bar = (make: () => HTMLElement, style = '') => {
      const el = make();
      el.style.cssText = `position:relative;inset:auto;display:block;width:90px;height:90px;max-height:90px;min-height:0;border:0;flex:none;opacity:1;transform:none;visibility:visible;${style}`;
      if (el instanceof HTMLTextAreaElement) el.value = Array(60).fill('line').join('\n');
      else {
        const inner = document.createElement('div');
        inner.style.cssText = 'width:300px;height:500px';
        el.append(inner);
      }
      host.append(el);
      return { vertical: el.offsetWidth - el.clientWidth, horizontal: el.offsetHeight - el.clientHeight };
    };
    const div = () => document.createElement('div'),
      scrolls = 'overflow:auto;';
    const out: Record<string, { vertical: number; horizontal: number }> = {
      thin: bar(div, `${scrolls}scrollbar-width:thin`),
      wide: bar(div, `${scrolls}scrollbar-width:auto`),
      plain: bar(div, scrolls),
      textarea: bar(() => document.createElement('textarea')),
    };
    for (const c of classes) {
      out[c] = bar(() => {
        const el = div();
        el.className = c;
        return el;
      });
    }
    return out;
  }, CLASSES);

  const thin = bars.thin?.vertical ?? 0,
    wideBar = bars.wide?.vertical ?? 0;
  assert.ok(thin > 0 && wideBar > thin, `the measure tells thin (${thin} px) from the default (${wideBar} px)`);
  for (const [name, b] of Object.entries(bars)) {
    if (name === 'wide') continue;
    assert.strictEqual(b.vertical, thin, `${name}: the vertical bar is ${b.vertical} px, thin is ${thin} px`);
    // a textarea wraps its lines, so it has no sideways bar
    if (name !== 'textarea')
      assert.strictEqual(b.horizontal, thin, `${name}: the horizontal bar is ${b.horizontal} px, thin is ${thin} px`);
  }
  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('scrollbars: ok');
} finally {
  await l.close();
}
