// The pill under Myra's input and the menu it opens: the model and effort her calls to Claude Code run on. The choice is
// settings.myraModel, which src/web/hostCall.ts adds to every call that runs Claude Code.
import {
  EFFORTS,
  type Effort,
  listing,
  type ModelChoice,
  type ModelEntry,
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
const RECOMMENDED: Effort = 'medium';
const DEFAULT_TEXT = 'Claude Code default';

type Listed = { provider: ProviderId; entry: ModelEntry };

// the host's last answer, asked for again each time the menu opens
let lists: ProviderModels[] = [];
const listed = (): Listed[] => lists.flatMap(p => p.models.map(entry => ({ provider: p.provider, entry })));
const isChosen = ({ provider, entry }: Listed) =>
  settings.myraModel?.provider === provider && settings.myraModel.id === entry.id;
const chosen = () => listed().find(isChosen);

const pill = () => $('mcModel');
const menuEl = () => document.getElementById('mcModelMenu');
const flyEl = () => menuEl()?.querySelector<HTMLElement>('.mc-modelfly') ?? null;
const checkedIn = (el: HTMLElement) =>
  el.querySelector<HTMLElement>('[aria-checked="true"]') ?? el.querySelector<HTMLElement>('[role^="menuitem"]');

function showPill() {
  const choice = settings.myraModel,
    // a model the host no longer lists keeps its id as its name until the list says otherwise
    name = chosen()?.entry.name ?? choice?.id,
    level = choice ? LEVELS[choice.effort] : '',
    text = choice ? `${name} ${level}` : DEFAULT_TEXT;
  $('mcModelText').textContent = text;
  pill().title = text;
}

function menuHtml() {
  const now = chosen(),
    models = listed()
      .map((l, i) => {
        const on = isChosen(l),
          tick = on ? '✓' : '',
          checked = String(on),
          name = esc(l.entry.name),
          key = i < 9 ? String(i + 1) : '';
        return `<button type="button" role="menuitemradio" aria-checked="${checked}" data-model="${i}"><span class="dm-ck">${tick}</span><span class="mm-name">${name}</span><span class="mm-key">${key}</span></button>`;
      })
      .join(''),
    level = now && settings.myraModel ? LEVELS[settings.myraModel.effort] : '',
    off = String(!now),
    tip = now ? '' : ' title="Choose a model first"',
    caret = Icon('caret-right', { size: 10 });
  return `${models}<span class="rm-sep" role="separator"></span><button type="button" role="menuitem" class="mm-effort" aria-haspopup="menu" aria-expanded="false" aria-disabled="${off}"${tip}><span class="dm-ck"></span><span class="mm-name">Effort</span><span class="mm-val">${level}</span>${caret}</button>`;
}

function flyHtml(now: Listed, choice: ModelChoice) {
  const levels = EFFORTS.filter(e => now.entry.efforts.includes(e))
      .map(e => {
        const on = e === choice.effort,
          tick = on ? '✓' : '',
          checked = String(on),
          label = LEVELS[e],
          note = e === RECOMMENDED ? '<span class="mm-note">Recommended</span>' : '';
        return `<button type="button" role="menuitemradio" aria-checked="${checked}" data-effort="${e}"><span class="dm-ck">${tick}</span><span class="mm-name">${label}</span>${note}</button>`;
      })
      .join(''),
    who = esc(window.myraName || 'Myra'),
    help = `How long ${who} thinks before answering. Higher is slower and uses more of your plan.`;
  return `<p id="mcModelHelp">${help}</p>${levels}`;
}

// The effort a model starts on: the one already saved if the model lists it, else Medium.
const startEffort = (entry: ModelEntry, saved: Effort | undefined) =>
  saved && entry.efforts.includes(saved) ? saved : entry.efforts.includes(RECOMMENDED) ? RECOMMENDED : entry.efforts[0];

// menuKeys keeps the pill's aria-expanded, whichever way the menu goes
function closeMenu() {
  menuEl()?.remove();
}

function choose(choice: ModelChoice) {
  settings.myraModel = choice;
  applySettings();
  showPill();
  closeMenu();
  pill().focus();
}

function pickModel({ provider, entry }: Listed) {
  const effort = startEffort(entry, settings.myraModel?.effort);
  if (effort) choose({ provider, id: entry.id, effort });
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
  const now = chosen(),
    choice = settings.myraModel;
  if (!now || !choice) return;
  if (flyEl()) return closeFly();
  const fly = document.createElement('section');
  fly.className = 'row-menu mc-modelfly';
  fly.setAttribute('aria-label', 'Effort');
  fly.setAttribute('aria-describedby', 'mcModelHelp');
  fly.innerHTML = flyHtml(now, choice);
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
  } else if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const model = listed()[Number(e.key) - 1];
    if (model) pickModel(model);
  }
  shield(e);
}

function onClick(e: MouseEvent, m: HTMLElement) {
  const model = closestTo(e.target, '[data-model]'),
    level = closestTo(e.target, '[data-effort]'),
    row = closestTo(e.target, '.mm-effort', HTMLElement),
    effort = EFFORTS.find(x => x === level?.dataset.effort),
    now = listed()[Number(model?.dataset.model)];
  if (model && now) pickModel(now);
  else if (effort && settings.myraModel) choose({ ...settings.myraModel, effort });
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
