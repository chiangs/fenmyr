import type { Connections } from '../shared/ops.ts';

// The connections Fenmyr uses, and what each call to Claude Code is offered. A call gets the built-in tools its feature
// needs and the tools of the connections it names, so it is never offered a skill, a schedule, a notification, or an
// MCP server or connector of the person's own. To unlock a connector, add its key to `Connections` in
// src/shared/ops.ts and a row below with the features that use it. tsc fails until both are there.
//
// What Claude Code 2.1.332 does with the flags, from real runs (tests/askTools.ts only keeps what Fenmyr passes):
// - `--tools` limits the built-in tools and leaves every MCP tool alone, except that "" takes the claude.ai connectors
//   too, but not a local MCP server.
// - `--strict-mcp-config` turns off every MCP server, the claude.ai connectors included, so a call with a connection
//   can't use it.
// - `allowedMcpServers` in the settings keeps the servers whose URLs it names and turns off every other connector,
//   plugin and local server, so a call with a connection uses it.
// A server offers all its tools, so a feature's list says what is pre-approved, not what is offered.
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

// Claude Code offers no claude.ai connector to a call with no built-in tool, so a call that needs a connector and no
// built-in tool is given the one that reads, writes and reaches nothing.
const NOTHING = 'ReportFindings';

/** Claude Code's flags for an offer, and the settings that go with them. */
export function offerArgs({ builtin, grants }: Offer): { args: string[]; settings: Record<string, unknown> } {
  const connectors = [...new Set(grants.map(g => g.connector))];
  const connected = grants.flatMap(({ connector, use }) => {
    const row: Connector = CONNECTORS[connector];
    return (row.uses[use] ?? []).map(tool => `mcp__${row.server}__${tool}`);
  });
  const tools = connectors.length && !builtin.length ? [NOTHING] : builtin;
  const allowed = [...new Set([...builtin, ...connected])];
  return {
    args: [
      '--tools',
      tools.join(','),
      ...(allowed.length ? ['--allowedTools', allowed.join(',')] : []),
      ...(connectors.length ? [] : ['--strict-mcp-config']),
    ],
    settings: connectors.length
      ? { allowedMcpServers: connectors.flatMap(c => CONNECTORS[c].urls.map(serverUrl => ({ serverUrl }))) }
      : {},
  };
}
