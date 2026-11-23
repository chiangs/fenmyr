import type { Smoke } from './kit.ts';

// With the Pen in hand, Backspace, Delete, Enter and Esc typed into a text box belong to the box. They take back no point
// and end no line, and on the board they still do both. Myra's box passes Backspace and Delete to the window, and the
// board's name takes all four.
export async function penTyping(t: Smoke) {
  const { page } = t;
  const look = () =>
    page.evaluate(() => ({
      pen: window.__t.el('#stage').classList.contains('pen-mode'),
      points: document.querySelectorAll('.pen-live .pl-pt').length,
      draft: window.__t.field('#mcInput').value,
    }));
  await page.evaluate(() => window.__t.el('#mcInput').blur());
  await page.keyboard.press('Shift+P');
  const spots = await page.evaluate(() => {
    const stage = window.__t.el('#stage'),
      { x, y, width, height } = stage.getBoundingClientRect(),
      free: { x: number; y: number }[] = [];
    for (const down of [0.3, 0.4, 0.5, 0.6, 0.7])
      for (const across of [0.25, 0.3, 0.35, 0.4, 0.45])
        if (document.elementFromPoint(x + width * across, y + height * down) === stage)
          free.push({ x: x + width * across, y: y + height * down });
    return free.slice(0, 2);
  });
  for (const spot of spots) await page.mouse.click(spot.x, spot.y);
  const placed = await look();
  await page.focus('#mcInput');
  await page.keyboard.type('abc');
  await page.keyboard.press('Backspace');
  const backspaced = await look();
  await page.keyboard.press('Home');
  await page.keyboard.press('Delete');
  const deleted = await look();
  await page.fill('#mcInput', '');
  await page.focus('#boardName');
  await page.keyboard.press('Enter');
  const entered = await look();
  await page.keyboard.press('Escape');
  const escaped = await look();
  await page.evaluate(() => window.__t.el('#boardName').blur());
  await page.keyboard.press('Backspace');
  const onTheBoard = await look();
  await page.keyboard.press('Escape');
  const ended = await look();
  t.checkAll('penTyping', {
    twoPointsPlaced: placed.pen && placed.points === 2,
    backspaceDeletesALetter: backspaced.draft === 'ab' && backspaced.points === 2,
    deleteDeletesALetter: deleted.draft === 'b' && deleted.points === 2,
    enterLeavesTheLine: entered.pen && entered.points === 2,
    escLeavesTheLine: escaped.pen && escaped.points === 2,
    backspaceOnTheBoardTakesBackAPoint: onTheBoard.pen && onTheBoard.points === 1,
    escOnTheBoardEndsTheLine: !ended.pen,
  });
}
