// What each call Myra makes to Claude Code is offered, with no window: a stand-in Claude Code logs the arguments it was
// run with. A call gets the built-in tools its feature needs, the connector tools of the connections it uses, and no
// other tool or MCP server. A call with no connection turns every MCP server off. A call with one allows that
// connection's servers alone, since turning every server off would take the claude.ai connectors too.
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
  // the built-in tools; undefined when the call names none, which leaves Claude Code every one of them
  tools: string[] | undefined;
  // what runs without asking, which must never name a tool the call is not offered
  allowed: string[];
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
    tools: list(after('--tools')),
    allowed: list(after('--allowedTools')) ?? [],
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
// Claude Code offers a connector's tools only when it has a built-in tool too, so a call that needs none is given this
// one, which reads, writes and reaches nothing
const NOTHING = 'ReportFindings';

const picture = {
  name: 'a.png',
  data: `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).toString('base64')}`,
};
const ask =
  (more: Record<string, unknown> = {}) =>
  () =>
    claude.ask({ prompt: 'Hi', board: {}, ...more });

const cases: [string, () => Promise<unknown>, Offered][] = [
  [
    'a plain question has Mobbin and nothing else',
    ask(),
    { tools: [NOTHING], allowed: mobbin, strict: false, servers: mobbinAt },
  ],
  [
    'a question with files can read them',
    ask({ files: [picture] }),
    { tools: ['Read'], allowed: ['Read', ...mobbin], strict: false, servers: mobbinAt },
  ],
  [
    'a question with the web on can search and open pages',
    ask({ web: true }),
    {
      tools: ['WebSearch', 'WebFetch'],
      allowed: ['WebSearch', 'WebFetch', ...mobbin],
      strict: false,
      servers: mobbinAt,
    },
  ],
  [
    'a question with files and the web has both',
    ask({ files: [picture], web: true }),
    {
      tools: ['Read', 'WebSearch', 'WebFetch'],
      allowed: ['Read', 'WebSearch', 'WebFetch', ...mobbin],
      strict: false,
      servers: mobbinAt,
    },
  ],
  [
    'a question with Mobbin off is offered no tool and no MCP server',
    ask({ mobbin: false }),
    { tools: [], allowed: [], strict: true, servers: undefined },
  ],
  [
    'a question with Mobbin off and the web on has the web alone',
    ask({ mobbin: false, web: true }),
    { tools: ['WebSearch', 'WebFetch'], allowed: ['WebSearch', 'WebFetch'], strict: true, servers: undefined },
  ],
  [
    'a question the person has not confirmed may not use Higgsfield',
    ask({ mobbin: false, higgs: true, confirmed: false }),
    { tools: [], allowed: [], strict: true, servers: undefined },
  ],
  [
    'a confirmed question may generate with Higgsfield, beside Mobbin',
    ask({ confirmed: true }),
    {
      tools: [NOTHING],
      allowed: [...mobbin, ...generate],
      strict: false,
      servers: [...mobbinAt, ...higgsAt],
    },
  ],
  [
    'a confirmed question with Higgsfield off may not generate',
    ask({ confirmed: true, higgs: false }),
    { tools: [NOTHING], allowed: mobbin, strict: false, servers: mobbinAt },
  ],
  [
    'a confirmed question with Mobbin off has Higgsfield alone',
    ask({ confirmed: true, mobbin: false }),
    { tools: [NOTHING], allowed: generate, strict: false, servers: higgsAt },
  ],
  [
    'the price of an image looks things up and cannot generate',
    () => claude.higgsQuote({}),
    { tools: [NOTHING], allowed: quote, strict: false, servers: higgsAt },
  ],
  [
    'making images has the generating tools of Higgsfield and no other connection',
    () => claude.higgsMake({ images: [] }),
    { tools: [NOTHING], allowed: make, strict: false, servers: higgsAt },
  ],
  [
    'a rewrite is offered no tool and no MCP server',
    () => claude.rewrite({ text: 'Hi' }),
    {
      tools: [],
      allowed: [],
      strict: true,
      servers: undefined,
    },
  ],
  [
    'a fill drawn as SVG is offered no tool and no MCP server',
    () => claude.drawFill({ images: [] }),
    {
      tools: [],
      allowed: [],
      strict: true,
      servers: undefined,
    },
  ],
];
for (const [what, call, expected] of cases) {
  const got = await offered(call);
  assert.deepStrictEqual(got, expected, what);
  // a call never has both: strict would take the connectors the allowed servers keep
  assert(!(got.strict && got.servers), `${what}: strict and an allowed list together`);
  // everything that runs without asking is offered
  for (const name of got.allowed)
    assert(
      name.startsWith('mcp__') || got.tools?.includes(name),
      `${what}: ${name} runs without asking but is not offered`,
    );
}

fs.rmSync(work, { recursive: true, force: true });
