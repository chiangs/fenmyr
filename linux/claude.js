// Myra thinks with Claude Code on this computer (`claude -p`), which answers with JSON actions for the canvas.
const fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const P = require('./paths'), prompts = require('./prompts');

const home = os.homedir();
const isExe = f => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch (e) { return false; } };

// where Claude Code lives. Looked up again when it's missing (at most every 20 seconds, since asking the shell is slow),
// so installing it while Myra is open just works (no restart)
let found = null, missingSince = 0, looking = null;
async function claudePath() {
  if (found && isExe(found)) return found;
  if (Date.now() - missingSince < 20000) return null;
  looking = looking || findClaude().then(p => { found = p; missingSince = p ? 0 : Date.now(); return p; }).finally(() => { looking = null; });
  return looking;
}
async function findClaude() {
  // the usual homes first: the official installer, the older local install, the system, npm / nvm / volta / bun
  const spots = [`${home}/.local/bin/claude`, `${home}/.claude/local/claude`, '/usr/bin/claude', '/usr/local/bin/claude', '/opt/homebrew/bin/claude',
    `${home}/.npm-global/bin/claude`, `${home}/.volta/bin/claude`, `${home}/.bun/bin/claude`];
  try { spots.push(...fs.readdirSync(`${home}/.nvm/versions/node`).sort().reverse().map(v => `${home}/.nvm/versions/node/${v}/bin/claude`)); } catch (e) {}
  const hit = spots.find(isExe); if (hit) return hit;
  // anywhere else the person's own shell knows about (bash, zsh or fish, with their config), with a time limit in case the shell is slow
  const shell = process.env.SHELL || '/bin/bash';
  for (const args of [['-l', '-c', 'command -v claude'], ['-l', '-i', '-c', 'command -v claude']]) {
    const r = await run(shell, args, 6);
    const p = r.out.toString('utf8').split('\n').map(s => s.trim()).filter(s => s.startsWith('/')).pop();
    if (p && isExe(p)) return p;
  }
  return null;
}

const env = () => ({ ...process.env, PATH: [process.env.PATH || '', `${home}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'].join(':') });

// run a program, collect what it prints, stop it after `timeout` seconds
function run(cmd, args, timeout) {
  return new Promise(resolve => {
    let out = [], err = [], p;
    try { p = spawn(cmd, args, { cwd: P.support, env: env(), stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return resolve({ code: -1, out: Buffer.alloc(0), err: Buffer.from(e.message) }); }
    const killer = setTimeout(() => p.kill('SIGTERM'), timeout * 1000);
    p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err.push(d));
    p.on('error', e => { clearTimeout(killer); resolve({ code: -1, out: Buffer.concat(out), err: Buffer.from(e.message) }); });
    p.on('close', code => { clearTimeout(killer); resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err) }); });
  });
}

// ---- Claude usage: Claude Code reports what each request used; Myra keeps a small tally on this computer (usage.json) ----
const readUsage = () => { try { const a = JSON.parse(fs.readFileSync(P.usageFile, 'utf8')); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
// reads Claude Code's JSON answer: notes the usage, hands back just the words
function claudeResult(data) {
  let j; try { j = JSON.parse(data.toString('utf8')); } catch (e) { return { text: data.toString('utf8'), isError: false }; }
  if (!j || typeof j.result !== 'string') return { text: data.toString('utf8'), isError: !!(j && j.is_error) };
  const u = j.usage || {}, n = k => +u[k] || 0;
  const all = readUsage();
  all.push([Date.now() / 1000, n('input_tokens') + n('cache_creation_input_tokens') + n('cache_read_input_tokens'), n('output_tokens'), +j.total_cost_usd || 0]);
  if (all.length > 5000) all.splice(0, all.length - 5000);
  try { fs.writeFileSync(P.usageFile, JSON.stringify(all)); } catch (e) {}
  return { text: j.result, isError: j.is_error === true };
}
// today, the last 7 days and everything: asks, tokens (in, including the context Claude re-reads, and out) and the pay-per-request estimate
function usageSummary() {
  const all = readUsage(), now = new Date(), day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000, week = now / 1000 - 7 * 86400;
  const sum = since => { const xs = all.filter(e => (+e[0] || 0) >= since), f = i => xs.reduce((s, e) => s + (+e[i] || 0), 0);
    return { asks: xs.length, tokensIn: f(1), tokensOut: f(2), cost: f(3) }; };
  return { today: sum(day), week: sum(week), all: sum(0), since: all.length ? +all[0][0] || 0 : 0 };
}
function resetUsage() { try { fs.rmSync(P.usageFile, { force: true }); } catch (e) {} return true; }

// Myra's calls always run with Claude Code hooks switched off, so hooks meant for the person's own Claude Code sessions (a desktop pet's
// thinking meter, reply bubbles…) don't fire for her background requests. Skills, plugins, connectors and the login are unaffected.
const hookArgs = () => ['--settings', JSON.stringify({ disableAllHooks: true })];

// run Claude Code with a prompt and a short list of allowed tools; resolves with its text, rejects with a short reason
async function runClaude(prompt, tools, timeout, need = 'I need Claude Code to do that.') {
  const claude = await claudePath(); if (!claude) throw new Error(need);
  const r = await run(claude, ['-p', prompt, '--output-format', 'json', ...hookArgs(), ...(tools.length ? ['--allowedTools', tools.join(',')] : [])], timeout);
  const { text, isError } = claudeResult(r.out);
  // a failed answer (not signed in, no plan…) comes back as an error, not as words for Myra to read
  if (isError) throw new Error(text.slice(0, 300));
  if (r.code !== 0 && !text) throw new Error((r.err.toString('utf8') || "Claude Code didn't answer").slice(0, 300));
  return text;
}

const NEED = 'I need Claude Code to think. Set it up (Settings → Helpers shows how), then try again.';
function ask(a) {
  const { prompt: request = '', board = {}, confirmed = false, mobbin = true, higgs = true, web = false, vaultNotes = [], canVault = false } = a;
  // only the helpers the person has switched on in Settings
  const tools = mobbin ? ['mcp__claude_ai_Mobbin__search_screens', 'mcp__claude_ai_Mobbin__search_flows', 'mcp__claude_ai_Mobbin__search_sections'] : [];
  // the generator is only switched on after the person taps "yes" in the app: spending credits needs their say-so
  // searching the web and reading public pages (and public GitHub repos) is only on when the person switched it on in Settings → Helpers
  if (web) tools.push('WebSearch', 'WebFetch');
  if (confirmed && higgs) tools.push('mcp__claude_ai_higgsfield__generate_image_batch', 'mcp__claude_ai_higgsfield__jobs_wait', 'mcp__claude_ai_higgsfield__models_explore');
  return runClaude(prompts.ask({ request, boardJSON: jsonSafe(board), confirmed, mobbin, higgs, web, vaultNotes: (Array.isArray(vaultNotes) ? vaultNotes : []).slice(0, 8), canVault: !!canVault }), tools, 300, NEED);
}
// Myra in a doc: rewrite just the selected words ("shorter", "friendlier", or anything typed) and hand back only the new words
async function rewrite(a) {
  const t = await runClaude(prompts.rewrite({ text: a.text || '', how: a.how || '', title: a.title || '', around: a.around || '' }), [], 180, NEED);
  return t.trim();
}
// Higgsfield, two steps: look up the price and balance (never generates), then generate (only called after the person taps yes)
const higgsQuote = a => runClaude(prompts.higgsQuote(a), ['mcp__claude_ai_higgsfield__balance', 'mcp__claude_ai_higgsfield__models_explore', 'mcp__claude_ai_higgsfield__show_plans_and_credits'], 180);
const higgsMake = a => runClaude(prompts.higgsMake(a, jsonSafe(a.images || [])),
  ['mcp__claude_ai_higgsfield__generate_image_batch', 'mcp__claude_ai_higgsfield__generate_image', 'mcp__claude_ai_higgsfield__jobs_wait', 'mcp__claude_ai_higgsfield__models_explore', 'mcp__claude_ai_higgsfield__show_generation_by_ids'], 1200);
// no Higgsfield? Claude can still draw simple flat illustrations as SVG (free, no credits)
const drawFill = a => runClaude(prompts.drawFill(a, jsonSafe(a.images || [])), [], 600);

// which helpers Myra can use: Claude Code itself, and the Mobbin / Higgsfield connections in the person's Claude account
async function connections() {
  const claude = await claudePath(); if (!claude) return { claude: false, mobbin: false, higgsfield: false };
  const r = await run(claude, ['mcp', 'list'], 60);
  const lines = r.out.toString('utf8').toLowerCase().split('\n');
  const ok = name => lines.some(l => l.includes(name) && l.includes('connected') && !l.includes('needs'));
  return { claude: true, mobbin: ok('mobbin'), higgsfield: ok('higgsfield') };
}

// JSON can't hold "not a number" or infinity; the Mac app swaps them for 0, so this does too
function jsonSafe(v) { return JSON.stringify(v, (k, x) => typeof x === 'number' && !isFinite(x) ? 0 : x); }

module.exports = { claudePath, ask, rewrite, higgsQuote, higgsMake, drawFill, connections, usageSummary, resetUsage, jsonSafe, run };
