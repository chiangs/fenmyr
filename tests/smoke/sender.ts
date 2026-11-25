import type { Smoke } from './kit.ts';

declare global {
  interface Window {
    __senderReplies: number[];
  }
}

const SUBFRAME = 7000001,
  LOOKALIKE = 7000002,
  MAIN_FRAME = 7000003;

// The bridge answers the window's main frame and no other. A frame inside the page has no preload to send with, so the
// host's two handlers are given the messages as Electron would hand them over from one: with a real subframe of the
// window as the sender, and with a stand-in at the app's own address that is not the main frame. The same messages from
// the main frame go too, as the control: they must leave their mark, or a missing mark from the others proves nothing.
export async function sender(t: Smoke) {
  const { app, page } = t;
  await page.evaluate(async () => {
    window.__senderReplies = [];
    const was = window.__fenmyrReply;
    window.__fenmyrReply = (id, ok, value) => {
      window.__senderReplies.push(id);
      was?.(id, ok, value);
    };
    // The app's own op gives an address the page's policy lets a frame load: a file: one it does not.
    const { url } = await window.Fenmyr.previewPage({ html: '<p>subframe</p>' });
    const f = document.createElement('iframe');
    f.id = 'senderFrame';
    f.src = url;
    document.body.append(f);
    return new Promise<void>(res => f.addEventListener('load', () => res()));
  });
  const sent = await app.evaluate(
    ({ BrowserWindow, ipcMain }, ids) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error('no window');
      const wc = win.webContents,
        sub = wc.mainFrame.frames.find(f => f.url.startsWith('fenmyrpreview:'));
      if (!sub) throw new Error('no subframe');
      const lookalike = { url: wc.mainFrame.url },
        logged: string[] = [],
        warn = console.warn;
      console.warn = (...a: unknown[]) => logged.push(a.join(' '));
      const plant = (id: number, board: string) => ({
        id,
        op: 'save',
        args: { board: { id: board, name: 'Planted', cards: [] } },
      });
      ipcMain.emit('fenmyr', { sender: wc, senderFrame: sub }, plant(ids.sub, 'from-subframe'));
      ipcMain.emit('fenmyr', { sender: wc, senderFrame: lookalike }, plant(ids.lookalike, 'from-lookalike'));
      ipcMain.emit('fenmyr', { sender: wc, senderFrame: wc.mainFrame }, plant(ids.main, 'from-main-frame'));
      const wasMaximized = win.isMaximized();
      ipcMain.emit('win', { sender: wc, senderFrame: sub }, 'maximize');
      const maximizedBySubframe = win.isMaximized();
      ipcMain.emit('win', { sender: wc, senderFrame: wc.mainFrame }, 'maximize');
      const maximizedByMainFrame = win.isMaximized();
      ipcMain.emit('win', { sender: wc, senderFrame: wc.mainFrame }, 'maximize');
      console.warn = warn;
      return {
        logged,
        subUrl: sub.url,
        appUrl: wc.mainFrame.url,
        wasMaximized,
        maximizedBySubframe,
        maximizedByMainFrame,
        restored: !win.isMaximized(),
      };
    },
    { sub: SUBFRAME, lookalike: LOOKALIKE, main: MAIN_FRAME },
  );
  await page.waitForFunction(id => window.__senderReplies.includes(id), MAIN_FRAME);
  const seen = await page.evaluate(async () => {
    const boards = (await Fenmyr.list()).map(b => b.id);
    await Fenmyr.remove('from-main-frame');
    document.getElementById('senderFrame')?.remove();
    return { boards, replies: window.__senderReplies };
  });
  const [first, second, third, ...more] = sent.logged;
  t.checkAll('bridgeSender', {
    mainFrameIsAnswered: seen.boards.includes('from-main-frame') && seen.replies.includes(MAIN_FRAME),
    subframeGetsNoReply: !seen.replies.includes(SUBFRAME) && !seen.replies.includes(LOOKALIKE),
    subframeOpDoesNotRun: !seen.boards.includes('from-subframe') && !seen.boards.includes('from-lookalike'),
    subframeWindowOpDoesNotRun:
      !sent.wasMaximized && !sent.maximizedBySubframe && sent.maximizedByMainFrame && sent.restored,
    oneLogLineEach:
      more.length === 0 &&
      !!first?.includes(sent.subUrl) &&
      !!first.includes('"save"') &&
      !!second?.includes(sent.appUrl) &&
      !!second.includes('"save"') &&
      !!third?.includes(sent.subUrl) &&
      !!third.includes('"maximize"'),
  });
}
