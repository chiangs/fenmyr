// The app hides what is only for the person looking (a plan's preview, the hints, the picker) by a class for the picture,
// and gives that two frames and 100 ms. A transition delay the tests add to every element puts that change later than
// the picture, so the stand-in host takes each picture once the page's finite animations have ended, as a real one
// with no delay already has. Install it after any wrapper of the test's own, so that wrapper reads what the picture shows.
import type { ElectronApplication } from 'playwright';

export async function pictureWhenStill(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents;
    if (!wc) return;
    // a child that inherits visibility starts its own delayed transition only when its parent's has ended, so one
    // look at the animations is not enough
    const stopped = () =>
      wc.executeJavaScript(`(async () => {
        const frame = () => new Promise(r => requestAnimationFrame(r));
        const busy = () =>
          document.getAnimations().some(a => a.playState === 'running' && a.effect.getComputedTiming().endTime !== Infinity);
        for (let quiet = 0; quiet < 3; ) {
          await frame();
          quiet = busy() ? 0 : quiet + 1;
        }
      })()`);
    const capturePage = wc.capturePage.bind(wc),
      dbg = wc.debugger,
      send = dbg.sendCommand.bind(dbg);
    Reflect.set(wc, 'capturePage', async (rect?: Electron.Rectangle) => {
      await stopped();
      return capturePage(rect);
    });
    Reflect.set(dbg, 'sendCommand', async (method: string, params?: object) => {
      if (method === 'Page.captureScreenshot') await stopped();
      return send(method, params);
    });
  });
}
