import { fit } from '../canvas/handles.ts';
import { appState, session } from '../core/state.ts';
import { loadTemplates } from '../features/templates.ts';
import { loadLib } from '../library/nesting.ts';
import { openBoard } from '../library/openBoard.ts';
import { newBoard } from '../model/boards.ts';
import { greet } from '../myra/greet.ts';
import { showConnections } from '../myra/helpers.ts';
import { phone } from '../platform/phone.ts';
import { applySettings } from '../settings/widgets.ts';
import { loadVaults } from '../vault/vaults.ts';
import { currentVersion, maybeNews, newsKey } from './news.ts';
import { openSetup } from './onboarding.ts';
import { checkUpdate } from './updates.ts';
export function init64() {
  // ---------- start ----------
  (async () => {
    loadTemplates();
    loadVaults();
    let list = await Fenmyr.list();
    if (!list.length) {
      const b = newBoard('My first board', 'My first board');
      await Fenmyr.save(b);
      list = await Fenmyr.list();
    }
    let last = null;
    try {
      last = localStorage.getItem('fenmyr:last');
    } catch (_e) {}
    const first = list.find(b => b.id === last) ?? list[0];
    // projects and folders before the first board: a prototype board finds its repo through them
    await loadLib();
    if (first) await openBoard(first.id);
    applySettings();
    phone.init();
    let onboarded = true;
    try {
      onboarded = !!localStorage.getItem('fenmyr:onboarded');
    } catch (_e) {}
    if (!onboarded) {
      appState.firstRunSetup = true;
      try {
        localStorage.setItem(newsKey, await currentVersion());
      } catch (_e) {}
      setTimeout(() => {
        fit(session.board.cards);
        openSetup();
      }, 400);
      showConnections(true);
      return;
    } // brand new: the tour covers it, no what's new
    setTimeout(() => {
      fit(session.board.cards);
      greet('start');
    }, 400);
    showConnections(true);
    setTimeout(maybeNews, 700);
    setTimeout(() => checkUpdate(), 4000);
  })();
}
