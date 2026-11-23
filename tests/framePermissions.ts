// The microphone, the clipboard and notifications are the app page's own. A frame inside it asks for them and is refused,
// while the page's own voice memo records and its own requests are granted. Fullscreen stays open to a frame, for the
// Spotify embeds. The frames here stand in for any frame the page may hold later (an embed, a plugin, a preview that has
// been given a permission): a prototype's preview is refused by the browser before the host is asked.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

// a fake microphone, so a request that is allowed has a device to open
const l = await launch({ flags: ['--use-fake-device-for-media-stream'] });
const { page } = l;

try {
  await page.evaluate(() => {
    const M = window.__fenmyr;
    M.board.cards.length = 0;
    M.renderAll();
  });
  // the voice memo, as a person makes one: the tool, a spot on the board, Start, Stop
  await page.click('#tools [data-add="audio"]');
  await page.waitForFunction(() => document.getElementById('ghost')?.classList.contains('on'));
  await page.mouse.move(700, 380);
  await page.mouse.click(760, 420);
  await page.click('.card [data-act="au-start"]');
  await page.waitForFunction(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(card => card.type === 'audio');
    return c?.type === 'audio' && c.rec === true && !c.starting && !c.count;
  });
  await page.click('.card [data-act="au-stop"]');
  await page.waitForFunction(() => {
    const c = window.__fenmyr.curBoard()?.cards.find(card => card.type === 'audio');
    return c?.type === 'audio' && c.rec === false && !!c.src?.startsWith('data:audio');
  });

  const refused = ['microphone', 'clipboardRead', 'clipboardWrite'] as const;
  const kinds = [
    { name: 'inside', attrs: { allowfullscreen: '' }, fullscreen: true },
    { name: 'delegated', attrs: { sandbox: 'allow-scripts', allow: 'clipboard-read *; clipboard-write *' } },
  ];
  for (const { name, attrs, fullscreen } of kinds) {
    await page.evaluate(
      ({ name, attrs }) =>
        new Promise<void>(res => {
          const f = document.createElement('iframe');
          f.name = name;
          for (const [k, v] of Object.entries(attrs)) f.setAttribute(k, v);
          f.style.cssText = 'position:fixed;left:400px;top:200px;width:300px;height:200px;z-index:99999';
          f.srcdoc = '<button id="b" style="width:100px;height:100px">go</button>';
          f.addEventListener('load', () => res());
          document.body.append(f);
        }),
      { name, attrs },
    );
    const frame = await (await page.locator(`iframe[name="${name}"]`).elementHandle())?.contentFrame();
    assert.ok(frame, `${name}: the frame is there`);
    // a click gives the frame focus and the user's say-so, which the clipboard and fullscreen both ask for
    await frame.locator('#b').click();
    const got = await frame.evaluate(async () => {
      const outcome = async (go: () => Promise<unknown>) => {
        try {
          await go();
          return 'granted';
        } catch (e) {
          return e instanceof Error ? e.name : String(e);
        }
      };
      const mic = await outcome(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const t of stream.getTracks()) t.stop();
      });
      return {
        microphone: mic,
        clipboardRead: await outcome(() => navigator.clipboard.readText()),
        clipboardWrite: await outcome(() => navigator.clipboard.writeText('x')),
        // what the page is told it has without asking, which the host answers apart from a request
        notificationsNow: Notification.permission,
        notifications: await Notification.requestPermission(),
        fullscreen: await outcome(() => document.documentElement.requestFullscreen()),
      };
    });
    for (const what of refused)
      assert.notStrictEqual(got[what], 'granted', `${name}: ${what} is refused (${got[what]})`);
    assert.strictEqual(got.notificationsNow, 'denied', `${name}: the page is told it has no notifications`);
    assert.strictEqual(got.notifications, 'denied', `${name}: notifications are refused`);
    if (fullscreen) {
      assert.strictEqual(got.fullscreen, 'granted', `${name}: fullscreen is still allowed (${got.fullscreen})`);
      await frame.evaluate(() => document.exitFullscreen());
    }
    await page.evaluate(() => document.querySelector('iframe[style*="99999"]')?.remove());
  }

  // the clipboard is read from a page that has focus, and it went to the frame
  await page.mouse.click(1000, 700);
  const own = await page.evaluate(async () => ({
    clipboardRead: await navigator.clipboard.readText().then(
      () => 'granted',
      (e: unknown) => (e instanceof Error ? e.name : String(e)),
    ),
    notifications: await Notification.requestPermission(),
  }));
  assert.deepStrictEqual(
    own,
    { clipboardRead: 'granted', notifications: 'granted' },
    'the page’s own requests are granted',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('FRAME PERMISSIONS OK');
} finally {
  await l.close();
}
