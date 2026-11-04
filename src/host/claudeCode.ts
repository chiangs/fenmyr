import { spawn } from 'node:child_process';
import path from 'node:path';
import { claudePath, hookArgs, noteUsage } from './claude.ts';
import type { CodeAgent } from './codeAgent.ts';
import { env, isRecord, text } from './util.ts';

// Claude Code works in the prototype's folder with file tools only: no shell, no web, no other agents. Claude Code keeps
// writes inside its working folder, and Fenmyr checks afterwards that nothing outside changed.
const TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep'];
const EDITS = new Set(['Write', 'Edit', 'MultiEdit']);

export const claudeCode: CodeAgent = async ({ cwd, prompt }, edited) => {
  const claude = await claudePath();
  if (!claude) throw new Error('I need Claude Code to write code. Settings → Helpers shows how to set it up.');
  const args = [
    '-p',
    prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    ...hookArgs(),
    '--permission-mode',
    'acceptEdits',
  ];
  args.push('--allowedTools', TOOLS.join(','), '--disallowedTools', 'Bash,WebFetch,WebSearch,Task');
  return new Promise((res, rej) => {
    const p = spawn(claude, args, { cwd, env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
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
      rej(e);
    });
    p.on('close', () => {
      clearTimeout(late);
      hear(buf);
      if (failed) rej(new Error(failed.slice(0, 300)));
      else if (said) res(said);
      else rej(new Error(err.trim().split('\n').pop() || 'Claude Code stopped before it finished.'));
    });
  });
};
