import type { BoardSummary } from '../../shared/ops.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { folderChain } from './tree.ts';

export const where = () => {
  const f = appState.folders.find(x => x.id === session.board?.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  return { f, p };
};

export function renderCrumbs() {
  if (!session.board) return;
  const { f, p } = where(),
    el = $('crumbs');
  const chainF = f ? folderChain(f) : [];
  el.innerHTML =
    (p ? `<button data-go="project:${p.id}"></button>` : '') +
    chainF
      .map((x, i) => {
        const slash = p || i ? '<i>/</i>' : '';
        return `${slash}<button data-go="folder:${x.id}"></button>`;
      })
      .join('');
  const btns = [...el.querySelectorAll('button')];
  if (p) {
    const [first] = btns;
    if (first) {
      first.textContent = p.name;
      first.title = p.name;
    }
  }
  chainF.forEach((x, i) => {
    const bt = btns[i + (p ? 1 : 0)];
    if (!bt) return;
    bt.textContent = x.name;
    bt.title = x.name;
  });
  // inside a canvas: the boards it lives in, so you can climb back out
  const chain: BoardSummary[] = [];
  let up = session.board.parent;
  while (up && chain.length < 4) {
    const looking = up;
    const pb = appState.boardList.find(x => x.id === looking);
    if (!pb) break;
    chain.unshift(pb);
    up = pb.parent;
  }
  chain.forEach(pb => {
    const slash = el.children.length ? '<i>/</i>' : '';
    el.insertAdjacentHTML('beforeend', `${slash}<button data-board="${pb.id}"></button>`);
    const bt = el.lastElementChild;
    if (!(bt instanceof HTMLElement)) return;
    bt.textContent = pb.name;
    bt.title = `Back to ${pb.name}`;
  });
}
