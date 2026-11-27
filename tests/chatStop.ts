// While Myra works for the open board the send button is Stop, and pressing it, or Ctrl+., ends her Claude Code for real.
// A stopped question stays in the chat marked Stopped, with one line of hers, leaves the board and the box as they were,
// and a question waiting behind it never reaches Claude Code. An answer that was already on its way when Stop was pressed
// is dropped whole. Enter with words still sends and queues, and the button stays Stop meanwhile.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { alive } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { LINE, stopKit } from './support/stopKit.ts';

const { work, repo } = freshRepo('fenmyr-chat-stop-');
const l = await launch({
  boards: [replyBoard('stop', 'Stop'), replyBoard('other', 'Other')],
  open: 'stop',
  claude: true,
  // the morph runs only with motion on, which the tests turn off
  settings: { motion: true },
});
const { page } = l;
const {
  hold,
  started,
  reply,
  send,
  until,
  begun,
  running,
  button,
  asStop,
  asSend,
  TIP,
  queue,
  mine,
  said,
  lines,
  cards,
  inBox,
  heard,
  gone,
  watchBridge,
  lose,
  ended,
  stops,
  forget,
} = await stopKit(l);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

try {
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('mcInput')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  await watchBridge();

  await check('at rest the button is Send, with its arrow', async () => {
    const at = await button();
    assert.deepStrictEqual(
      [at.stop, at.label, at.tip, at.arrow, at.square, at.title],
      [false, 'Send', TIP.send, 1, 0, null],
    );
    assert.strictEqual(await page.getByRole('button', { name: 'Send', exact: true }).count(), 1, 'named Send');
  });

  await check(
    'while a slow question runs it is Stop, with words in the box too, and Enter queues behind it',
    async () => {
      fs.writeFileSync(hold, '');
      await send('slow first');
      await asStop();
      await still(page);
      const at = await button();
      assert.deepStrictEqual(
        [at.stop, at.label, at.tip, at.arrow, at.square, at.title],
        [true, 'Stop', TIP.stop, 0, 1, null],
        'a square, named Stop, with its key in the tip',
      );
      assert.strictEqual(await page.getByRole('button', { name: 'Stop', exact: true }).count(), 1, 'named Stop');
      assert.strictEqual(await page.getByRole('button', { name: 'Send', exact: true }).count(), 0, 'and not Send');
      await until('the change is announced', async () => (await heard()) === 'Send is now Stop');
      await running('slow first');

      await page.fill('#mcInput', 'second');
      assert.strictEqual((await button()).stop, true, 'it stays Stop with words in the box');
      await page.press('#mcInput', 'Control+Enter');
      await until('the second line is in the chat', async () => (await mine()).length === 2);
      assert.strictEqual(await inBox(), '', 'Enter sent them');
      assert.strictEqual((await button()).stop, true, 'and the button stays Stop');
      assert.deepStrictEqual(
        started().map(s => s.q),
        ['slow first'],
        'the second waits behind the first',
      );

      fs.rmSync(hold);
      await until('the second reaches Claude Code once the first is answered', () => !!begun('second'));
      await until('both are answered', async () => (await lines('ok')) === 2);
      await asSend();
      await still(page);
      assert.strictEqual((await button()).label, 'Send', 'it is Send again');
      await until('and that is announced', async () => (await heard()) === 'Stop is now Send');
      assert.deepStrictEqual(
        (await mine()).map(m => m.mark),
        [null, null],
        'nothing was stopped, so nothing is marked',
      );
      assert.strictEqual(await lines(LINE), 0, 'and she says nothing of stopping');
    },
  );

  await check(
    'Stop kills Claude Code, marks each question stopped and leaves the board and the box alone',
    async () => {
      fs.writeFileSync(hold, '');
      await forget();
      const board = await cards(),
        before = (await said()).length,
        spoken = await lines(LINE),
        count = (await mine()).length;
      await send('slow stop me');
      const pid = await running('slow stop me');
      await queue('queued behind');
      await page.fill('#mcInput', 'my draft words');
      await asStop();
      assert.ok(alive(pid), 'Claude Code is working when Stop is pressed');
      await page.click('.mc-send');
      await gone(pid);
      await asSend();
      await still(page);

      const calls = await stops();
      assert.strictEqual(calls.length, 1, 'one question was in flight');
      assert.strictEqual(calls[0]?.[1], true, 'and the host stopped it');
      assert.deepStrictEqual(
        (await mine()).slice(count),
        [
          { words: 'slow stop me', mark: 'Stopped' },
          { words: 'queued behind', mark: 'Stopped' },
        ],
        'both are marked, the one waiting too',
      );
      assert.strictEqual(await lines(LINE), spoken + 1, 'one line of hers, however many were stopped');
      assert.strictEqual((await said()).length, before + 1, 'and nothing else from her: no failure, no answer');
      assert.strictEqual(await cards(), board, 'the board is as it was');
      assert.strictEqual(await inBox(), 'my draft words', 'so are the words in the box');
      assert.strictEqual(
        await page.evaluate(() => document.activeElement?.id),
        'mcInput',
        'which is where the cursor is, ready to write',
      );
      const at = await button();
      assert.deepStrictEqual([at.stop, at.label, at.tip, at.arrow, at.square], [false, 'Send', TIP.send, 1, 0]);

      // a question after them is what proves the one that waited was never sent: they go through Claude Code in order
      await page.fill('#mcInput', '');
      await queue('after the stop');
      await until('the next question is answered', async () => !!begun('after the stop'));
      await asSend();
      assert.deepStrictEqual(
        started().map(s => s.q),
        ['slow first', 'second', 'slow stop me', 'after the stop'],
        'the one that waited behind it never reached Claude Code',
      );
      assert.strictEqual(await lines(LINE), spoken + 1, 'and she does not repeat herself');
      assert.strictEqual(await cards(), board, 'still nothing on the board');
    },
  );

  await check('a stopped question stays marked in the chat the board keeps', async () => {
    const file = path.join(l.data, 'fenmyr', 'boards', 'stop.json');
    const kept = () =>
      fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, 'utf8')).chat ?? []).filter((m: { stopped?: true }) => m.stopped)
        : [];
    await until('the board file has them', () => kept().length === 2);
    assert.deepStrictEqual(
      kept().map((m: { text: string }) => m.text),
      ['slow stop me', 'queued behind'],
    );
    await page.evaluate(() => window.__fenmyr.openBoard('other'));
    await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'other');
    await page.evaluate(() => window.__fenmyr.openBoard('stop'));
    await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'stop');
    await until('the chat is drawn again', async () => (await mine()).some(m => m.mark === 'Stopped'));
    assert.deepStrictEqual(
      (await mine()).filter(m => m.mark).map(m => m.words),
      ['slow stop me', 'queued behind'],
      'it is read back from the board with its mark',
    );
  });

  await check('Ctrl+. stops from the chat’s box, and not from a note being written', async () => {
    fs.writeFileSync(hold, '');
    await forget();
    const count = (await mine()).length,
      spoken = await lines(LINE);
    await send('slow by key');
    const pid = await running('slow by key');
    await asStop();
    // a note on the board is being typed in: its keys are its own
    await page.evaluate(() => window.__fenmyr.newNote(0, 0));
    await page.waitForFunction(() => !!window.__fenmyr.editing);
    await page.keyboard.press('Control+.');
    assert.strictEqual((await button()).stop, true, 'a note being written keeps Ctrl+.');
    assert.ok(alive(pid), 'and Claude Code goes on');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__fenmyr.editing);
    const kept = await cards();
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('Control+.');
    await gone(pid);
    await asSend();
    assert.deepStrictEqual(
      (await mine()).slice(count),
      [{ words: 'slow by key', mark: 'Stopped' }],
      'from the board it stops her, and marks the question',
    );
    assert.strictEqual(await lines(LINE), spoken + 1, 'with a line of hers');
    assert.strictEqual(await cards(), kept, 'and the board is as it was');

    // and from the chat's own box, with words typed in it
    await send('slow in the box');
    const second = await running('slow in the box');
    await page.fill('#mcInput', 'still mine');
    await page.focus('#mcInput');
    await page.keyboard.press('Control+.');
    await gone(second);
    await asSend();
    assert.strictEqual(await inBox(), 'still mine', 'the words in the box stay');
    assert.strictEqual(await lines(LINE), spoken + 2);
    assert.strictEqual(
      (await stops()).every(([, stopped]) => stopped),
      true,
      'each stop killed its process',
    );
    await page.fill('#mcInput', '');
  });

  await check('the button follows the open board: Stop only on the board she works for', async () => {
    fs.writeFileSync(hold, '');
    await send('slow elsewhere');
    const pid = await running('slow elsewhere');
    await asStop();
    await page.evaluate(() => window.__fenmyr.openBoard('other'));
    await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'other');
    await asSend();
    await page.keyboard.press('Control+.');
    assert.ok(alive(pid), 'Ctrl+. on another board stops nothing of the first');
    await page.evaluate(() => window.__fenmyr.openBoard('stop'));
    await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'stop');
    await asStop();
    await page.click('.mc-send');
    await gone(pid);
    await asSend();
    assert.strictEqual((await button()).label, 'Send', 'it is Send again once she is stopped');
    fs.rmSync(hold, { force: true });
  });

  await check('an answer already on its way when Stop is pressed is dropped whole', async () => {
    // a reply that would change a card and say so, which Claude Code gives after Stop has been pressed
    reply({ say: 'Reworded it!', edit: [{ id: 'n1', text: 'Reworded by a late answer' }] });
    fs.writeFileSync(hold, '');
    await forget();
    const board = await cards(),
      before = (await said()).length,
      spoken = await lines(LINE);
    const oks = await lines('ok');
    const answers = await ended();
    await lose(true);
    await send('slow race');
    const pid = await running('slow race');
    await asStop();
    await page.click('.mc-send');
    await asSend();
    assert.deepStrictEqual(
      (await stops()).map(s => s[1]),
      [false],
      'the stop did not reach a process',
    );
    assert.ok(alive(pid), 'which goes on, and answers');
    assert.strictEqual(await lines(LINE), spoken + 1, 'she says she has stopped');
    await lose(false);
    fs.rmSync(hold);
    await until('its answer reaches the window', async () => (await ended()) === answers + 1);
    await still(page);
    // a question after it is answered only once the one before it is done with, whatever it did
    reply({ say: 'ok' });
    await queue('after the race');
    await until('the question after it is answered', async () => (await lines('ok')) === oks + 1);
    assert.strictEqual(await cards(), board, 'the late answer changed no card');
    assert.ok(!(await said()).some(t => t.includes('Reworded')), 'and said nothing');
    assert.strictEqual((await said()).length, before + 2, 'her stop line and the next answer are all she said');
    assert.strictEqual((await mine()).find(m => m.words === 'slow race')?.mark, 'Stopped');
  });

  await check('the morph runs with motion on and is a plain swap with reduced motion', async () => {
    // work starts and the page is asked at once how many transitions of opacity the two glyphs have begun
    const starts = () =>
      page.evaluate(() => {
        const f = window.__fenmyr;
        Reflect.set(window, 'ends', f.addStoppable({ board: f.board.id, stop: () => {} }));
        // a style read is what starts a transition that the class change calls for
        getComputedStyle(document.querySelector('.ms-go') ?? document.body).opacity;
        return document
          .getAnimations()
          .filter(a => a instanceof CSSTransition && a.transitionProperty === 'opacity')
          .filter(a => a.effect instanceof KeyframeEffect && a.effect.target?.parentElement?.id === 'mcSend').length;
      });
    const ends = () => page.evaluate(() => Reflect.get(window, 'ends')());
    assert.strictEqual(await starts(), 2, 'the arrow fades out and the square in');
    await still(page);
    assert.strictEqual((await button()).square, 1);
    await ends();
    await still(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.strictEqual(await starts(), 0, 'under reduced motion they just swap');
    assert.strictEqual((await button()).square, 1, 'and the square is there');
    await ends();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await still(page);
    assert.strictEqual((await button()).stop, false);
  });

  await check('a prototype’s docked chat has the same button, and stops its question', async () => {
    fs.writeFileSync(hold, '');
    await openPrototype(page, repo);
    await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
    await still(page);
    assert.strictEqual((await button('#prChat .mc-send')).stop, false, 'Send at rest');
    await page.fill('#mcInput', 'slow in the prototype');
    await page.click('#prChat .mc-send');
    const pid = await running('slow in the prototype');
    await asStop('#prChat .mc-send');
    await still(page);
    const at = await button('#prChat .mc-send');
    assert.deepStrictEqual([at.label, at.tip, at.arrow, at.square], ['Stop', TIP.stop, 0, 1]);
    await page.click('#prChat .mc-send');
    await gone(pid);
    await asSend('#prChat .mc-send');
    assert.strictEqual(
      (await mine()).find(m => m.words === 'slow in the prototype')?.mark,
      'Stopped',
      'its question is marked in the prototype’s chat',
    );
    assert.ok((await said()).includes(LINE), 'and she says so there');
  });

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('CHAT STOP OK');
} finally {
  fs.rmSync(hold, { force: true });
  for (const s of started()) if (alive(s.pid)) process.kill(s.pid);
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
