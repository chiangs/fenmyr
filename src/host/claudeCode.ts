import { type ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { claudePath, FOLDER_ONLY, hookArgs, noteUsage } from './claude.ts';
import type { CodeAgent } from './codeAgent.ts';
import { modelArgs } from './models.ts';
import { env, isRecord, text } from './util.ts';

// Claude Code works in the prototype's folder with file tools only: no shell, no web, no other agents. Claude Code keeps
// writes inside its working folder, and Fenmyr checks afterwards that nothing outside changed. A run that only reads
// has the reading tools alone, with every other tool left out and turned down, and no MCP servers, whose tools could
// write or reach the network. Each names its permission mode, so the person's own default, which may skip every
// permission check, never applies.
const READS = ['Read', 'Glob', 'Grep'];
const EDITS = new Set(['Write', 'Edit', 'MultiEdit']);
const NEVER = ['Bash', 'WebFetch', 'WebSearch', 'Task'];
const ACCESS = {
  edit: [
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep'].join(','),
    '--disallowedTools',
    NEVER.join(','),
  ],
  read: [
    '--permission-mode',
    'default',
    '--tools',
    READS.join(','),
    '--allowedTools',
    READS.join(','),
    '--disallowedTools',
    [...EDITS, 'NotebookEdit', ...NEVER].join(','),
    '--strict-mcp-config',
  ],
};

// Every Claude Code still running. It outlives Fenmyr unless it's stopped, and would keep changing files no one sees, or
// answer no one.
const running = new Set<ChildProcess>();
let stopped = false;
/** Stops every run as Fenmyr quits. */
export function stopCodeAgents() {
  stopped = true;
  for (const p of running) p.kill();
}
/** True once Fenmyr is quitting. A run cut off then didn't fail, so nothing is said of how it ended. */
export const quitting = () => stopped;

export const claudeCode: CodeAgent = async ({ cwd, prompt, readable, access, model }, edited) => {
  const claude = await claudePath();
  if (!claude)
    throw new Error(
      `I need Claude Code to ${access === 'read' ? 'read' : 'write'} code. Settings → Helpers shows how to set it up.`,
    );
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    ...hookArgs({ permissions: FOLDER_ONLY }),
    ...ACCESS[access],
    ...modelArgs(model),
  ];
  for (const d of readable) args.push('--add-dir', d);
  return new Promise((res, rej) => {
    const p = spawn(claude, args, { cwd, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(p);
    let buf = '',
      said = '',
      failed = '',
      err = '';
    const late = setTimeout(() => p.kill(), 15 * 60 * 1000);
    // one JSON event per line: tool calls as they happen, and the result at the end
    const hear = (line: string) => {
      let j: unknown;
      try {
        j = JSON.parse(line);
      } catch {
        return;
      }
      if (!isRecord(j)) return;
      const content = isRecord(j.message) && Array.isArray(j.message.content) ? j.message.content : [];
      for (const c of content)
        if (isRecord(c) && c.type === 'tool_use' && EDITS.has(text(c.name)) && isRecord(c.input))
          edited(path.relative(cwd, path.resolve(cwd, text(c.input.file_path))));
      if (j.type !== 'result') return;
      noteUsage(j);
      if (j.is_error === true) failed = text(j.result) || 'Claude Code stopped before it finished.';
      else said = text(j.result);
    };
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        hear(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    p.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString('utf8')).slice(-2000);
    });
    p.on('error', e => {
      clearTimeout(late);
      running.delete(p);
      rej(e);
    });
    p.on('close', () => {
      clearTimeout(late);
      running.delete(p);
      hear(buf);
      if (failed) rej(new Error(failed.slice(0, 300)));
      else if (said) res(said);
      else rej(new Error(err.trim().split('\n').pop() || 'Claude Code stopped before it finished.'));
    });
  });
};
