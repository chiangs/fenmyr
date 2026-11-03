import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// The bridge: saving and loading boards (big ones too), folders, fonts, an unknown operation, media with byte ranges,
// exports, Claude Code (through a stand-in) and whisper.cpp (through another).
export async function bridge(t: Smoke) {
  const { page, data } = t;
  const r = await page.evaluate(async () => {
    const H = window.__fenmyr,
      first = {
        name: H.board.name,
        cards: H.board.cards.length,
        tray: H.board.tray.length,
        kanban: H.board.cards.some(c => c.type === 'coll' && c.kanban),
      }; // the first board people see
    // a number that isn't one is saved as 0
    const note = { id: 'c1', type: 'note' as const, x: 0, y: 0, w: 220, h: 140, text: 'hi', bad: NaN },
      board = { id: 'smoke1', name: 'Smoke', color: 'mint', cards: [note] };
    const save = await Fenmyr.save(board),
      loaded = await Fenmyr.load('smoke1'),
      bad =
        loaded && Array.isArray(loaded.cards)
          ? Object.entries(loaded.cards[0] ?? {}).find(([k]) => k === 'bad')?.[1]
          : undefined;
    // a big board (pictures make them many MB) goes there and back intact
    const big = 'x'.repeat(20e6),
      t0 = performance.now();
    await Fenmyr.save({
      id: 'big',
      name: 'Big',
      cards: [{ id: 'b', type: 'image', x: 0, y: 0, w: 1, h: 1, src: big }],
    });
    const back = await Fenmyr.load('big'),
      backSrc =
        back && Array.isArray(back.cards) ? Object.entries(back.cards[0] ?? {}).find(([k]) => k === 'src')?.[1] : '',
      bigOk = typeof backSrc === 'string' && backSrc.length === big.length,
      bigMs = Math.round(performance.now() - t0);
    await Fenmyr.remove('big');
    const list = (await Fenmyr.list()).some(b => b.id === 'smoke1'),
      saved = await Fenmyr.saveFolders([{ id: 'f', name: 'F' }]),
      kept = await Fenmyr.folders(),
      folders = saved && Array.isArray(kept) ? kept.length : 0,
      fonts = (await Fenmyr.fonts()).length,
      version = await Fenmyr.version(),
      usage = typeof (await Fenmyr.usage()).today.asks,
      speech = await Fenmyr.speechAuth();
    const unknown = await new Promise(res => {
      const id = 999999,
        o = window.__fenmyrReply;
      window.__fenmyrReply = (i, ok, v) => {
        if (i === id) {
          window.__fenmyrReply = o;
          res(v);
        } else o?.(i, ok, v);
      };
      window.fenmyrHost?.post({ id, op: 'nope', args: {} });
    });
    // a video goes in by chunks and comes back through fenmyrmedia:// with byte ranges
    const blob = new Blob([new Uint8Array(5000).fill(7)], { type: 'video/mp4' }),
      media = await Fenmyr.saveMedia(blob),
      part = await fetch(media, { headers: { Range: 'bytes=100-199' } }),
      range = [part.status, (await part.arrayBuffer()).byteLength];
    const png = await Fenmyr.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: false, scale: 2 }),
      pdf = await Fenmyr.exportRect({ x: 0, y: 0, w: 300, h: 200, name: 'shot', pdf: true, scale: 2 }),
      docx = await Fenmyr.saveFile(btoa('hello'), 'Doc', 'docx'),
      docPDF = await Fenmyr.docPDF(
        '<!doctype html><link rel="stylesheet" href="__WEB__/fonts.css"><h1 style="font-family:DM Sans">Hello</h1><p>' +
          'words '.repeat(2000) +
          '</p>',
        'Doc',
        'a4',
      );
    const conn = await Fenmyr.connections(),
      ask = await Fenmyr.ask('sort these', { cards: [], n: Infinity }, false, { mobbin: true, higgs: false }),
      usage2 = (await Fenmyr.usage()).today;
    // a real webm voice memo, recorded from a tone, goes through the WAV conversion
    const ac = new AudioContext(),
      osc = ac.createOscillator(),
      dst = ac.createMediaStreamDestination();
    osc.connect(dst);
    osc.start();
    const rec = new MediaRecorder(dst.stream),
      chunks: Blob[] = [];
    rec.ondataavailable = e => chunks.push(e.data);
    await new Promise(res => {
      rec.onstop = res;
      rec.start();
      setTimeout(() => rec.stop(), 600);
    });
    const memo = await new Promise<string>(res => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.readAsDataURL(new Blob(chunks, { type: rec.mimeType }));
    });
    const speech2 = await Fenmyr.speechAuth(),
      transcribe = await Fenmyr.transcribe(memo);
    return {
      native: Fenmyr.native,
      linux: document.documentElement.classList.contains('linux'),
      first,
      save,
      bad,
      bigOk,
      bigMs,
      list,
      folders,
      fonts,
      version,
      usage,
      speech,
      unknown,
      media,
      range,
      png,
      pdf,
      docx,
      docPDF,
      conn,
      ask,
      usage2,
      memoType: rec.mimeType,
      speech2,
      transcribe,
    };
  });
  const prompt = () => fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8'),
    args = fs.readFileSync(path.join(data, 'args.txt'), 'utf8').slice(-120),
    asked = prompt(),
    wav = fs.readFileSync(path.join(data, 'wav-magic.txt'), 'utf8');
  t.check('native', !!r.native && r.linux);
  t.check('save', !!r.save && r.bad === 0 && r.list && r.folders === 1 && r.fonts > 0, {
    save: r.save,
    bad: r.bad,
    list: r.list,
    folders: r.folders,
    fonts: r.fonts,
  });
  t.check('big', r.bigOk, r.bigMs);
  t.check('unknownOp', r.unknown === 'unknown op nope', r.unknown);
  t.check('range', r.range[0] === 206 && r.range[1] === 100, r.range);
  t.checkAll('first', {
    name: r.first.name === 'My first board',
    cards: r.first.cards === 15,
    tray: r.first.tray === 5,
    kanban: r.first.kanban,
  });
  t.check('connections', r.conn.mobbin === true && r.conn.higgsfield === false, r.conn);
  t.check('ask', typeof r.ask === 'string' && JSON.parse(r.ask).say === 'hi from fake claude', r.ask);
  t.check('usage', r.usage2.asks === 1 && r.usage2.tokensIn === 15, r.usage2);
  t.checkAll('prompt', {
    question: asked.includes('The person asked you: sort these'),
    icons: asked.includes('Icons are names from this list'),
    board: asked.includes('"n":0'),
    higgsOff: asked.includes('Higgsfield is TURNED OFF'),
    mobbin: args.includes('mcp__claude_ai_Mobbin__search_screens'),
  });
  t.check('wav', wav === 'RIFF', wav);
  t.check('transcribe', r.transcribe === 'hello from whisper', r.transcribe);
  // Claude Code hooks are always off for Myra's calls; the web (search and public pages) is only on when Settings → Helpers says so
  const runs = await page.evaluate(async () => {
    const argsAfter = async (fn: () => Promise<unknown>) => {
      await fn();
      return window.__readArgs();
    };
    return {
      hooksOff: await argsAfter(() => Fenmyr.ask('again', {}, false, { mobbin: false, higgs: false })),
      hooksRewrite: await argsAfter(() => Fenmyr.rewrite('text', 'shorter', 'Doc', '')),
      webOn: await argsAfter(() => Fenmyr.ask('look this up', {}, false, { mobbin: false, higgs: false, web: true })),
    };
  });
  const webPromptOn = prompt().includes('search the web and read public pages');
  const webOff = await page.evaluate(async () => {
    await Fenmyr.ask('and this', {}, false, { mobbin: false, higgs: false });
    return window.__readArgs();
  });
  t.checkAll('claudeArgs', {
    hooksOff: runs.hooksOff.includes('disableAllHooks') && !runs.hooksOff.includes('WebSearch'),
    hooksRewrite: runs.hooksRewrite.includes('disableAllHooks'),
    webOn:
      runs.webOn.includes('WebSearch') && runs.webOn.includes('WebFetch') && runs.webOn.includes('disableAllHooks'),
    webOff: !webOff.includes('WebSearch'),
    webPromptOn,
    webPromptOff: prompt().includes('switched off in Settings'),
  });
}
