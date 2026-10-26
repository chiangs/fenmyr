// End-to-end smoke test: opens the real app (under Xvfb in CI) with a throwaway data folder, and drives the bridge.
//   xvfb-run -a node tests/smoke.js
//   MYRA_APP=~/.local/lib/myra/app xvfb-run -a node tests/smoke.js   (an installed copy, with the Electron install.sh chose)
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'myra-smoke-')), out = path.join(data, 'out');
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
  const dir = process.env.MYRA_APP || path.join(__dirname, '..');
  const installed = process.env.MYRA_APP ? JSON.parse(fs.readFileSync(path.join(dir, 'install.json'), 'utf8')) : {};
  const app = await electron.launch({ ...(installed.electron ? { executablePath: installed.electron } : {}), args: [dir, '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data, MYRA_WHISPER_MODEL: path.join(data, 'model.bin') } });
  // save dialogs answer themselves: everything lands in out/
  await app.evaluate(({ dialog }, out) => { dialog.showSaveDialog = async (w, o) => ({ canceled: false, filePath: out + '/' + o.defaultPath.split('/').pop() }); }, out);
  const page = await app.firstWindow(), errors = [];
  await page.exposeFunction('__readArgs', () => fs.readFileSync(path.join(data, 'args.txt'), 'utf8'));
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '') && errors.push(m.text()));   // Google Fonts can't be reached from every test machine
  await page.waitForFunction(() => window.Myra && document.querySelector('#side'));
  await page.waitForTimeout(2000);
  const r = await page.evaluate(async () => {
    const res = { native: Myra.native, linux: document.documentElement.classList.contains('linux') };
    res.first = { name: __myra.board.name, cards: __myra.board.cards.length, tray: __myra.board.tray.length, kanban: __myra.board.cards.some(c => c.kanban) };   // the first board people see
    const board = { id: 'smoke1', name: 'Smoke', color: 'mint', cards: [{ id: 'c1', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'hi', bad: NaN }] };
    res.save = await Myra.save(board);
    res.load = (await Myra.load('smoke1')).cards[0].bad;
    // a big board (pictures make them many MB) goes there and back intact
    const big = 'x'.repeat(20e6); let t = performance.now();
    await Myra.save({ id: 'big', name: 'Big', cards: [{ id: 'b', type: 'image', src: big }] }); const back = await Myra.load('big');
    res.big = back.cards[0].src.length === big.length; res.bigMs = Math.round(performance.now() - t); await Myra.remove('big');
    res.list = (await Myra.list()).some(b => b.id === 'smoke1');
    res.folders = await Myra.saveFolders([{ id: 'f', name: 'F' }]) && (await Myra.folders()).length;
    res.fonts = (await Myra.fonts()).length;
    res.version = await Myra.version();
    res.usage = typeof (await Myra.usage()).today.asks;
    res.speech = await Myra.speechAuth();
    res.unknown = await new Promise(r => { const id = 999999; const o = window.__myraReply; window.__myraReply = (i, ok, v) => { if (i === id) { window.__myraReply = o; r(v); } else o(i, ok, v); }; window.myraHost.post({ id, op: 'nope', args: {} }); });
    // a video goes in by chunks and comes back through myramedia:// with byte ranges
    const blob = new Blob([new Uint8Array(5000).fill(7)], { type: 'video/mp4' });
    const src = await Myra.saveMedia(blob); res.media = src;
    const part = await fetch(src, { headers: { Range: 'bytes=100-199' } }); res.range = [part.status, (await part.arrayBuffer()).byteLength];
    res.png = await Myra.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: false, scale: 2 });
    res.pdf = await Myra.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: true, scale: 2 });
    res.docx = await Myra.saveFile(btoa('hello'), 'Doc', 'docx');
    res.docPDF = await Myra.docPDF('<!doctype html><link rel="stylesheet" href="__WEB__/fonts.css"><h1 style="font-family:DM Sans">Hello</h1><p>' + 'words '.repeat(2000) + '</p>', 'Doc', 'a4');
    res.conn = await Myra.connections();
    res.ask = await Myra.ask('sort these', { cards: [], n: Infinity }, false, { mobbin: true, higgs: false });
    res.usage2 = (await Myra.usage()).today;
    // a real webm voice memo, recorded from a tone, goes through the WAV conversion
    const ac = new AudioContext(), osc = ac.createOscillator(), dst = ac.createMediaStreamDestination(); osc.connect(dst); osc.start();
    const rec = new MediaRecorder(dst.stream), chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    await new Promise(r => { rec.onstop = r; rec.start(); setTimeout(() => rec.stop(), 600); });
    const memo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType })); });
    res.memoType = rec.mimeType; res.speech2 = await Myra.speechAuth(); res.transcribe = await Myra.transcribe(memo);
    return res;
  });
  r.prompt = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8'); r.args = fs.readFileSync(path.join(data, 'args.txt'), 'utf8').slice(-120); r.wav = fs.readFileSync(path.join(data, 'wav-magic.txt'), 'utf8');
  // Claude Code hooks are always off for Myra's calls; the web (search and public pages) is only on when Settings → Helpers says so
  Object.assign(r, await page.evaluate(async () => {
    const argsAfter = async fn => { await fn(); return window.__readArgs(); }, res = {};
    res.hooksOff = await argsAfter(() => Myra.ask('again', {}, false, { mobbin: false, higgs: false }));
    res.hooksRewrite = await argsAfter(() => Myra.rewrite('text', 'shorter', 'Doc', ''));
    res.webOn = await argsAfter(() => Myra.ask('look this up', {}, false, { mobbin: false, higgs: false, web: true }));
    return res;
  }));
  r.webPromptOn = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8').includes('search the web and read public pages');
  r.webOff = await page.evaluate(async () => (await Myra.ask('and this', {}, false, { mobbin: false, higgs: false }), window.__readArgs()));
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
    const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__myra, res = {};
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
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__myra, res = {};
      const v = await Myra.vaultAdd(vp); await Myra.vaultUpdate(v.id, { off: ['Private'] });
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
  { await page.evaluate(async () => { const M = window.__myra, v = (await Myra.vaults())[0]; M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: false, write: false }]; });
    await page.mouse.click(5, 300); await page.keyboard.press('Alt+n'); await page.waitForTimeout(500);
    r.vault.altN = await page.evaluate(() => !!document.getElementById('vaultPick')); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  // Myra reads vault notes with AI: only with the grant's switch on and the chip ticked for that question; only allowed folders; and she says what she read
  { const promptNow = () => fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8');
    r.vaultAI = await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__myra, v = (await Myra.vaults())[0], res = {}, chip = () => document.getElementById('mcVault');
      M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: false, write: false }]; M.applyToolbar(); res.chipHiddenWhenOff = chip().hidden;
      M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: true, write: false }]; M.applyToolbar(); res.chipShown = !chip().hidden;
      await M.ask('what do I know about cloudberries?'); return res; });
    r.vaultAI.withoutChip = !promptNow().includes('dries out by August') && !promptNow().includes('FROM THEIR OBSIDIAN VAULT') && promptNow().includes('did not ask you to this time');
    Object.assign(r.vaultAI, await page.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__myra, res = {};
      document.getElementById('mcVault').click(); res.chipOn = document.getElementById('mcVault').classList.contains('on');
      await M.ask('what do I know about cloudberries?'); await wait(300);
      res.said = document.body.innerText.includes('I read 2 notes from your vault'); res.chipReset = !document.getElementById('mcVault').classList.contains('on');
      return res; }));
    const p = promptNow();
    r.vaultAI.withChip = p.includes('FROM THEIR OBSIDIAN VAULT') && p.includes('dries out by August') && p.includes('Pack boots') && !p.includes('Cloudberries ripen from amber') && !p.includes('Nobody should read this') && !p.includes('Dear diary');
    // notes she lists become cards, but only ones she was given
    r.vaultAI.cards = await page.evaluate(async () => { const M = window.__myra, v = (await Myra.vaults())[0], n = M.board.cards.filter(c => c.type === 'vnote').length;
      await M.applyMyra({ say: 'ok', vaultNotes: [{ vault: v.name, path: 'Projects/Bog Notes/East bog.md' }, { vault: v.name, path: 'Private/Diary.md' }] }, 'q', { asked: true, used: [{ vault: v.name, vaultId: v.id, rel: 'Projects/Bog Notes/East bog.md', title: 'East bog', tags: ['place'], props: [], excerpt: 'x', text: 'x' }] });
      const now = M.board.cards.filter(c => c.type === 'vnote').length; M.board.vaultAccess = []; M.applyToolbar(); return now - n; }); }
  // connectors: weight (regular, medium, bold) and colour from the bar, remembered for the next connector, and a reset
  r.wire = await page.evaluate(async () => {
    const wait = ms => new Promise(res => setTimeout(res, ms)), M = window.__myra, res = {}, b = M.board;
    const mk = (id, x, y) => ({ id, type: 'note', x, y, w: 200, h: 90, r: 0, text: id, color: 'butter' }); b.cards.push(mk('wA', -900, 900), mk('wB', -500, 1000)); b.cards.slice(-2).forEach(c => M.renderCard(c));
    b.links.push({ id: 'WL', a: 'wA', b: 'wB', arrow: true }); M.selectWire('WL'); await wait(400);
    const bar = () => document.getElementById('selbar'), pathStyle = () => document.querySelector('.wires path.w')?.getAttribute('style') || '';
    res.order = [...bar().children].map(e => e.className.includes('sb-popw') ? e.dataset.popw : e.textContent.trim()).slice(0, 5).join();
    document.querySelector('[data-pop="wcol"]').click(); await wait(200); bar().querySelector('[data-wb="col:#4f8fc9"]').click(); await wait(300);
    document.querySelector('[data-pop="wwt"]').click(); await wait(200); res.weights = [...bar().querySelectorAll('[data-wb^="w:"] span')].map(e => e.textContent).join();
    bar().querySelector('[data-wb="w:6"]').click(); await wait(300);
    const l = b.links.find(x => x.id === 'WL'); res.set = l.color === '#4f8fc9' && l.w === 6; res.drawn = [...document.querySelectorAll('.wires path')].some(p => (p.getAttribute('style') || '').includes('stroke:#4f8fc9;stroke-width:6'));
    res.last = JSON.stringify(JSON.parse(localStorage.getItem('myra:settings')).wireStyle); res.halo = !!document.querySelector('.wires path.w-halo');
    bar().querySelector('[data-wb="reset"]').click(); await wait(300);
    res.reset = !l.color && !l.w && !JSON.parse(localStorage.getItem('myra:settings')).wireStyle && !pathStyle().includes('stroke:#');
    b.links = b.links.filter(x => x.id !== 'WL'); b.cards = b.cards.filter(c => !['wA', 'wB'].includes(c.id)); M.selectWire(null); return res;
  });
  // sidebar rows: hovering shows the row's buttons without making the row taller than its neighbours, and their icons have a real size
  { await page.waitForFunction(() => [...document.querySelectorAll('.board-row')].some(r => r.parentElement.querySelectorAll(':scope > .board-row').length > 1) && document.querySelector('.board-row').getBoundingClientRect().height > 0);
    await page.locator('.board-row').first().hover(); await page.waitForTimeout(250);
    r.rowHover = await page.evaluate(() => { const e = document.querySelector('.board-row:hover'); if (!e) return { same: false, shown: false, icon: false };
      const b = e.querySelector('.f-btn'), sv = b && b.querySelector('svg'), h = e.getBoundingClientRect().height, others = [...e.parentElement.querySelectorAll(':scope > .board-row')].filter(x => x !== e).map(x => x.getBoundingClientRect().height).filter(x => x > 0);
      return { same: others.every(x => Math.abs(x - h) < 1.5), shown: !!b && getComputedStyle(b).display !== 'none', icon: !!sv && sv.getBoundingClientRect().width >= 12 }; }); }
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
  r.files = files; r.errors = errors; r.boardOnDisk = fs.existsSync(path.join(data, 'myra/boards/smoke1.json'));
  console.log(JSON.stringify({ ...r, prompt: r.prompt.slice(0, 120) + '…', hooksOff: r.hooksOff.slice(-160), webOn: r.webOn.slice(-120), webOff: r.webOff.slice(-120), hooksRewrite: r.hooksRewrite.slice(-100) }, null, 1));
  await app.close();
  const ok = r.native && r.linux && r.save && r.load === 0 && r.list && r.folders === 1 && r.fonts > 0 && r.unknown === 'unknown op nope' && r.range[0] === 206 && r.range[1] === 100
    && r.pngSize[0] === 600 && r.pdfPages >= 2 && files.includes('shot.pdf') && files.includes('Doc.docx') && r.boardOnDisk && r.big && r.licenses > 60 && r.licMochiboard && r.licJszip && r.gridShapes === 'dot,cross,square,cloudberry,berry,leaf' && r.tree.name && r.tree.cards >= 12 && r.kickoff.name && r.kickoff.cards >= 18 && r.kanban.cols.join() === 'To do,Doing,Done' && r.kanban.counts.join() === '2,1 / 3,1' && r.first.name === 'My first board' && r.first.cards === 15 && r.first.tray === 5 && r.first.kanban && r.kanban.menu && r.vault.names === '2026-10-20,Cloudberries,East bog,Long,Trip plan' && r.vault.title === 'Trip plan' && r.vault.tags === 'trip,cloudberries,today' && r.vault.shown && r.vault.tool && r.vault.side && r.vault.beforeFull && r.vault.fullShown && !r.vault.fullSaved && r.vault.lessAgain && r.vault.blocked && r.vault.altN && r.rowHover.same && r.rowHover.shown && r.rowHover.icon && r.wire.order === 'Connector,wcol,wwt,,Curved' && r.wire.weights === 'Regular,Medium,Bold' && r.wire.set && r.wire.drawn && r.wire.last === '{"w":6,"color":"#4f8fc9"}' && r.wire.halo && r.wire.reset && r.vaultAI.chipHiddenWhenOff && r.vaultAI.chipShown && r.vaultAI.withoutChip && r.vaultAI.chipOn && r.vaultAI.withChip && r.vaultAI.said && r.vaultAI.chipReset && r.vaultAI.cards === 1 && r.tplSaved && r.tplRow && r.tplAdds && r.tplNew && r.licPhosphor && r.fontLora && r.fontBack && !r.icoMissing.length && r.icoCount >= 19 && r.icoPick > 150 && r.icoPlaceholder && r.icoRegular && r.icoDuo && r.chromiumFile && !errors.length
    && r.conn.mobbin === true && r.conn.higgsfield === false && JSON.parse(r.ask).say === 'hi from fake claude' && r.usage2.asks === 1 && r.usage2.tokensIn === 15
    && r.prompt.includes('The person asked you: sort these') && r.prompt.includes('Icons are names from this list') && r.prompt.includes('"n":0') && r.prompt.includes('Higgsfield is TURNED OFF') && r.args.includes('mcp__claude_ai_Mobbin__search_screens')
    && r.hooksOff.includes('disableAllHooks') && r.hooksRewrite.includes('disableAllHooks') && !r.hooksOff.includes('WebSearch') && r.webOn.includes('WebSearch') && r.webOn.includes('WebFetch') && r.webOn.includes('disableAllHooks') && !r.webOff.includes('WebSearch') && r.webPromptOn && r.webPromptOff
    && r.wav === 'RIFF' && r.transcribe === 'hello from whisper';
  if (process.env.KEEP) console.log('output in', out); else fs.rmSync(data, { recursive: true, force: true });
  // on GitHub, a failure also becomes an annotation with the results, since the job log isn't always at hand
  if (!ok && process.env.GITHUB_ACTIONS) { const { prompt, args, ...brief } = r; console.log('::error title=Smoke test failed::' + JSON.stringify(brief).replace(/%/g, '%25').replace(/\n/g, ' ').slice(0, 6000)); }
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
