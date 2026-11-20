import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { args, DETAIL_LEVELS, ratingsCsv } from './core.ts';
export function precheck(row: any) {
  const steps = row.kind === 'breakdown' ? row.output?.steps : row.output?.clusters?.flatMap((c: any) => c.tasks);
  const present = row.status === 200 && Array.isArray(steps) && steps.length > 0;
  const verb = /^(open|write|read|put|place|pick|choose|collect|gather|wash|wipe|send|save|check|call|set|remove|sort|fold|fill|close|list|move|take|add|review|book|pay|print|attach|measure|prepare)\b/i;
  const literal = present && steps.every((s: any) => verb.test(s.text));
  const action = literal && steps.every((s: any) => !/ and |;/.test(s.text));
  const minutes = present && steps.every((s: any) => Number.isInteger(s.minutes) && s.minutes >= 1 && s.minutes <= 480);
  const level = DETAIL_LEVELS.find(l => l.id === row.level);
  const count = present && (row.kind !== 'breakdown' || (!!level && steps.length >= level.min && steps.length <= level.max));
  return { id: row.id, kind: row.kind, useful: action && minutes && count ? 'y' : 'n', literal: literal ? 'y' : 'n', one_action: action ? 'y' : 'n', realistic_minutes: minutes ? 'y' : 'n', notes: `Heuristic only; step_count=${count ? 'pass' : 'fail'}; human review required`, rater: 'auto' };
}
async function main() {
  const a = args(); if (!a.results) throw new Error('Use --results file [--out ratings.csv]');
  const data = JSON.parse(await readFile(a.results, 'utf8'));
  const rows = data.results.filter((r: any) => r.kind !== 'estimate').map(precheck);
  await writeFile(resolve(a.out ?? resolve(dirname(a.results), 'ratings-auto.csv')), ratingsCsv(rows), { mode: 0o600 });
  console.log(`Auto prechecked ${rows.length} items; NOT human ratings`);
}
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main().catch(() => { console.error('Autorating failed: check results and output paths'); process.exitCode = 1; });
