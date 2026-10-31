import fs from 'node:fs';
import os from 'node:os';
import type {
  Chattiness,
  Connections,
  MyraStyle,
  Ops,
  SlashCommand,
  UsageSummary,
  VaultNoteForMyra,
} from '../shared/ops.ts';
import P from './paths.ts';
import * as prompts from './prompts.ts';
import { isRecord, jsonSafe, readJSON, run, strings, text, type Untrusted } from './util.ts';

const home = os.homedir();
const isExe = (f: string) => {
  try {
    fs.accessSync(f, fs.constants.X_OK);
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

// looked up again when it's missing (at most every 20 seconds, since asking the shell is slow),
// so installing Claude Code while Fenmyr is open just works
let found: string | null = null,
  missingSince = 0,
  looking: Promise<string | null> | null = null;
async function claudePath(): Promise<string | null> {
  if (found && isExe(found)) return found;
  if (Date.now() - missingSince < 20000) return null;
  looking ??= findClaude()
    .then(p => {
      found = p;
      missingSince = p ? 0 : Date.now();
      return p;
    })
    .finally(() => {
      looking = null;
    });
  return looking;
}
async function findClaude(): Promise<string | null> {
  const spots = [
    `${home}/.local/bin/claude`,
    `${home}/.claude/local/claude`,
    '/usr/bin/claude',
    '/usr/local/bin/claude',
    `${home}/.npm-global/bin/claude`,
    `${home}/.volta/bin/claude`,
    `${home}/.bun/bin/claude`,
  ];
  try {
    const nvm = `${home}/.nvm/versions/node`;
    spots.push(
      ...fs
        .readdirSync(nvm)
        .sort()
        .reverse()
        .map(v => `${nvm}/${v}/bin/claude`),
    );
  } catch {}
  const hit = spots.find(isExe);
  if (hit) return hit;
  // the person's own shell (with their config) knows where else it might be; the time limit is for slow shells
  const shell = process.env.SHELL || '/bin/bash';
  for (const args of [
    ['-l', '-c', 'command -v claude'],
    ['-l', '-i', '-c', 'command -v claude'],
  ]) {
    const r = await run(shell, args, 6);
    const p = r.out
      .toString('utf8')
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.startsWith('/'))
      .pop();
    if (p && isExe(p)) return p;
  }
  return null;
}

// rows of [seconds, tokens in, tokens out, cost in USD]
const readUsage = (): unknown[] => {
  const a = readJSON(P.usageFile);
  return Array.isArray(a) ? a : [];
};
const at = (row: unknown, i: number) => (Array.isArray(row) ? Number(row[i]) || 0 : 0);
function claudeResult(data: Buffer) {
  const raw = data.toString('utf8');
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return { text: raw, isError: false };
  }
  if (!isRecord(j) || typeof j.result !== 'string') return { text: raw, isError: isRecord(j) && Boolean(j.is_error) };
  const u = isRecord(j.usage) ? j.usage : {},
    n = (k: string) => Number(u[k]) || 0;
  const all = readUsage();
  all.push([
    Date.now() / 1000,
    n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens'),
    n('output_tokens'),
    Number(j.total_cost_usd) || 0,
  ]);
  if (all.length > 5000) all.splice(0, all.length - 5000);
  try {
    fs.writeFileSync(P.usageFile, JSON.stringify(all));
  } catch {}
  return { text: j.result, isError: j.is_error === true };
}
// tokens in include the context Claude re-reads from its cache
export function usageSummary(): UsageSummary {
  const all = readUsage(),
    now = new Date(),
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000,
    week = now.getTime() / 1000 - 7 * 86400;
  const sum = (since: number) => {
    const xs = all.filter(e => at(e, 0) >= since),
      f = (i: number) => xs.reduce((s: number, e) => s + at(e, i), 0);
    return { asks: xs.length, tokensIn: f(1), tokensOut: f(2), cost: f(3) };
  };
  return { today: sum(day), week: sum(week), all: sum(0), since: all.length ? at(all[0], 0) : 0 };
}
export function resetUsage(): true {
  try {
    fs.rmSync(P.usageFile, { force: true });
  } catch {}
  return true;
}

// Myra's calls always run with Claude Code hooks switched off, so hooks meant for the person's own Claude Code sessions (a desktop pet's
// thinking meter, reply bubbles…) don't fire for her background requests. Skills, plugins, connectors and the login are unaffected.
const hookArgs = () => ['--settings', JSON.stringify({ disableAllHooks: true })];

async function runClaude(prompt: string, tools: string[], timeout: number, need = 'I need Claude Code to do that.') {
  const claude = await claudePath();
  if (!claude) throw new Error(need);
  const r = await run(
    claude,
    [
      '-p',
      prompt,
      '--output-format',
      'json',
      ...hookArgs(),
      ...(tools.length ? ['--allowedTools', tools.join(',')] : []),
    ],
    timeout,
  );
  const { text, isError } = claudeResult(r.out);
  // a failed answer (not signed in, no plan…) comes back as an error, not as words for Myra to read
  if (isError) throw new Error(text.slice(0, 300));
  if (r.code !== 0 && !text) throw new Error((r.err.toString('utf8') || "Claude Code didn't answer").slice(0, 300));
  return text;
}

const CHATS: readonly Chattiness[] = ['quiet', 'normal', 'chatty'];
function parseStyle(s: unknown): MyraStyle {
  const r = isRecord(s) ? s : {};
  const chat = CHATS.find(c => c === r.chat) ?? 'normal';
  return { name: text(r.name), chat, emoji: Boolean(r.emoji) };
}
function parseCommands(list: unknown): SlashCommand[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.filter(isRecord).map(c => ({
    cmd: text(c.cmd),
    arg: typeof c.arg === 'string' ? c.arg : undefined,
    desc: text(c.desc),
    ex: typeof c.ex === 'string' ? c.ex : Array.isArray(c.ex) ? strings(c.ex) : undefined,
    opts: Array.isArray(c.opts) ? strings(c.opts) : undefined,
  }));
}
const parseVaultNotes = (list: unknown): VaultNoteForMyra[] =>
  (Array.isArray(list) ? list : [])
    .slice(0, 8)
    .filter(isRecord)
    .map(n => ({
      vault: text(n.vault),
      path: text(n.path),
      title: text(n.title),
      tags: strings(n.tags),
      text: text(n.text),
    }));

const NEED = 'I need Claude Code to think. Set it up (Settings → Helpers shows how), then try again.';
export function ask(a: Untrusted<Ops['ask']['args']>): Promise<string> {
  const confirmed = Boolean(a.confirmed),
    mobbin = a.mobbin === undefined || Boolean(a.mobbin),
    higgs = a.higgs === undefined || Boolean(a.higgs),
    web = Boolean(a.web);
  const tools = mobbin
    ? [
        'mcp__claude_ai_Mobbin__search_screens',
        'mcp__claude_ai_Mobbin__search_flows',
        'mcp__claude_ai_Mobbin__search_sections',
      ]
    : [];
  if (web) tools.push('WebSearch', 'WebFetch');
  // the generator is only switched on after the person taps "yes" in the app: spending credits needs their say-so
  if (confirmed && higgs)
    tools.push(
      'mcp__claude_ai_higgsfield__generate_image_batch',
      'mcp__claude_ai_higgsfield__jobs_wait',
      'mcp__claude_ai_higgsfield__models_explore',
    );
  // her tone settings and slash commands go in the prompt, not in the board data
  const snapshot: Record<string, unknown> = isRecord(a.board) ? a.board : {};
  const { myraStyle, commands, ...board } = snapshot;
  const prompt = prompts.ask({
    request: text(a.prompt),
    boardJSON: jsonSafe(board),
    style: parseStyle(myraStyle),
    commands: parseCommands(commands),
    confirmed,
    mobbin,
    higgs,
    web,
    vaultNotes: parseVaultNotes(a.vaultNotes),
    canVault: Boolean(a.canVault),
  });
  return runClaude(prompt, tools, 300, NEED);
}
export async function rewrite(a: Untrusted<Ops['rewrite']['args']>): Promise<string> {
  const words = { text: text(a.text), how: text(a.how), title: text(a.title), around: text(a.around) };
  return (await runClaude(prompts.rewrite(words), [], 180, NEED)).trim();
}
// Higgsfield in two steps: the quote only looks up the price and balance, and generating is only called after the person taps yes
export const higgsQuote = (a: Untrusted<Ops['higgsQuote']['args']>) =>
  runClaude(
    prompts.higgsQuote({ model: text(a.model) }),
    [
      'mcp__claude_ai_higgsfield__balance',
      'mcp__claude_ai_higgsfield__models_explore',
      'mcp__claude_ai_higgsfield__show_plans_and_credits',
    ],
    180,
  );
export const higgsMake = (a: Untrusted<Ops['higgsMake']['args']>) =>
  runClaude(
    prompts.higgsMake({ model: text(a.model), style: text(a.style) }, jsonSafe(a.images || [])),
    [
      'mcp__claude_ai_higgsfield__generate_image_batch',
      'mcp__claude_ai_higgsfield__generate_image',
      'mcp__claude_ai_higgsfield__jobs_wait',
      'mcp__claude_ai_higgsfield__models_explore',
      'mcp__claude_ai_higgsfield__show_generation_by_ids',
    ],
    1200,
  );
// without Higgsfield, Claude can still draw simple flat illustrations as SVG, with no credits spent
export const drawFill = (a: Untrusted<Ops['drawFill']['args']>) =>
  runClaude(prompts.drawFill({ style: text(a.style) }, jsonSafe(a.images || [])), [], 600);

export async function connections(): Promise<Connections> {
  const claude = await claudePath();
  if (!claude) return { claude: false, mobbin: false, higgsfield: false };
  const r = await run(claude, ['mcp', 'list'], 60);
  const lines = r.out.toString('utf8').toLowerCase().split('\n');
  const ok = (name: string) => lines.some(l => l.includes(name) && l.includes('connected') && !l.includes('needs'));
  return { claude: true, mobbin: ok('mobbin'), higgsfield: ok('higgsfield') };
}
