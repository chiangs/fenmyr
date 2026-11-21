import { listRuns, readFirstAttempts } from './flakes-gh.ts';
import { buildLedger, isRerun, renderLedger } from './flakes-ledger.ts';

const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDays(args: string[]): number {
  let days = DEFAULT_DAYS;
  const rest = [...args];
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    const value = arg === '--days' ? rest.shift() : arg.startsWith('--days=') ? arg.slice('--days='.length) : undefined;
    if (value === undefined) throw new Error(`unknown option ${arg}`);
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--days takes a whole number of days, not ${value}`);
    days = Number(value);
  }
  return days;
}

try {
  const days = parseDays(process.argv.slice(2));
  const since = new Date(Date.now() - days * DAY_MS);
  const runs = await listRuns(since);
  const firstAttemptFailures = await readFirstAttempts(runs.filter(isRerun).map(r => r.id));
  console.log(`CI runs created since ${since.toISOString().slice(0, 16)}Z (${days} days)\n`);
  console.log(renderLedger(buildLedger({ runs, firstAttemptFailures })));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
