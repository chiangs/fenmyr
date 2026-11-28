// What each call Myra makes to Claude Code is offered, with no window: a stand-in Claude Code logs the arguments it was
// run with. A call gets the built-in tools its feature needs, the connector tools of the connections it uses, and no
// other tool or MCP server, and never the person's own permission mode. A call with no connection limits the tools
// itself and turns every MCP server off. A call with one can't limit the tools, since that takes the claude.ai
// connectors out of reach, so it allows that connection's servers alone and turns down every tool it was not offered.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-ask-tools-')));
// read as the host modules load: the stand-in is found at ~/.local/bin/claude, and usage is kept under XDG_DATA_HOME
process.env.HOME = work;
process.env.XDG_DATA_HOME = work;
const log = path.join(work, 'argv.jsonl');
fs.mkdirSync(path.join(work, '.local/bin'), { recursive: true });
fs.writeFileSync(
  path.join(work, '.local/bin/claude'),
  `#!${process.execPath}
const fs = require('node:fs');
fs.readFileSync(0);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log(JSON.stringify({ type: 'result', is_error: false, result: 'ok' }));
`,
  { mode: 0o755 },
);
const claude = await import('../src/host/claude.ts');

type Offered = {
  // the permission mode, which is named so the person's own default never applies
  mode: string | undefined;
  // the built-in tools; undefined when the call names none, which leaves Claude Code every one of them
  tools: string[] | undefined;
  // what runs without asking, which must never name a tool the call is not offered
  allowed: string[];
  // the tools turned down by name, for a call that can't limit them
  denied: string[] | undefined;
  // every MCP server turned off
  strict: boolean;
  // the servers allowed alone, by the URLs their connectors answer on
  servers: string[] | undefined;
};
const list = (s: string | undefined) => (s === undefined ? undefined : s.split(',').filter(Boolean));
async function offered(call: () => Promise<unknown>): Promise<Offered> {
  fs.rmSync(log, { force: true });
  await call();
  const runs = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(runs.length, 1, 'one run of Claude Code');
  const argv: unknown = JSON.parse(runs[0] ?? '');
  assert(Array.isArray(argv));
  const after = (flag: string): string | undefined => {
    const v: unknown = argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined;
    return typeof v === 'string' ? v : undefined;
  };
  const settings: unknown = JSON.parse(after('--settings') ?? '{}');
  assert(typeof settings === 'object' && settings !== null);
  assert.strictEqual(Reflect.get(settings, 'disableAllHooks'), true, 'hooks stay off');
  const servers: unknown = Reflect.get(settings, 'allowedMcpServers');
  assert(servers === undefined || Array.isArray(servers));
  return {
    mode: after('--permission-mode'),
    tools: list(after('--tools')),
    allowed: list(after('--allowedTools')) ?? [],
    denied: list(after('--disallowedTools')),
    strict: argv.includes('--strict-mcp-config'),
    servers: servers?.map((s: unknown) => (typeof s === 'object' && s !== null ? Reflect.get(s, 'serverUrl') : s)),
  };
}

const mobbin = ['search_screens', 'search_flows', 'search_sections'].map(t => `mcp__claude_ai_Mobbin__${t}`);
const quote = ['balance', 'models_explore', 'show_plans_and_credits'].map(t => `mcp__claude_ai_higgsfield__${t}`);
const generate = ['generate_image_batch', 'jobs_wait', 'models_explore'].map(t => `mcp__claude_ai_higgsfield__${t}`);
const make = ['generate_image_batch', 'generate_image', 'jobs_wait', 'models_explore', 'show_generation_by_ids'].map(
  t => `mcp__claude_ai_higgsfield__${t}`,
);
const mobbinAt = ['https://mobbin.com/*', 'https://*.mobbin.com/*'];
const higgsAt = ['https://higgsfield.ai/*', 'https://*.higgsfield.ai/*'];
// Every built-in tool that no call is offered. With a connection a call names them, since it can't take `--tools`.
// Two are left out on purpose: tool search is turned off for a call that starts with no deferred tool, which would put
// the connector out of reach, and these two are deferred and harmless.
const NEVER = [
  'Agent',
  'Bash',
  'CronCreate',
  'CronDelete',
  'CronList',
  'DesignSync',
  'Edit',
  'EnterWorktree',
  'ExitWorktree',
  'ListAgents',
  'Monitor',
  'MultiEdit',
  'NotebookEdit',
  'PushNotification',
  'RemoteTrigger',
  'ReportFindings',
  'ScheduleWakeup',
  'SendMessage',
  'Skill',
  'Task',
  'Workflow',
  'Write',
];
const KEPT = ['TaskStop', 'McpTaskCheck', 'ToolSearch'];
// the tools a feature asks for, turned down unless its call asked for them
const OPTIONAL = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
const turnedDown = (...asked: string[]) => [...NEVER, ...OPTIONAL.filter(t => !asked.includes(t))];

const picture = {
  name: 'a.png',
  data: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString('base64')}`,
};
const ask =
  (more: Record<string, unknown> = {}) =>
  () =>
    claude.ask({ prompt: 'Hi', board: {}, ...more });

// a call with no connection limits the tools itself, and turns every MCP server off
const limited = (tools: string[]): Offered => ({
  mode: 'default',
  tools,
  allowed: tools,
  denied: undefined,
  strict: true,
  servers: undefined,
});
// a call with a connection allows its servers alone and turns down every tool it was not offered
const connected = (builtin: string[], connectorTools: string[], servers: string[]): Offered => ({
  mode: 'default',
  tools: undefined,
  allowed: [...builtin, ...connectorTools],
  denied: turnedDown(...builtin),
  strict: false,
  servers,
});

const cases: [string, () => Promise<unknown>, Offered][] = [
  ['a plain question has Mobbin and nothing else', ask(), connected([], mobbin, mobbinAt)],
  ['a question with files can read them', ask({ files: [picture] }), connected(['Read'], mobbin, mobbinAt)],
  [
    'a question with the web on can search and open pages',
    ask({ web: true }),
    connected(['WebSearch', 'WebFetch'], mobbin, mobbinAt),
  ],
  [
    'a question with files and the web has both',
    ask({ files: [picture], web: true }),
    connected(['Read', 'WebSearch', 'WebFetch'], mobbin, mobbinAt),
  ],
  ['a question with Mobbin off is offered no tool and no MCP server', ask({ mobbin: false }), limited([])],
  [
    'a question with Mobbin off and the web on has the web alone',
    ask({ mobbin: false, web: true }),
    limited(['WebSearch', 'WebFetch']),
  ],
  [
    'a question the person has not confirmed may not use Higgsfield',
    ask({ mobbin: false, higgs: true, confirmed: false }),
    limited([]),
  ],
  [
    'a confirmed question may generate with Higgsfield, beside Mobbin',
    ask({ confirmed: true }),
    connected([], [...mobbin, ...generate], [...mobbinAt, ...higgsAt]),
  ],
  [
    'a confirmed question with Higgsfield off may not generate',
    ask({ confirmed: true, higgs: false }),
    connected([], mobbin, mobbinAt),
  ],
  [
    'a confirmed question with Mobbin off has Higgsfield alone',
    ask({ confirmed: true, mobbin: false }),
    connected([], generate, higgsAt),
  ],
  [
    'the price of an image looks things up and cannot generate',
    () => claude.higgsQuote({}),
    connected([], quote, higgsAt),
  ],
  [
    'making images has the generating tools of Higgsfield and no other connection',
    () => claude.higgsMake({ images: [] }),
    connected([], make, higgsAt),
  ],
  ['a rewrite is offered no tool and no MCP server', () => claude.rewrite({ text: 'Hi' }), limited([])],
  ['a fill drawn as SVG is offered no tool and no MCP server', () => claude.drawFill({ images: [] }), limited([])],
];
for (const [what, call, expected] of cases) {
  const got = await offered(call);
  assert.deepStrictEqual(got, expected, what);
  // a call never has both: strict would take the connectors the allowed servers keep
  assert(!(got.strict && got.servers), `${what}: strict and an allowed list together`);
  // a call that can't limit the tools names what it turns down, and must never turn down what it allows or what keeps
  // the connector in reach
  for (const name of got.denied ?? []) {
    assert(!got.allowed.includes(name), `${what}: ${name} is allowed and turned down`);
    assert(!KEPT.includes(name), `${what}: ${name} is turned down, which puts the connector out of reach`);
  }
  // everything that runs without asking is offered
  for (const name of got.allowed)
    assert(
      name.startsWith('mcp__') || (got.tools ? got.tools.includes(name) : !NEVER.includes(name)),
      `${what}: ${name} runs without asking but is not offered`,
    );
}

fs.rmSync(work, { recursive: true, force: true });
