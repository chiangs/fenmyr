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
    && r.pngSize[0] === 600 && r.pdfPages >= 2 && files.includes('shot.pdf') && files.includes('Doc.docx') && r.boardOnDisk && r.big && r.licenses > 60 && r.licMochiboard && r.licJszip && r.gridShapes === 'dot,cross,square,cloudberry,berry,leaf' && r.licPhosphor && r.fontLora && r.fontBack && !r.icoMissing.length && r.icoCount >= 19 && r.icoPick > 150 && r.icoPlaceholder && r.icoRegular && r.icoDuo && r.chromiumFile && !errors.length
    && r.conn.mobbin === true && r.conn.higgsfield === false && JSON.parse(r.ask).say === 'hi from fake claude' && r.usage2.asks === 1 && r.usage2.tokensIn === 15
    && r.prompt.includes('The person asked you: sort these') && r.prompt.includes('Icons are names from this list') && r.prompt.includes('"n":0') && r.prompt.includes('Higgsfield is TURNED OFF') && r.args.includes('mcp__claude_ai_Mobbin__search_screens')
    && r.hooksOff.includes('disableAllHooks') && r.hooksRewrite.includes('disableAllHooks') && !r.hooksOff.includes('WebSearch') && r.webOn.includes('WebSearch') && r.webOn.includes('WebFetch') && r.webOn.includes('disableAllHooks') && !r.webOff.includes('WebSearch') && r.webPromptOn && r.webPromptOff
    && r.wav === 'RIFF' && r.transcribe === 'hello from whisper';
  if (process.env.KEEP) console.log('output in', out); else fs.rmSync(data, { recursive: true, force: true });
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
