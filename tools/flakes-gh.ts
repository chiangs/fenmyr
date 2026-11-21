import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Run } from './flakes-ledger.ts';
import { type Failure, parseLog } from './flakes-log.ts';

const FIELDS = 'databaseId,headSha,headBranch,event,createdAt,attempt,conclusion';
const PARALLEL = 5;
const RUN_LIMIT = 1000;
const MAX_LOG_BYTES = 256 * 1024 * 1024;

const exec = promisify(execFile);
const gh = async (args: string[]) => (await exec('gh', args, { encoding: 'utf8', maxBuffer: MAX_LOG_BYTES })).stdout;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(of: Record<string, unknown>, key: string): string {
  const v = of[key];
  if (typeof v !== 'string') throw new Error(`gh run list: ${key} is not text in ${JSON.stringify(of).slice(0, 160)}`);
  return v;
}

function whole(of: Record<string, unknown>, key: string): number {
  const v = of[key];
  if (typeof v !== 'number' || !Number.isInteger(v))
    throw new Error(`gh run list: ${key} is not a whole number in ${JSON.stringify(of).slice(0, 160)}`);
  return v;
}

export function parseRuns(json: string): Run[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw)) throw new Error('gh run list: the reply is not a list');
  return raw.map((item: unknown): Run => {
    if (!isRecord(item)) throw new Error(`gh run list: a run is not an object: ${JSON.stringify(item).slice(0, 160)}`);
    return {
      id: whole(item, 'databaseId'),
      sha: text(item, 'headSha'),
      branch: text(item, 'headBranch'),
      event: text(item, 'event'),
      created: text(item, 'createdAt'),
      attempts: whole(item, 'attempt'),
      // gh leaves the conclusion empty until the latest attempt has ended
      conclusion: text(item, 'conclusion') || 'running',
    };
  });
}

export async function listRuns(since: Date): Promise<Run[]> {
  const window = ['--workflow', 'CI', '--created', `>=${since.toISOString()}`, '--limit', String(RUN_LIMIT)];
  const runs = parseRuns(await gh(['run', 'list', ...window, '--json', FIELDS]));
  if (runs.length >= RUN_LIMIT)
    console.error(`gh stopped at ${RUN_LIMIT} runs, so the oldest in this window are missing`);
  return runs;
}

// The run list shows only the last attempt.
export async function readFirstAttempts(ids: number[]): Promise<Map<number, Failure[]>> {
  const found = new Map<number, Failure[]>();
  const queue = [...ids];
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        found.set(id, parseLog(await gh(['run', 'view', String(id), '--attempt', '1', '--log-failed'])));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        found.set(id, [{ kind: 'unread', message: message.replace(/\s+/g, ' ') }]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, ids.length) }, worker));
  return found;
}
