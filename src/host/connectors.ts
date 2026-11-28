import type { Connections } from '../shared/ops.ts';

// The connections Fenmyr uses, and what each call to Claude Code is offered. A call gets the built-in tools its feature
// needs and the tools of the connections it names, so it is never offered a skill, a schedule, a notification, or an
// MCP server or connector of the person's own. To unlock a connector, add its key to `Connections` in
// src/shared/ops.ts and a row below with the features that use it. tsc fails until both are there.
//
// What Claude Code 2.1.332 does with the flags, from real runs (tests/askTools.ts only keeps what Fenmyr passes):
// - claude.ai connectors connect after Claude Code starts and are reached through its tool search, which it turns off
//   for the whole session when it starts with no deferred tool ("Tool search disabled: no deferred tools available to
//   search" in its debug log). `--tools` removes every deferred tool, so a call that takes it can't reach a connector
//   (7 of 7 runs), and neither can one left with only tools that aren't deferred (see NEVER). So a call with a
//   connection takes no `--tools`, and a call without one takes it as a hard limit.
// - `--strict-mcp-config` turns off every MCP server, the claude.ai connectors included.
// - `allowedMcpServers` in the settings keeps the servers whose URLs it names and turns off every other connector,
//   plugin and local server.
// - `--permission-mode default` is named so the person's own default, which may skip every permission check, never
//   applies. A `-p` run can't ask, so a tool that needs approval and isn't in `--allowedTools` is refused, the other
//   tools of a connector included. Some tools never need approval, and a rule of the person's own can allow others.
type ConnectorId = Exclude<keyof Connections, 'claude'>;
type Connector = {
  /** Claude Code's name for the server, which starts each of its tools: mcp__<server>__<tool>. */
  server: string;
  /** Where the connector answers, as patterns for the allowed list. claude.ai, not Fenmyr, says where. */
  urls: readonly string[];
  /** The tools of each feature that uses it. */
  uses: Record<string, readonly string[]>;
};
const CONNECTORS = {
  mobbin: {
    server: 'claude_ai_Mobbin',
    urls: ['https://mobbin.com/*', 'https://*.mobbin.com/*'],
    uses: { search: ['search_screens', 'search_flows', 'search_sections'] },
  },
  higgsfield: {
    server: 'claude_ai_higgsfield',
    urls: ['https://higgsfield.ai/*', 'https://*.higgsfield.ai/*'],
    uses: {
      // the price and the balance, which cost nothing
      quote: ['balance', 'models_explore', 'show_plans_and_credits'],
      // spends credits, so only on a question the person has confirmed
      generate: ['generate_image_batch', 'jobs_wait', 'models_explore'],
      // spends credits, so only after the person has tapped yes
      make: ['generate_image_batch', 'generate_image', 'jobs_wait', 'models_explore', 'show_generation_by_ids'],
    },
  },
} as const satisfies Record<ConnectorId, Connector>;

type Table = typeof CONNECTORS;
type Grant = { [C in ConnectorId]: { connector: C; use: keyof Table[C]['uses'] } }[ConnectorId];
type Builtin = 'Read' | 'WebSearch' | 'WebFetch';
/** What a call may use: built-in tools, and the features of the connections it takes tools from. */
export type Offer = { builtin: Builtin[]; grants: Grant[] };

// Claude Code's built-in tools that no call is offered, which a call with a connection must turn down by name since it
// can't take `--tools`. Measured on 2.1.332 in a `-p` run with `--permission-mode default`, no `--tools` and one
// connector tool listed: Agent (Task), Bash with a read-only command such as `date`, CronCreate, CronDelete, CronList,
// DesignSync, ListAgents, McpTaskCheck, Monitor with a read-only command, PushNotification, RemoteTrigger,
// ReportFindings, ScheduleWakeup, SendMessage and TaskStop all ran without asking. Edit, NotebookEdit, Skill, Workflow,
// Write and Bash with a command that changes anything were refused, but a rule of the person's own can allow those, so
// they are named too, with the names of tools that other versions list (EnterWorktree, ExitWorktree, MultiEdit).
//
// McpTaskCheck and TaskStop are left out, and ToolSearch with them, so the call starts with a deferred tool (see
// above). Monitor, ReportFindings, Skill and the file tools aren't deferred: a call left with only one of them reached
// no connector in 14 of 16 runs, and every call left with a deferred tool reached it. These two can only check or stop
// a background task of the call, and it has none.
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
// the tools a feature can ask for, which a call with a connection turns down unless it asked
const OPTIONAL: readonly string[] = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

/** Claude Code's flags for an offer, and the settings that go with them. */
export function offerArgs({ builtin, grants }: Offer): { args: string[]; settings: Record<string, unknown> } {
  const connectors = [...new Set(grants.map(g => g.connector))];
  const connected = grants.flatMap(({ connector, use }) => {
    const row: Connector = CONNECTORS[connector];
    return (row.uses[use] ?? []).map(tool => `mcp__${row.server}__${tool}`);
  });
  const allowed = [...new Set([...builtin, ...connected])];
  const common = ['--permission-mode', 'default', ...(allowed.length ? ['--allowedTools', allowed.join(',')] : [])];
  // with no connection `--tools` is a hard limit, and turning off every MCP server leaves nothing to reach
  if (!connectors.length)
    return { args: [...common, '--tools', builtin.join(','), '--strict-mcp-config'], settings: {} };
  const offered: readonly string[] = builtin;
  const turnedDown = [...NEVER, ...OPTIONAL.filter(tool => !offered.includes(tool))];
  return {
    args: [...common, '--disallowedTools', turnedDown.join(',')],
    settings: { allowedMcpServers: connectors.flatMap(c => CONNECTORS[c].urls.map(serverUrl => ({ serverUrl }))) },
  };
}
