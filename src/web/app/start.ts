// @ts-nocheck
import { NEWS, maybeNews, newsKey } from './news.ts';
import { openSetup } from './onboarding.ts';
import { checkUpdate } from './updates.ts';
import { fit } from '../canvas/handles.ts';
import { loadTemplates } from '../features/templates.ts';
import { openBoard } from '../library/home.ts';
import { newBoard } from '../model/boards.ts';
import { greet } from '../myra/greet.ts';
import { showConnections } from '../myra/helpers.ts';
import { phone } from '../platform/phone.ts';
import { applySettings } from '../settings/widgets.ts';
import { loadVaults } from '../vault/vaults.ts';
import { appState, session } from '../core/state.ts';
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
    } catch (e) {}
    await openBoard(list.some(b => b.id === last) ? last : list[0].id);
    applySettings();
    phone.init();
    let onboarded = true;
    try {
      onboarded = !!localStorage.getItem('fenmyr:onboarded');
    } catch (e) {}
    if (!onboarded) {
      appState.firstRunSetup = true;
      try {
        localStorage.setItem(newsKey, (await Fenmyr.version().catch(() => null)) || Object.keys(NEWS).pop());
      } catch (e) {}
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
