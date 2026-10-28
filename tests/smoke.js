// End-to-end smoke test: opens the real app (under Xvfb in CI) with a throwaway data folder, and drives the bridge.
//   xvfb-run -a node tests/smoke.js
//   FENMYR_APP=~/.local/lib/fenmyr/app xvfb-run -a node tests/smoke.js   (an installed copy, with the Electron install.sh chose)
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-smoke-')), out = path.join(data, 'out');
  fs.mkdirSync(out);
  // stand-ins for Claude Code and whisper.cpp, found where the real ones usually live (~/.local/bin)
  const bin = path.join(data, '.local/bin'); fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh
if [ "$1" = mcp ]; then echo "claude.ai Mobbin: https://mobbin - ✓ Connected"; echo "claude.ai higgsfield: https://h - ! Needs authentication"; exit 0; fi
printf '%s' "$2" > "${data}/prompt.txt"; echo "$@" > "${data}/args.txt"
echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"hi from fake claude\\"}","usage":{"input_tokens":10,"cache_read_input_tokens":5,"output_tokens":3},"total_cost_usd":0.01}'
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'whisper-cli'), `#!/bin/sh
for a; do case "$a" in *.wav) head -c 4 "$a" > "${data}/wav-magic.txt";; esac; done
echo " [BLANK_AUDIO] hello from whisper"
`, { mode: 0o755 });
  fs.writeFileSync(path.join(data, 'model.bin'), 'x');
  const dir = process.env.FENMYR_APP || path.join(__dirname, '..');
  const installed = process.env.FENMYR_APP ? JSON.parse(fs.readFileSync(path.join(dir, 'install.json'), 'utf8')) : {};
  const app = await electron.launch({ ...(installed.electron ? { executablePath: installed.electron } : {}), args: [dir, '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data, FENMYR_WHISPER_MODEL: path.join(data, 'model.bin') } });
  // save dialogs answer themselves: everything lands in out/
  await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, out);
  const page = await app.firstWindow(), errors = [];
  await page.exposeFunction('__readArgs', () => fs.readFileSync(path.join(data, 'args.txt'), 'utf8'));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '') && errors.push(m.text()));   // Google Fonts can't be reached from every test machine
  await page.waitForFunction(() => window.Fenmyr && document.querySelector('#side'));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const res = { native: Fenmyr.native, linux: document.documentElement.classList.contains('linux') };
    res.first = { name: __fenmyr.board.name, cards: __fenmyr.board.cards.length, tray: __fenmyr.board.tray.length, kanban: __fenmyr.board.cards.some(c => c.kanban) };   // the first board people see
    const board = { id: 'smoke1', name: 'Smoke', color: 'mint', cards: [{ id: 'c1', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'hi', bad: NaN }] };
    res.save = await Fenmyr.save(board);
    res.load = (await Fenmyr.load('smoke1')).cards[0].bad;
    // a big board (pictures make them many MB) goes there and back intact
    const big = 'x'.repeat(20e6); let t = performance.now();
    await Fenmyr.save({ id: 'big', name: 'Big', cards: [{ id: 'b', type: 'image', src: big }] }); const back = await Fenmyr.load('big');
    res.big = back.cards[0].src.length === big.length; res.bigMs = Math.round(performance.now() - t); await Fenmyr.remove('big');
    res.list = (await Fenmyr.list()).some(b => b.id === 'smoke1');
    res.folders = await Fenmyr.saveFolders([{ id: 'f', name: 'F' }]) && (await Fenmyr.folders()).length;
    res.fonts = (await Fenmyr.fonts()).length;
    res.version = await Fenmyr.version();
    res.usage = typeof (await Fenmyr.usage()).today.asks;
    res.speech = await Fenmyr.speechAuth();
    res.unknown = await new Promise(r => { const id = 999999; const o = window.__fenmyrReply; window.__fenmyrReply = (i, ok, v) => { if (i === id) { window.__fenmyrReply = o; r(v); } else o(i, ok, v); }; window.fenmyrHost.post({ id, op: 'nope', args: {} }); });
    // a video goes in by chunks and comes back through fenmyrmedia:// with byte ranges
    const blob = new Blob([new Uint8Array(5000).fill(7)], { type: 'video/mp4' });
    const src = await Fenmyr.saveMedia(blob); res.media = src;
    const part = await fetch(src, { headers: { Range: 'bytes=100-199' } }); res.range = [part.status, (await part.arrayBuffer()).byteLength];
    res.png = await Fenmyr.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: false, scale: 2 });
    res.pdf = await Fenmyr.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: true, scale: 2 });
    res.docx = await Fenmyr.saveFile(btoa('hello'), 'Doc', 'docx');
    res.docPDF = await Fenmyr.docPDF('<!doctype html><link rel="stylesheet" href="__WEB__/fonts.css"><h1 style="font-family:DM Sans">Hello</h1><p>' + 'words '.repeat(2000) + '</p>', 'Doc', 'a4');
    res.conn = await Fenmyr.connections();
    res.ask = await Fenmyr.ask('sort these', { cards: [], n: Infinity }, false, { mobbin: true, higgs: false });
    res.usage2 = (await Fenmyr.usage()).today;
    // a real webm voice memo, recorded from a tone, goes through the WAV conversion
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
    const rec = new MediaRecorder(dst.stream), chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    await new Promise(r => { rec.onstop = r; rec.start(); setTimeout(() => rec.stop(), 600); });
    const memo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType })); });
    res.memoType = rec.mimeType; res.speech2 = await Fenmyr.speechAuth(); res.transcribe = await Fenmyr.transcribe(memo);
    return res;
  });
  r.prompt = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8'); r.args = fs.readFileSync(path.join(data, 'args.txt'), 'utf8').slice(-120); r.wav = fs.readFileSync(path.join(data, 'wav-magic.txt'), 'utf8');
  // Claude Code hooks are always off for Myra's calls; the web (search and public pages) is only on when Settings → Helpers says so
  Object.assign(r, await page.evaluate(async () => {
    const argsAfter = async fn => { await fn(); return window.__readArgs(); }, res = {};
    res.hooksOff = await argsAfter(() => Fenmyr.ask('again', {}, false, { mobbin: false, higgs: false }));
    res.hooksRewrite = await argsAfter(() => Fenmyr.rewrite('text', 'shorter', 'Doc', ''));
    res.webOn = await argsAfter(() => Fenmyr.ask('look this up', {}, false, { mobbin: false, higgs: false, web: true }));
    return res;
  }));
  r.webPromptOn = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8').includes('search the web and read public pages');
  r.webOff = await page.evaluate(async () => (await Fenmyr.ask('and this', {}, false, { mobbin: false, higgs: false }), window.__readArgs()));
  r.webPromptOff = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8').includes('switched off in Settings');
  // icons: everything the page draws is in the icon set, the Icon style setting switches the weight, and a name nobody drew shows a placeholder
  Object.assign(r, await page.evaluate(async () => {
    const shown = sel => [...document.querySelectorAll(sel)].some(g => getComputedStyle(g).display !== 'none'), res = {};
    res.gridShapes = [...document.querySelectorAll('#gridShapes button')].map(b => b.dataset.gshape).join();
    res.icoMissing = [...new Set([...document.querySelectorAll('svg[data-ico]')].map(s => s.dataset.ico).filter(n => !window.iconKnown(n) || n === 'missing'))];
    res.icoCount = document.querySelectorAll('#tools svg.ico').length; res.icoPick = window.iconList().length;
    res.icoPlaceholder = /data-ico="move_horiz"[^>]*><title>move_horiz/.test(window.Icon('move_horiz'));
    res.icoRegular = shown('#tools .ico-r') && !shown('#tools .ico-d');
    document.querySelector('[data-seg="iconStyle"] [data-v="duotone"]').click(); await new Promise(res => setTimeout(res, 100));
    res.icoDuo = document.body.classList.contains('icons-duo') && shown('#tools .ico-d') && !shown('#tools .ico-r') && document.querySelectorAll('#tools svg.ico .ico-d .t').length > 10;
    document.querySelector('[data-seg="iconStyle"] [data-v="regular"]').click();
    return res;
  }));
  // Settings → Board → Default font: board text and docs change, the app's own panels don't, and choosing Myra's own puts it back
  Object.assign(r, await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), fam = sel => getComputedStyle(document.querySelector(sel)).fontFamily, res = {};
    document.getElementById('gearBtn').click(); await wait(300); document.querySelector('#setTabs [data-tab="board"]').click(); await wait(200);
    res.fontBefore = fam('.card.title .text'); document.getElementById('defaultFontBtn').click(); await wait(200);
    const pick = [...document.querySelectorAll('#fontPop .dp-font')].find(b => b.dataset.bfont && b.dataset.bfont !== 'Figtree' && !b.querySelector('small'));   // a font installed here (no network in the test)
    const name = pick.dataset.bfont; pick.click(); await wait(300);
    res.fontLora = fam('.card.title .text').includes(name) && fam('.box').includes('Figtree') && !fam('.box').includes(name) && document.getElementById('defaultFontBtn').textContent === name;
    document.getElementById('defaultFontBtn').click(); await wait(200); document.querySelector('#fontPop [data-bfont=""]').click(); await wait(300);
    res.fontBack = fam('.card.title .text') === res.fontBefore;
    document.getElementById('setClose').click(); await wait(200);
    return res;
  }));
  // the new starter boards open as their own boards, with their cards (and, for the tree, its lines)
  Object.assign(r, await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), res = {};
    for (const [name, key] of [['OKRs and opportunities', 'tree'], ['Product kickoff', 'kickoff']]) {
      document.querySelector('#tools [data-add="tpl"]').click(); await wait(200); document.querySelector(`[data-starter="${name}"]`).click(); await wait(1500);
      res[key] = { name: document.getElementById('boardName').value === name, cards: document.querySelectorAll('.card').length };
    }
    return res;
  }));
  // Kanban adds columns with names and counts to the board; right-clicking a name offers the column menu
  Object.assign(r, await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms));
    document.querySelector('#tools [data-add="tpl"]').click(); await wait(200); document.querySelector('[data-tpl="kanban"]').click(); await wait(1200);
    const hs = [...document.querySelectorAll('.kb-h')];
    return { kanban: { cols: hs.map(h => h.querySelector('.text').textContent), counts: hs.map(h => h.querySelector('.kb-n').textContent) } };
  }));
  await page.evaluate(() => { document.getElementById('newsOk')?.click(); document.getElementById('onboard')?.classList.remove('on'); }); await page.waitForTimeout(800);
  { const bb = await page.evaluate(() => { const q = document.querySelectorAll('.kb-h')[1].getBoundingClientRect(); return [q.x + 20, q.y + 12]; });
    await page.mouse.click(bb[0], bb[1], { button: 'right' }); await page.waitForTimeout(300);
    const menu = await page.evaluate(() => [...document.querySelectorAll('#rowMenu button')].map(b => b.textContent));
    r.kanban.menu = menu.includes('Rename column') && menu.includes('Delete column') && menu.includes('Limit 5'); await page.keyboard.press('Escape'); await page.mouse.click(5, 300); }
  // your own templates: save the board, see it under Yours, add it to a board (twice: new ids each time) and open it as a new board
  Object.assign(r, await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, res = {};
    const t = await M.saveAsTemplate('Smoke template', null, { desc: 'For testing', mode: 'add' }); res.tplSaved = !!t && t.name === 'Smoke template' && t.cards.length > 3;
    document.querySelector('#tools [data-add="tpl"]').click(); await wait(200);
    const row = document.querySelector('[data-mine]'); res.tplRow = !!row && row.textContent.includes('Smoke template') && row.textContent.includes('For testing') && row.textContent.includes('Adds to this board');
    const before = M.board.cards.length; row.click(); await wait(800); const mid = M.board.cards.length;
    document.querySelector('#tools [data-add="tpl"]').click(); await wait(200); document.querySelector('[data-mine]').click(); await wait(800);
    res.tplAdds = mid > before && M.board.cards.length === mid + (mid - before) && new Set(M.board.cards.map(c => c.id)).size === M.board.cards.length;
    const id = M.board.id; await M.useTemplate(t, 'new'); await wait(800); res.tplNew = M.board.id !== id && M.board.name === 'Smoke template' && M.board.cards.length === t.cards.length;
    return res;
  }));
  // Obsidian vaults: connect one, give this board access, add a note (private ones stay out), flip it, load its full text (never saved), then take access away
  { const vp = path.join(data, 'vault'); fs.cpSync(path.join(__dirname, 'sample-vault'), vp, { recursive: true }); fs.writeFileSync(path.join(vp, 'Reading', 'Long.md'), '# Long\n\n' + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of a long note, long enough to push the end well past the preview.`).join('\n\n') + '\n\nZZ-END\n');
    Object.assign(r, await page.evaluate(async vp => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, res = {};
      const v = await Fenmyr.vaultAdd(vp); await Fenmyr.vaultUpdate(v.id, { off: ['Private'] });
      M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: false, write: false }];
      const tool0 = !document.querySelector('[data-add="vnote"]').hidden;
      M.openVaultPicker(); await wait(500);
      const names = [...document.querySelectorAll('#vaultPick .vp-row b')].map(b => b.textContent).sort();
      const add = async q => { document.getElementById('vpQ').value = q; document.getElementById('vpQ').dispatchEvent(new Event('input')); await wait(500); document.querySelector('#vaultPick .vp-row').click(); await wait(600); };
      await add('trip'); const c = M.board.cards.find(x => x.type === 'vnote');
      res.vault = { names: names.join(), title: c && c.title, tags: c && c.tags.join(), shown: !!document.querySelector('.card.vnote .vn-title')?.textContent, tool: !document.querySelector('[data-add="vnote"]').hidden && !tool0 || !document.querySelector('[data-add="vnote"]').hidden };
      // flip to the back, ask for the full text: shown, but never stored on the card
      M.openVaultPicker(); await wait(400); await add('long'); const lc = M.board.cards.filter(x => x.type === 'vnote').find(x => x.title === 'Long'), el = () => document.querySelector(`[data-id="${lc.id}"]`);
      el().querySelector('.vn-flip').click(); await wait(500); res.vault.side = lc.side === 'back' && !!el().querySelector('.vn-ex');
      res.vault.beforeFull = !el().innerText.includes('ZZ-END');
      el().querySelector('[data-act="vn-full"]').click(); await wait(700);
      res.vault.fullShown = el().innerText.includes('ZZ-END'); res.vault.fullSaved = JSON.stringify(M.board).includes('ZZ-END');
      el().querySelector('[data-act="vn-full"]').click(); await wait(300); res.vault.lessAgain = !el().innerText.includes('ZZ-END');
      M.board.vaultAccess = []; await M.refreshVNotes(); res.vault.blocked = c.blocked && !c.excerpt && !c.tags.length;
      return res;
    }, vp)); }
  // Alt+N opens the vault note picker on a board that can read a vault
  { await page.evaluate(async () => { const M = window.__fenmyr, v = (await Fenmyr.vaults())[0]; M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: false, write: false }]; });
    await page.mouse.click(5, 300); await page.keyboard.press('Alt+n'); await page.waitForTimeout(500);
    r.vault.altN = await page.evaluate(() => !!document.getElementById('vaultPick')); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  // Myra reads vault notes with AI: only with the grant's switch on and the chip ticked for that question; only allowed folders; and she says what she read
  { const promptNow = () => fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8');
    r.vaultAI = await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, v = (await Fenmyr.vaults())[0], res = {}, chip = () => document.getElementById('mcVault');
      M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: false, write: false }]; M.applyToolbar(); res.chipHiddenWhenOff = chip().hidden;
      M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: true, write: false }]; M.applyToolbar(); res.chipShown = !chip().hidden;
      await M.ask('what do I know about cloudberries?'); return res; });
    r.vaultAI.withoutChip = !promptNow().includes('dries out by August') && !promptNow().includes('FROM THEIR OBSIDIAN VAULT') && promptNow().includes('did not ask you to this time');
    Object.assign(r.vaultAI, await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, res = {};
      document.getElementById('mcVault').click(); res.chipOn = document.getElementById('mcVault').classList.contains('on');
      await M.ask('what do I know about cloudberries?'); await wait(300);
      res.said = document.body.innerText.includes('I read 2 notes from your vault'); res.chipReset = !document.getElementById('mcVault').classList.contains('on');
      return res; }));
    const p = promptNow();
    r.vaultAI.withChip = p.includes('FROM THEIR OBSIDIAN VAULT') && p.includes('dries out by August') && p.includes('Pack boots') && !p.includes('Cloudberries ripen from amber') && !p.includes('Nobody should read this') && !p.includes('Dear diary');
    // notes she lists become cards, but only ones she was given
    r.vaultAI.cards = await page.evaluate(async () => { const M = window.__fenmyr, v = (await Fenmyr.vaults())[0], n = M.board.cards.filter(c => c.type === 'vnote').length;
      await M.applyMyra({ say: 'ok', vaultNotes: [{ vault: v.name, path: 'Projects/Bog Notes/East bog.md' }, { vault: v.name, path: 'Private/Diary.md' }] }, 'q', { asked: true, used: [{ vault: v.name, vaultId: v.id, rel: 'Projects/Bog Notes/East bog.md', title: 'East bog', tags: ['place'], props: [], excerpt: 'x', text: 'x' }] });
      const now = M.board.cards.filter(c => c.type === 'vnote').length; M.board.vaultAccess = []; M.applyToolbar(); return now - n; }); }
  // connectors: weight (regular, medium, bold) and colour from the bar, remembered for the next connector, and a reset
  r.wire = await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, res = {}, b = M.board;
    const mk = (id, x, y) => ({ id, type: 'note', x, y, w: 200, h: 90, r: 0, text: id, color: 'butter' }); b.cards.push(mk('wA', -900, 900), mk('wB', -500, 1000)); b.cards.slice(-2).forEach(c => M.renderCard(c));
    b.links.push({ id: 'WL', a: 'wA', b: 'wB', arrow: true }); M.selectWire('WL'); await wait(400);
    const bar = () => document.getElementById('selbar'), pathStyle = () => document.querySelector('.wires path.w')?.getAttribute('style') || '';
    res.order = [...bar().children].map(e => e.className.includes('sb-popw') ? e.dataset.popw : e.textContent.trim()).slice(0, 5).join();
    document.querySelector('[data-pop="wcol"]').click(); await wait(200); bar().querySelector('[data-wb="col:#4f8fc9"]').click(); await wait(300);
    document.querySelector('[data-pop="wwt"]').click(); await wait(200); res.weights = [...bar().querySelectorAll('[data-wb^="w:"] span')].map(e => e.textContent).join();
    bar().querySelector('[data-wb="w:6"]').click(); await wait(300);
    const l = b.links.find(x => x.id === 'WL'); res.set = l.color === '#4f8fc9' && l.w === 6; res.drawn = [...document.querySelectorAll('.wires path')].some(p => (p.getAttribute('style') || '').includes('stroke:#4f8fc9;stroke-width:6'));
    res.last = JSON.stringify(JSON.parse(localStorage.getItem('fenmyr:settings')).wireStyle); res.halo = !!document.querySelector('.wires path.w-halo');
    bar().querySelector('[data-wb="reset"]').click(); await wait(300);
    res.reset = !l.color && !l.w && !JSON.parse(localStorage.getItem('fenmyr:settings')).wireStyle && !pathStyle().includes('stroke:#');
    b.links = b.links.filter(x => x.id !== 'WL'); b.cards = b.cards.filter(c => !['wA', 'wB'].includes(c.id)); M.selectWire(null); return res;
  });
  // sidebar rows: hovering shows the row's buttons without making the row taller than its neighbours, and their icons have a real size
  { const pt = await page.waitForFunction(() => {
      const all = [...document.querySelectorAll('.board-row')], seen = r => r.getBoundingClientRect().height > 0, row = all.filter(seen).find(x => [...x.parentElement.querySelectorAll(':scope > .board-row')].some(y => y !== x && seen(y)));
      return row ? { i: all.indexOf(row) } : null; }, null, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => null);
    if (pt) { await page.locator('.board-row').nth(pt.i).hover(); await page.waitForTimeout(250); }
    r.rowHover = await page.evaluate(found => { const e = document.querySelector('.board-row:hover'); if (!e) return { found, sidebar: !!document.querySelector('.board-row') && [...document.querySelectorAll('.board-row')].some(x => x.getBoundingClientRect().height > 0), same: false, shown: false, icon: false };
      const b = e.querySelector('.f-btn'), sv = b && b.querySelector('svg'), h = e.getBoundingClientRect().height, others = [...e.parentElement.querySelectorAll(':scope > .board-row')].filter(x => x !== e).map(x => x.getBoundingClientRect().height).filter(x => x > 0);
      return { found, h, others, same: others.every(x => Math.abs(x - h) < 1.5), shown: !!b && getComputedStyle(b).display !== 'none', icon: !!sv && sv.getBoundingClientRect().width >= 12 }; }, !!pt); }
  // tags on notes: "#word" + space makes a tag (out of the words), "#" suggests the board's tags, "#24" stays words, Myra's tags land in tags
  { await page.evaluate(() => { window.__fenmyr.selectOnly([]); window.__fenmyr.board.cards.filter(c => c.type === 'note').forEach(c => delete c.tags); });
    await page.evaluate(() => window.__fenmyr.newNote(-400, 600)); await page.waitForTimeout(300);
    await page.keyboard.type('Fix the login #bug and issue #24 later', { delay: 15 }); await page.keyboard.press('Space'); await page.waitForTimeout(200);
    r.tags = await page.evaluate(() => { const M = window.__fenmyr, c = M.board.cards.find(x => x.id === M.editing); return { text: c && c.text, tags: c && c.tags, board: M.board.tags }; });
    // a second note: "#b" suggests "#bug"; Enter picks it
    await page.keyboard.press('Escape'); await page.evaluate(() => window.__fenmyr.newNote(-100, 600)); await page.waitForTimeout(300);
    await page.keyboard.type('Second #b', { delay: 20 }); await page.waitForTimeout(250);
    r.tags.pop = await page.evaluate(() => [...document.querySelectorAll('#tagPop.on button')].map(b => b.textContent));
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    Object.assign(r.tags, await page.evaluate(async () => { const M = window.__fenmyr, c = M.board.cards.find(x => x.id === M.editing);
      const res = { text2: c && c.text, tags2: c && c.tags, chips: document.querySelectorAll(`[data-id="${c.id}"] .ntags i`).length };
      await M.applyMyra({ say: 'ok', add: [{ type: 'note', name: 'Login fails', text: 'Steps to reproduce', tags: ['BUG', '#ui', '12'], tag: '#31' }] }, 'q');
      const m = M.board.cards.find(x => x.name === 'Login fails'); res.myra = m && { tags: m.tags, label: m.tagText, text: m.text }; res.board2 = M.board.tags;
      return res; }));
    await page.keyboard.press('Escape'); }
  // earlier chats: with chats saved on the board, New chat files the conversation away (last 10 kept) and History brings it back
  r.chatHist = await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__fenmyr, res = {};
    document.querySelector('[data-seg="chatKeep"] [data-v="board"]').click(); await wait(100);
    document.getElementById('mPill').click(); await wait(300);
    const mk = (q, a) => [{ who: 'me', text: q, t: Date.now() }, { who: 'myra', text: a, t: Date.now() }];
    for (let i = 0; i < 12; i++) { M.board.chat = mk('question ' + i, 'answer ' + i); document.getElementById('mcNew').click(); await wait(30); }
    res.kept = M.board.chats.length; res.newest = M.board.chats[0].title; res.btn = !document.getElementById('mcHist').hidden;
    M.board.chat = mk('the current one', 'still here');
    document.getElementById('mcHist').click(); await wait(200);
    res.rows = document.querySelectorAll('#mcList .mh-row').length;
    document.querySelector('#mcList .mh-row:nth-child(3) .mh-open').click(); await wait(200);   // the second-newest (row 1 is the header)
    res.restored = M.board.chat[0].text; res.filed = M.board.chats[0].title; res.view = !!document.querySelector('#mcList .mc-msg');
    // an answer that arrives while the chat is closed still lands in the chat
    document.getElementById('mcClose').click(); await wait(100); await M.applyMyra({ say: 'Your board has three saved colours.' }, 'what colours are saved?');
    res.closedReply = M.board.chat.some(m => m.who === 'myra' && m.text.startsWith('Your board has three saved colours'));
    document.getElementById('mPill').click(); await wait(300); res.closedShown = document.getElementById('mcList').textContent.includes('Your board has three saved colours');
        document.getElementById('mcClose').click(); M.board.chat = []; M.board.chats = []; document.querySelector('[data-seg="chatKeep"] [data-v="session"]')?.click();
    return res;
  });
  // About → Licenses lists Myra's license and every third-party notice; Chromium's own file ships next to Electron
  Object.assign(r, await page.evaluate(async () => {
    document.getElementById('openLicenses').click(); await new Promise(res => setTimeout(res, 700));
    const items = [...document.querySelectorAll('#licBody .lic-item summary b')].map(b => b.textContent);
    document.getElementById('licClose').click();
    return { licenses: items.length, licMochiboard: items.includes('Mochiboard'), licJszip: items.includes('jszip'), licPhosphor: items.includes('Phosphor Icons') && !items.includes('Lucide') };
  }));
  r.chromiumFile = fs.existsSync(path.join(path.dirname(await app.evaluate(({ app }) => app.getPath('exe'))), 'LICENSES.chromium.html'));
  await page.screenshot({ path: path.join(out, 'window.png') });
  const files = fs.readdirSync(out);
  const png = fs.readFileSync(path.join(out, 'shot.png'));
  r.pngSize = [png.readUInt32BE(16), png.readUInt32BE(20)];
  r.pdfPages = (fs.readFileSync(path.join(out, 'Doc.pdf'), 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  r.files = files; r.errors = errors; r.boardOnDisk = fs.existsSync(path.join(data, 'fenmyr/boards/smoke1.json'));
  console.log(JSON.stringify({ ...r, prompt: r.prompt.slice(0, 120) + '…', hooksOff: r.hooksOff.slice(-160), webOn: r.webOn.slice(-120), webOff: r.webOff.slice(-120), hooksRewrite: r.hooksRewrite.slice(-100) }, null, 1));
  await app.close();
  const ok = r.native && r.linux && r.save && r.load === 0 && r.list && r.folders === 1 && r.fonts > 0 && r.unknown === 'unknown op nope' && r.range[0] === 206 && r.range[1] === 100
    && r.pngSize[0] === 600 && r.pdfPages >= 2 && files.includes('shot.pdf') && files.includes('Doc.docx') && r.boardOnDisk && r.big && r.licenses > 60 && r.licMochiboard && r.licJszip && r.gridShapes === 'dot,cross,square,cloudberry,berry,leaf' && r.tree.name && r.tree.cards >= 12 && r.kickoff.name && r.kickoff.cards >= 18 && r.kanban.cols.join() === 'To do,Doing,Done' && r.kanban.counts.join() === '2,1 / 3,1' && r.first.name === 'My first board' && r.first.cards === 15 && r.first.tray === 5 && r.first.kanban && r.kanban.menu && r.vault.names === '2026-10-20,Cloudberries,East bog,Long,Trip plan' && r.vault.title === 'Trip plan' && r.vault.tags === 'trip,cloudberries,today' && r.vault.shown && r.vault.tool && r.vault.side && r.vault.beforeFull && r.vault.fullShown && !r.vault.fullSaved && r.vault.lessAgain && r.vault.blocked && r.vault.altN && r.chatHist.kept === 10 && r.chatHist.newest === 'question 11' && r.chatHist.btn && r.chatHist.rows === 10 && r.chatHist.restored === 'question 10' && r.chatHist.filed === 'the current one' && r.chatHist.view && r.tags.text.trim() === 'Fix the login and issue #24 later' && JSON.stringify(r.tags.tags) === '["bug"]' && r.tags.pop.includes('#bug') && r.tags.text2.trim() === 'Second' && JSON.stringify(r.tags.tags2) === '["bug"]' && r.tags.chips === 1 && JSON.stringify(r.tags.myra.tags) === '["bug","ui"]' && r.tags.myra.label === '#31' && JSON.stringify(r.tags.board2) === '["bug","ui"]' && r.chatHist.closedReply && r.chatHist.closedShown && (!r.rowHover.found && !r.rowHover.sidebar || r.rowHover.same && r.rowHover.shown && r.rowHover.icon) && r.wire.order === 'Connector,wcol,wwt,,Curved' && r.wire.weights === 'Regular,Medium,Bold' && r.wire.set && r.wire.drawn && r.wire.last === '{"w":6,"color":"#4f8fc9"}' && r.wire.halo && r.wire.reset && r.vaultAI.chipHiddenWhenOff && r.vaultAI.chipShown && r.vaultAI.withoutChip && r.vaultAI.chipOn && r.vaultAI.withChip && r.vaultAI.said && r.vaultAI.chipReset && r.vaultAI.cards === 1 && r.tplSaved && r.tplRow && r.tplAdds && r.tplNew && r.licPhosphor && r.fontLora && r.fontBack && !r.icoMissing.length && r.icoCount >= 19 && r.icoPick > 150 && r.icoPlaceholder && r.icoRegular && r.icoDuo && r.chromiumFile && !errors.length
    && r.conn.mobbin === true && r.conn.higgsfield === false && JSON.parse(r.ask).say === 'hi from fake claude' && r.usage2.asks === 1 && r.usage2.tokensIn === 15
    && r.prompt.includes('The person asked you: sort these') && r.prompt.includes('Icons are names from this list') && r.prompt.includes('"n":0') && r.prompt.includes('Higgsfield is TURNED OFF') && r.args.includes('mcp__claude_ai_Mobbin__search_screens')
    && r.hooksOff.includes('disableAllHooks') && r.hooksRewrite.includes('disableAllHooks') && !r.hooksOff.includes('WebSearch') && r.webOn.includes('WebSearch') && r.webOn.includes('WebFetch') && r.webOn.includes('disableAllHooks') && !r.webOff.includes('WebSearch') && r.webPromptOn && r.webPromptOff
    && r.wav === 'RIFF' && r.transcribe === 'hello from whisper';
  if (process.env.KEEP) console.log('output in', out); else fs.rmSync(data, { recursive: true, force: true });
  // on GitHub, a failure also becomes an annotation with the results, since the job log isn't always at hand
  if (!ok && process.env.GITHUB_ACTIONS) { const { prompt, args, ...brief } = r; console.log('::error title=Smoke test failed::' + JSON.stringify(brief, (k, v) => typeof v === 'string' && v.length > 160 ? v.slice(0, 60) + '…' : v).replace(/%/g, '%25').replace(/\n/g, ' ').slice(0, 6000)); }
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); if (process.env.GITHUB_ACTIONS) console.log('::error title=Smoke test crashed::' + String(e && e.stack || e).replace(/%/g, '%25').replace(/\n/g, '%0A').slice(0, 4000)); process.exit(1); });
