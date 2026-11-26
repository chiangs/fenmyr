// The pill under Myra's input and the menu it opens: the model and effort her calls to Claude Code run on. The choice is
// settings.myraModel, which src/web/hostCall.ts adds to every call that runs Claude Code.
import {
  DEFAULT_PROVIDER,
  EFFORTS,
  type Effort,
  listing,
  type ModelEntry,
  makeChoice,
  type ProviderId,
  type ProviderModels,
} from '../../shared/models.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { checkBeforeClaude } from '../hostCall.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { menuKeys } from '../ui/menuKeys.ts';
import { closeOnOutsidePress, openAbove, openFlyout } from '../ui/popover.ts';
import { reply } from './say.ts';

const LEVELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' };
const DEFAULT = 'Default';
const FOLLOWS = 'Default follows your Claude Code settings.';

type Listed = { provider: ProviderId; entry: ModelEntry };

// the host's last answer, asked for again each time the menu opens
let lists: ProviderModels[] = [];
// what a question reads the chosen model's context window from, so the board it sends fits
export const modelLists = () => lists;
const listed = (): Listed[] => lists.flatMap(p => p.models.map(entry => ({ provider: p.provider, entry })));
const isChosen = ({ provider, entry }: Listed) =>
  settings.myraModel?.provider === provider && settings.myraModel.id === entry.id;
const hasModel = () => settings.myraModel?.id !== undefined;
const chosen = () => listed().find(isChosen);

const pill = () => $('mcModel');
const menuEl = () => document.getElementById('mcModelMenu');
const flyEl = () => menuEl()?.querySelector<HTMLElement>('.mc-modelfly') ?? null;
const checkedIn = (el: HTMLElement) =>
  el.querySelector<HTMLElement>('[aria-checked="true"]') ?? el.querySelector<HTMLElement>('[role^="menuitem"]');

function showPill() {
  const choice = settings.myraModel,
    // a model the host no longer lists keeps its id as its name until the list says otherwise
    name = choice?.id === undefined ? undefined : (chosen()?.entry.name ?? choice.id),
    level = choice?.effort ? LEVELS[choice.effort] : undefined,
    text = [name ?? DEFAULT, level].filter(Boolean).join(' ');
  $('mcModelText').textContent = text;
  pill().ariaLabel = text;
  pill().dataset.tip = name === undefined || level === undefined ? `${text}\n${FOLLOWS}` : text;
}

// A row of either menu: a radio with its tick, its name and what ends it, which is a key or a note.
function radioRow(attrs: string, on: boolean, name: string, end = '') {
  const tick = on ? '✓' : '',
    checked = String(on);
  return `<button type="button" role="menuitemradio" aria-checked="${checked}" ${attrs}><span class="dm-ck">${tick}</span><span class="mm-name">${name}</span>${end}</button>`;
}

const keyHtml = (key: string) => `<span class="mm-key">${key}</span>`;

function menuHtml() {
  const models = listed()
      .map((l, i) => radioRow(`data-model="${i}"`, isChosen(l), esc(l.entry.name), keyHtml(i < 9 ? String(i + 1) : '')))
      .join(''),
    off = radioRow('data-model="default"', !hasModel(), DEFAULT, keyHtml('0')),
    level = settings.myraModel?.effort ? LEVELS[settings.myraModel.effort] : DEFAULT,
    caret = Icon('caret-right', { size: 10 });
  return `${off}${models}<span class="rm-sep" role="separator"></span><button type="button" role="menuitem" class="mm-effort" aria-haspopup="menu" aria-expanded="false"><span class="dm-ck"></span><span class="mm-name">Effort</span><span class="mm-val">${level}</span>${caret}</button>`;
}

// Default, then the levels the model lists. With no model, or one the host doesn't list, every level.
function flyHtml(levels: readonly Effort[]) {
  const now = settings.myraModel?.effort,
    rows = EFFORTS.filter(e => levels.includes(e))
      .map(e => radioRow(`data-effort="${e}"`, e === now, LEVELS[e]))
      .join(''),
    off = radioRow('data-effort="default"', now === undefined, DEFAULT),
    who = esc(window.myraName || 'Myra'),
    help = `How long ${who} thinks before answering. Higher is slower and uses more of your plan.`;
  return `<p id="mcModelHelp">${help}</p>${off}${rows}`;
}

// menuKeys keeps the pill's aria-expanded, whichever way the menu goes
function closeMenu() {
  menuEl()?.remove();
}

// Each part is Default or set, and Default for both is no setting at all.
function choose(provider: ProviderId, id: string | undefined, effort: Effort | undefined) {
  const choice = makeChoice(provider, id, effort);
  if (choice) settings.myraModel = choice;
  else delete settings.myraModel;
  applySettings();
  showPill();
  closeMenu();
  pill().focus();
}

// The effort stays as it is unless the model doesn't list it, and then it goes back to Default.
function pickModel(model?: Listed) {
  const effort = settings.myraModel?.effort,
    kept = effort && (!model || model.entry.efforts.includes(effort)) ? effort : undefined;
  choose(model?.provider ?? DEFAULT_PROVIDER, model?.entry.id, kept);
}

// the model stays whatever the host lists, so one it can't list yet is not lost by a change of effort
function pickEffort(effort: Effort | undefined) {
  const model = settings.myraModel;
  choose(model?.provider ?? DEFAULT_PROVIDER, model?.id, effort);
}

function closeFly() {
  const row = menuEl()?.querySelector<HTMLElement>('.mm-effort');
  flyEl()?.remove();
  row?.setAttribute('aria-expanded', 'false');
  row?.focus();
}

// A key in the menu must not also reach the board's shortcuts, where a letter would pick a tool.
function shield(e: KeyboardEvent) {
  if (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation();
}

function openFly(m: HTMLElement, row: HTMLElement) {
  if (flyEl()) return closeFly();
  const fly = document.createElement('section');
  fly.className = 'row-menu mc-modelfly';
  fly.setAttribute('aria-label', 'Effort');
  fly.setAttribute('aria-describedby', 'mcModelHelp');
  fly.innerHTML = flyHtml(chosen()?.entry.efforts ?? EFFORTS);
  m.appendChild(fly);
  openFlyout(fly, m);
  row.setAttribute('aria-expanded', 'true');
  menuKeys(fly);
  fly.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault();
      closeFly();
    }
    shield(e);
  });
  checkedIn(fly)?.focus();
}

function onKey(e: KeyboardEvent, m: HTMLElement) {
  const on = document.activeElement;
  if (e.key === 'Escape') {
    closeMenu();
    pill().focus();
  } else if (e.key === 'ArrowRight' && on instanceof HTMLElement && on.classList.contains('mm-effort')) {
    e.preventDefault();
    openFly(m, on);
  } else if (/^[0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const model = listed()[Number(e.key) - 1];
    if (e.key === '0' || model) pickModel(model);
  }
  shield(e);
}

function onClick(e: MouseEvent, m: HTMLElement) {
  const model = closestTo(e.target, '[data-model]'),
    level = closestTo(e.target, '[data-effort]'),
    row = closestTo(e.target, '.mm-effort', HTMLElement),
    now = listed()[Number(model?.dataset.model)];
  if (model?.dataset.model === 'default') pickModel();
  else if (model && now) pickModel(now);
  else if (level) pickEffort(EFFORTS.find(x => x === level.dataset.effort));
  else if (row) openFly(m, row);
}

async function openMenu() {
  try {
    lists = await Fenmyr.models();
  } catch {
    // the last answer stands, and a model the host can't list yet is still chosen by its id
  }
  if (menuEl()) return;
  showPill();
  const m = document.createElement('div');
  m.id = 'mcModelMenu';
  m.className = 'row-menu mc-modelmenu';
  m.setAttribute('aria-label', 'Model and effort');
  m.innerHTML = menuHtml();
  document.body.appendChild(m);
  openAbove(m, pill());
  menuKeys(m);
  m.addEventListener('keydown', e => onKey(e, m));
  m.addEventListener('click', e => onClick(e, m));
  checkedIn(m)?.focus();
}

// Whether this session has had an answer from the host to check the saved model against. An answer that says nothing
// leaves it false, so the next chat open or Myra call asks again.
let verified = false;
let asking: Promise<void> | undefined;

async function verify() {
  const choice = settings.myraModel;
  if (!choice) return;
  let answer: ProviderModels[] = [];
  try {
    answer = await Fenmyr.models();
  } catch {
    // nothing came back, so nothing is known about the model
  }
  const standing = listing(answer, choice);
  if (standing === 'unknown') return;
  verified = true;
  lists = answer;
  // a model picked from the menu while the host was answering is a fresh choice from a fresh list
  if (standing === 'listed' || settings.myraModel !== choice) return showPill();
  delete settings.myraModel;
  applySettings();
  showPill();
  // Clearing the choice is what keeps this to one line. She picks no other model, since only the person chooses one.
  reply(`I couldn’t find ${choice.id} any more, so I’m using Claude Code’s default until you pick another.`, 8000);
}

/** Checks the saved model against the host's list the first time a chat opens or a call to Claude Code is about to go
 *  out. One that is gone is cleared and Myra says so once. Returns the check while it runs, so a call can wait for it,
 *  and nothing once the session has been checked or there is no choice, board or line to say it on. */
export function checkSavedModel(): Promise<void> | undefined {
  if (verified || !settings.myraModel || !session.board) return undefined;
  return (asking ??= verify().finally(() => {
    asking = undefined;
  }));
}

export function initModelPicker() {
  checkBeforeClaude(checkSavedModel);
  showPill();
  pill().onclick = () => (menuEl() ? closeMenu() : void openMenu());
  closeOnOutsidePress('#mcModel, #mcModelMenu', () => !!menuEl(), closeMenu);
  // the names come from the host, so the pill reads a saved model by its id until they arrive
  void Fenmyr.models().then(
    l => {
      lists = l;
      showPill();
    },
    () => undefined,
  );
}
