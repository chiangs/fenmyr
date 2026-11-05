import type { MapFile } from '../types.ts';
import type { VGraph, VNode } from '../visible.ts';
import { data, state } from './ctx.ts';
import { byId, h, plural } from './h.ts';
import { colourOf } from './scene.ts';

const put = (id: string, ...kids: Node[]) => byId(id, HTMLElement).replaceChildren(...kids);

// a button that selects the circle it names
function row(n: VNode, sub: string, count: number, share: number | null) {
  const label = h('span', { class: 'nm', text: n.label }, sub ? h('small', { text: sub }) : null);
  const bar = share === null ? null : h('span', { class: 'bar2' });
  bar?.style.setProperty('width', `${share}%`);
  return h('button', { class: 'row', data: { k: n.key } }, bar, label, h('span', { class: 'n', text: String(count) }));
}

const heading = (text: string) => h('h2', { text });

export function renderTop(g: VGraph) {
  const list = [...g.nodes].sort((a, b) => b.deg - a.deg).slice(0, g.mode === 'files' ? 14 : 10),
    max = list[0]?.deg || 1;
  byId('topH', HTMLElement).textContent = g.mode === 'files' ? 'Most connected files' : 'Most connected areas';
  put(
    'top',
    ...list.map(n => row(n, g.mode === 'files' ? n.area : '', n.deg, Math.max(3, Math.round((100 * n.deg) / max)))),
  );
}

function group(title: string, tone: 'out' | 'in', rows: Node[]) {
  const mark = h('i');
  mark.style.borderColor = `var(--${tone})`;
  const body = rows.length ? rows : [h('div', { class: 'none', text: 'None' })];
  return h('div', {}, h('h3', {}, mark, `${title} (${rows.length})`), h('div', { class: 'rows' }, ...body));
}

function fileDetail(n: VNode, file: MapFile | undefined): Node[] {
  const area = data().areas.get(n.area);
  const byWeight = (list: VNode[]) => [...list].sort((a, b) => b.deg - a.deg).map(m => row(m, m.area, m.deg, null));
  return [
    heading('Selected file'),
    h('p', { class: 'd-name', text: n.label }),
    h('p', { class: 'dpath', text: file?.dir ?? '' }),
    h('p', { class: 'what', text: file?.description ?? '' }),
    h('p', { class: 'what sm' }, h('b', { text: `${n.area}: ` }), area?.description ?? ''),
    h(
      'div',
      { class: 'meta' },
      h('span', { class: 'tag', text: n.area }),
      h('span', { class: 'tag', text: `${n.lines} lines` }),
      h('span', { class: 'tag', text: plural(n.deg, 'connection') }),
      file?.inCycle ? h('span', { class: 'tag warn', text: 'in the import cycle' }) : null,
    ),
    h('div', { class: 'lists' }, group('Imports', 'out', byWeight(n.out)), group('Imported by', 'in', byWeight(n.inn))),
  ];
}

function areaDetail(n: VNode, g: VGraph): Node[] {
  const side = (mine: (e: VGraph['edges'][number]) => boolean, other: (e: VGraph['edges'][number]) => VNode) =>
    g.edges
      .filter(mine)
      .sort((a, b) => b.w - a.w)
      .map(e => row(other(e), '', e.w, null));
  return [
    heading('Selected area'),
    h('p', { class: 'd-name', text: n.area }),
    h('p', { class: 'what', text: data().areas.get(n.area)?.description ?? '' }),
    h(
      'div',
      { class: 'meta' },
      h('span', { class: 'tag', text: plural(n.files, 'file') }),
      h('span', { class: 'tag', text: `${n.lines.toLocaleString()} lines` }),
    ),
    h(
      'div',
      { class: 'lists' },
      group(
        'Imports from',
        'out',
        side(
          e => e.a === n,
          e => e.b,
        ),
      ),
      group(
        'Imported by',
        'in',
        side(
          e => e.b === n,
          e => e.a,
        ),
      ),
    ),
    h('button', { class: 'clear', type: 'button', text: 'Show its files', data: { act: 'files' } }),
  ];
}

export function renderDetail(g: VGraph) {
  const n = state.sel;
  if (!n) {
    return put(
      'detail',
      heading('Selected'),
      h('p', {
        class: 'none flush',
        text: 'Click a circle to see what it imports (blue) and what imports it (orange). Hovering previews the same.',
      }),
    );
  }
  const body = g.mode === 'files' ? fileDetail(n, n.path ? data().files.get(n.path) : undefined) : areaDetail(n, g);
  put(
    'detail',
    ...body,
    h('button', { class: 'clear', type: 'button', text: 'Clear selection', data: { act: 'clear' } }),
  );
}

export function renderLegend() {
  const chips = data().map.areas.map(a => {
    const dot = h('i');
    dot.style.background = colourOf(a.id);
    const chip = h(
      'button',
      { class: 'chip', type: 'button', title: a.description, pressed: state.area === a.id, data: { a: a.id } },
      dot,
      `${a.id} `,
      h('small', { text: String(a.files) }),
    );
    return chip;
  });
  put('legend', ...chips);
}

export function renderStats() {
  const { map } = data();
  const app = map.files.filter(f => f.zone !== 'tests' && f.zone !== 'tools'),
    kept = new Set(app.map(f => f.path));
  const imports = app.reduce((n, f) => n + f.imports.filter(t => kept.has(t)).length, 0);
  const figures: [string, string][] = [
    ['Source files', String(app.length)],
    ['Imports', imports.toLocaleString()],
    ['Lines', app.reduce((n, f) => n + f.lines, 0).toLocaleString()],
    ['Areas', String(new Set(app.map(f => f.area)).size)],
  ];
  put('stats', ...figures.map(([label, value]) => h('div', {}, h('dt', { text: label }), h('dd', { text: value }))));
  const built = h('p', {
    class: 'built',
    text: `Built from commit ${map.commit.slice(0, 7)} on ${map.builtAt.slice(0, 10)}.`,
  });
  put(
    'sub',
    h('span', {
      text: 'Every source file as a circle, every import as a line. The more connections a file has, the larger its circle. Tests, tooling and node_modules are left out until you ask for them.',
    }),
    built,
  );
}

const code = (text: string) => h('code', { text });

export function renderFacts() {
  const { map } = data();
  const zone = new Map(map.files.map(f => [f.path, f.zone]));
  const between = (from: string, to: string) =>
    map.files.reduce((n, f) => n + (f.zone === from ? f.imports.filter(t => zone.get(t) === to).length : 0), 0);
  const count = (z: string) => map.files.filter(f => f.zone === z).length;
  const hubs = [...map.files].sort((a, b) => b.importedBy.length - a.importedBy.length).slice(0, 3);
  const list: Node[] = [
    h(
      'li',
      {},
      h('b', { text: 'Two programs, one contract. ' }),
      `The host (${count('host')} files) and the renderer (${count('renderer')} files) import each other ${between('host', 'renderer')} and ${between('renderer', 'host')} times. Both import `,
      code('shared/'),
      ` (${between('host', 'shared')} and ${between('renderer', 'shared')} imports); the bridge in `,
      code('ops.ts'),
      ' is where they meet.',
    ),
  ];
  const cycle = map.cycles[0];
  if (cycle) {
    const share = Math.round((100 * cycle.size) / Math.max(1, count('renderer')));
    list.push(
      h(
        'li',
        {},
        h('b', { text: `${cycle.size} files form one import cycle` }),
        `, about ${share}% of the renderer. Any file in it can reach any other through imports, so there is no clean bottom layer yet. Tick "Mark the import cycle" to see where it sits.`,
      ),
    );
  }
  const [a, b, c] = hubs;
  if (a && b && c) {
    const name = (f: MapFile) => f.path.replace('src/', '');
    list.push(
      h(
        'li',
        {},
        h('b', { text: 'Hubs. ' }),
        code(name(a)),
        ` is imported by ${a.importedBy.length} files, then `,
        code(name(b)),
        ` (${b.importedBy.length}) and `,
        code(name(c)),
        ` (${c.importedBy.length}).`,
      ),
    );
  }
  const ext = map.external.filter(x => x.files.some(f => f.startsWith('src/')));
  list.push(
    h(
      'li',
      {},
      h('b', { text: 'Outside code. ' }),
      `The app source imports ${plural(ext.length, 'package')} (${ext.map(x => x.package).join(', ')}) plus Node built-ins. `,
      code('node_modules'),
      ' is left out.',
    ),
    h(
      'li',
      {},
      h('b', { text: 'How it is counted. ' }),
      'One line per file that imports another, including ',
      code('import type'),
      '. Static, dynamic and re-export imports count; a call through the bridge does not.',
    ),
  );
  put('facts', ...list);
}
