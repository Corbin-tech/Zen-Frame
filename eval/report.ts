import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { args, parseCsv } from './core.ts';
export function median(values: number[]) { const v = [...values].sort((a, b) => a - b); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : null; }
export function percentile90(values: number[]) { const v = [...values].sort((a, b) => a - b); return v.length ? v[Math.ceil(v.length * .9) - 1] : null; }
export function summarize(data: any, ratings: Record<string, string>[]) {
  if (!Array.isArray(data.results) || !['synthetic', 'contributed'].includes(data.consent?.source)) throw new Error('Invalid results');
  const seen = new Set();
  for (const r of ratings) {
    const result = data.results.find((v: any) => v.id === r.id);
    if (!result || result.kind !== r.kind || r.kind === 'estimate' || seen.has(r.id)) throw new Error('Unknown, mismatched, or duplicate rating');
    seen.add(r.id);
    for (const k of ['useful', 'literal', 'one_action', 'realistic_minutes']) if (!['', 'y', 'n'].includes(r[k])) throw new Error('Ratings must be y/n or blank');
    if (r.useful && (!r.rater.trim() || ['literal', 'one_action', 'realistic_minutes'].some(k => !r[k]))) throw new Error('Completed ratings need all criteria and a rater');
    if (result.status !== 200 && r.useful === 'y') throw new Error('Failed responses cannot be useful');
  }
  const helpers = Object.fromEntries(['breakdown', 'compile', 'estimate'].map(kind => {
    const rows = data.results.filter((r: any) => r.kind === kind);
    const rated = ratings.filter(r => r.kind === kind && r.useful);
    const pct = (k: string) => rated.length ? 100 * rated.filter(r => r[k] === 'y').length / rated.length : null;
    const times = rows.map((r: any) => r.latencyMs);
    return [kind, { count: rows.length, rated: rated.length, errorRate: rows.length ? 100 * rows.filter((r: any) => r.status !== 200).length / rows.length : null, useful: pct('useful'), literal: pct('literal'), one_action: pct('one_action'), realistic_minutes: pct('realistic_minutes'), medianMs: median(times), p90Ms: percentile90(times) }];
  }));
  const quality = ['breakdown', 'compile'].every(k => helpers[k].useful !== null && helpers[k].useful >= 90);
  const latency = ['breakdown', 'compile'].every(k => helpers[k].medianMs !== null && helpers[k].medianMs < 3000);
  const sample = helpers.breakdown.rated >= 50 && helpers.compile.rated >= 10;
  const auto = ratings.some(r => r.rater.trim().toLowerCase() === 'auto');
  const notLaunch = data.model === 'mock' || data.consent.source === 'synthetic' || auto;
  return { model: data.model, modelName: data.modelName, consent: data.consent, auto, helpers, quality, latency, sample, notLaunch, launchBar: quality && latency && sample && !notLaunch };
}
export function switchVerdict(a: any, b: any) {
  const haiku = [a, b].find(v => v.model === 'anthropic' && v.modelName === 'claude-haiku-5-5');
  const alternative = [a, b].find(v => v.model === 'openai');
  if (!haiku || !alternative || [a, b].some(v => v.notLaunch || !v.sample)) return 'INCONCLUSIVE: requires Haiku and OpenAI, consented real data, adequate human ratings.';
  return (!haiku.quality || !haiku.latency) && alternative.quality && alternative.latency ? 'SWITCH: Haiku misses useful or latency bar; OpenAI meets both.' : 'KEEP HAIKU under decision 4 switch rule (this does not authorize launch).';
}
export function markdown(reports: any[], verdict?: string) {
  const fmt = (v: any, metric: string) => v === null ? 'N/A' : typeof v === 'number' ? v.toFixed(metric === 'count' || metric === 'rated' ? 0 : 2) : String(v);
  const comparison = reports.length === 2 ? '\n## Side-by-side comparison\n\n| Helper / metric | ' + reports.map(r => r.modelName).join(' | ') + ' |\n|---|---:|---:|\n' + ['breakdown', 'compile', 'estimate'].flatMap(kind => ['count', 'errorRate', 'useful', 'literal', 'one_action', 'realistic_minutes', 'medianMs', 'p90Ms'].map(metric => `| ${kind} / ${metric} | ${reports.map(r => fmt(r.helpers[kind][metric], metric)).join(' | ')} |`)).join('\n') + '\n' : '';
  if (comparison) verdict = comparison + '\n' + (verdict ?? '');
  return '# Quality evaluation report\n\n' + (reports.some(r => r.notLaunch) ? '**NOT a launch result — mock model, synthetic data, or automatic ratings.**\n\n' : '') + reports.map(r => `## ${r.modelName}\n\nConsent source: ${r.consent.source}. Ratings: ${r.auto ? 'automatic pre-checks' : 'human (as declared in CSV)'}.\n\n| Helper | Count | Rated | Error % | Useful % | Literal % | One action % | Realistic minutes % | Median ms | p90 ms |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n` + Object.entries(r.helpers).map(([k, v]: [string, any]) => `| ${k} | ${['count', 'rated', 'errorRate', 'useful', 'literal', 'one_action', 'realistic_minutes', 'medianMs', 'p90Ms'].map(p => fmt(v[p], p)).join(' | ')} |`).join('\n') + `\n\n- Both helpers ≥90% useful: ${r.quality ? 'PASS' : 'FAIL'}\n- ≥50 breakdown and ≥10 brain dumps rated: ${r.sample ? 'PASS' : 'FAIL'}\n- Each helper median <3000 ms: ${r.latency ? 'PASS' : 'FAIL'}\n- Quality launch bar: ${r.launchBar ? 'PASS (other human gates still required)' : 'NOT MET'}\n`).join('\n') + (verdict ? `\n## Decision 4 comparison\n\n${verdict}\n` : '') + '\nAccessibility, security review, working state and Cancel require separate WS8 sign-off.\n';
}
async function main() {
  const a = args(); if (!a.results || !a.ratings || Boolean(a.compare) !== Boolean(a['compare-ratings'])) throw new Error('Use --results file --ratings csv [--compare file --compare-ratings csv]');
  const load = async (result: string, rating: string) => ({ data: JSON.parse(await readFile(result, 'utf8')), ratings: parseCsv(await readFile(rating, 'utf8')) });
  const first = await load(a.results, a.ratings); const reports = [summarize(first.data, first.ratings)];
  let verdict;
  if (a.compare) {
    const second = await load(a.compare, a['compare-ratings']);
    const signature = (d: any) => JSON.stringify(d.results.map((r: any) => [r.id, r.kind, r.level]).sort());
    if (signature(first.data) !== signature(second.data)) throw new Error('Comparison requires matching dataset ids, kinds and levels');
    reports.push(summarize(second.data, second.ratings)); verdict = switchVerdict(reports[0], reports[1]);
  }
  const out = dirname(resolve(a.results));
  await writeFile(resolve(out, 'report.md'), markdown(reports, verdict), { mode: 0o600 });
  await writeFile(resolve(out, 'report.json'), JSON.stringify({ reports, verdict }, null, 2), { mode: 0o600 });
  console.log(`Report written for ${reports.length} model(s)`);
}
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) main().catch(() => { console.error('Report failed: check matching results, completed ratings, and paths'); process.exitCode = 1; });
