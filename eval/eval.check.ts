import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateDataset, parseCsv, ratingsCsv, requestBody, DETAIL_LEVELS, args, cliErrorMessage } from './core.ts';
import { checkOutputDirectory } from './output.ts';
import { mockModel } from './models/mock.ts';
import { createOpenAIClient, strictSchema } from './models/openai.ts';
import { breakdownSchema, COMPILE_SCHEMA, ESTIMATE_SCHEMA } from '../src/lib/assist/api.ts';
import { median, percentile90, summarize, switchVerdict, markdown } from './report.ts';
import { precheck } from './autorate.ts';
const sample = validateDataset(JSON.parse(await readFile(new URL('./datasets/sample.json', import.meta.url), 'utf8')));
assert.deepEqual(args(['--force', '--out', 'private', '--model', 'mock']), { force: 'true', out: 'private', model: 'mock' });
assert.deepEqual(args(['--out', 'private', '--force']), { out: 'private', force: 'true' });
const outputTest = await mkdtemp(join(tmpdir(), 'ws7-output-check-'));
try {
  await checkOutputDirectory(outputTest, false);
  for (const file of ['results.json', 'ratings.csv']) {
    await writeFile(join(outputTest, file), 'preserve this');
    await assert.rejects(checkOutputDirectory(outputTest, false), /Output already contains/);
    await checkOutputDirectory(outputTest, true);
    assert.equal(await readFile(join(outputTest, file), 'utf8'), 'preserve this');
    await rm(join(outputTest, file));
  }
  assert.equal(cliErrorMessage(new Error('Invalid results'), 'fallback'), 'Invalid results');
  assert.equal(cliErrorMessage(new SyntaxError('private text'), 'fallback'), 'fallback');
  assert.equal(cliErrorMessage(Object.assign(new Error('private path'), { code: 'ENOENT' }), 'fallback'), 'fallback');
  assert.equal(cliErrorMessage('private text', 'fallback'), 'fallback');
  await writeFile(join(outputTest, 'ratings.csv'), ratingsCsv([]));
  const report = spawnSync(process.execPath, [fileURLToPath(new URL('./report.ts', import.meta.url)), '--results', fileURLToPath(new URL('./datasets/sample.json', import.meta.url)), '--ratings', join(outputTest, 'ratings.csv')], { encoding: 'utf8' });
  assert.equal(report.status, 1); assert.equal(report.stderr.trim(), 'Invalid results'); assert.equal(report.stdout, '');
  const auto = spawnSync(process.execPath, [fileURLToPath(new URL('./autorate.ts', import.meta.url))], { encoding: 'utf8' });
  assert.equal(auto.status, 1); assert.equal(auto.stderr.trim(), 'Use --results file [--out ratings.csv] [--force]'); assert.equal(auto.stdout, '');
  await writeFile(join(outputTest, 'results.json'), JSON.stringify({ results: [] }));
  const autoArgs = [fileURLToPath(new URL('./autorate.ts', import.meta.url)), '--results', join(outputTest, 'results.json'), '--out', join(outputTest, 'auto.csv')];
  assert.equal(spawnSync(process.execPath, autoArgs).status, 0);
  await writeFile(join(outputTest, 'auto.csv'), 'human ratings to preserve');
  const refusedAuto = spawnSync(process.execPath, autoArgs, { encoding: 'utf8' });
  assert.equal(refusedAuto.status, 1); assert.match(refusedAuto.stderr, /Output file already exists/);
  assert.equal(await readFile(join(outputTest, 'auto.csv'), 'utf8'), 'human ratings to preserve');
  assert.equal(spawnSync(process.execPath, [...autoArgs, '--force']).status, 0);
  assert.equal(await readFile(join(outputTest, 'auto.csv'), 'utf8'), ratingsCsv([]));
} finally { await rm(outputTest, { recursive: true }); }
assert.equal(sample.items.length, 74);
assert.throws(() => validateDataset({ ...sample, items: [{ kind: 'estimate', task: 'Wash a mug' }] }));
for (const invalid of [null, {}, { ...sample, items: [] }, { ...sample, consent: {} }, { ...sample, items: [sample.items[0], sample.items[0]] }, { ...sample, items: [{ ...sample.items[0], level: 'bad' }] }, { ...sample, items: [{ id: 'x', kind: 'compile', text: '' }] }, { ...sample, items: [{ id: 'x', kind: 'estimate', task: 1 }] }]) assert.throws(() => validateDataset(invalid));
const input = { system: '', user: 'Split this task into steps.\nTask: Wash a mug', maxTokens: 100, signal: new AbortController().signal };
for (const schema of [breakdownSchema({ min: 7, max: 10 }), COMPILE_SCHEMA, ESTIMATE_SCHEMA]) assert.equal((await mockModel.generate({ ...input, schema })).kind, 'ok');
const modern: any = await mockModel.generate({ ...input, schema: breakdownSchema({ min: 7, max: 10 }) });
assert.equal(modern.json.steps.length, 7); assert.equal(modern.json.steps[0].minutes, 5);
for (const level of DETAIL_LEVELS) {
  const answer: any = await mockModel.generate({ ...input, schema: breakdownSchema(level) });
  assert.equal(answer.kind, 'ok');
  assert.ok(answer.json.steps.length >= level.min && answer.json.steps.length <= level.max);
  assert.deepEqual(answer.json.steps[0], { text: 'Open the checklist', minutes: 5 });
}
const estimate: any = await mockModel.generate({ ...input, schema: ESTIMATE_SCHEMA });
assert.deepEqual(estimate.json, { minutes: 5, low: 5, high: 5 });
assert.equal((await mockModel.generate({ ...input, schema: null })).kind, 'error');
assert.deepEqual(requestBody({ id: 'e', kind: 'estimate', task: 'Wash mug' }), { task: 'Wash mug' });
assert.deepEqual(requestBody({ id: 'c', kind: 'compile', text: 'Wash mug' }), { text: 'Wash mug' });
assert.deepEqual(requestBody({ id: 'b', kind: 'breakdown', task: 'Wash mug', level: 'few', context: 'Kitchen' }), { task: 'Wash mug', level: 'few', context: 'Kitchen' });
assert.deepEqual(requestBody({ id: 'b', kind: 'breakdown', task: 'Wash mug', level: 'few' }), { task: 'Wash mug', level: 'few' });
const rating = { id: 'b1', kind: 'breakdown', useful: 'y', literal: 'y', one_action: 'y', realistic_minutes: 'y', notes: 'comma, quote " and\nnewline', rater: 'human1' };
assert.deepEqual(parseCsv(ratingsCsv([rating])), [rating]);
assert.deepEqual(parseCsv('\uFEFF' + ratingsCsv([rating])), [rating]);
assert.deepEqual(parseCsv(ratingsCsv([rating]).trimEnd() + '\r'), [rating]);
assert.deepEqual(parseCsv(ratingsCsv([])), []); assert.throws(() => parseCsv('"unclosed'));
assert.equal(median([4, 1, 3, 2]), 2.5); assert.equal(median([]), null); assert.equal(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9);
const results = [...Array.from({ length: 50 }, (_, i) => ({ id: `b${i}`, kind: 'breakdown', level: 'few', status: 200, latencyMs: 100 })), ...Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, kind: 'compile', status: 200, latencyMs: 200 }))];
const ratings = results.map(r => ({ ...rating, id: r.id, kind: r.kind }));
const data = { model: 'anthropic', modelName: 'claude-haiku-5-5', consent: { source: 'contributed' }, results };
const good = summarize(data, ratings); assert.equal(good.launchBar, true);
const requiredRatings = ['useful', 'literal', 'one_action', 'realistic_minutes', 'rater'];
const blankRating = { ...ratings[0], useful: '', literal: '', one_action: '', realistic_minutes: '', rater: '' };
assert.equal(summarize(data, [blankRating]).helpers.breakdown.rated, 0);
for (const key of requiredRatings) {
  assert.throws(() => summarize(data, [{ ...ratings[0], [key]: '' }]), /all criteria and a rater/);
  assert.throws(() => summarize(data, [{ ...blankRating, [key]: key === 'rater' ? 'human1' : 'n' }]), /all criteria and a rater/);
}
const failedData = { ...data, results: [{ ...results[0], status: 502 }] };
const failedRating = { ...ratings[0], useful: 'n', literal: 'n', one_action: 'n', realistic_minutes: 'n' };
assert.equal(summarize(failedData, [failedRating]).helpers.breakdown.rated, 1);
for (const key of requiredRatings.slice(0, 4)) assert.throws(() => summarize(failedData, [{ ...failedRating, [key]: 'y' }]), /cannot pass any criterion/);
assert.match(markdown([good]), /\| breakdown \| 50 \| 50 \| 0\.00 \| 100\.00/);
assert.match(markdown([good]), /\| compile \| 10 \| 10 \|/);
const badRatings = ratings.map((r, i) => ({ ...r, useful: i < 6 ? 'n' : 'y' }));
const bad = summarize(data, badRatings); assert.equal(bad.helpers.breakdown.useful, 88); assert.equal(bad.quality, false);
const alt = { ...good, model: 'openai', modelName: 'chosen-small-model' };
assert.match(switchVerdict(bad, alt), /^SWITCH/); assert.match(switchVerdict(good, alt), /^KEEP/);
assert.match(switchVerdict({ ...bad, modelName: 'another-haiku-id' }, alt), /^SWITCH/);
assert.match(markdown([good, alt], switchVerdict(good, alt)), /Side-by-side comparison/);
assert.equal(summarize({ ...data, model: 'mock' }, ratings).launchBar, false);
assert.equal(summarize(data, ratings.map(r => ({ ...r, rater: 'auto' }))).notLaunch, true);
assert.equal(summarize({ ...data, results: results.map(r => ({ ...r, latencyMs: 3000 })) }, ratings).latency, false);
assert.equal(summarize(data, []).sample, false);
assert.match(markdown([summarize({ ...data, consent: { source: 'synthetic' } }, ratings)]), /NOT a launch result/);
assert.throws(() => summarize(data, [ratings[0], ratings[0]]));
assert.throws(() => summarize(data, [{ ...ratings[0], useful: 'maybe' }]));
assert.equal(precheck({ status: 500, kind: 'breakdown' }).useful, 'n');
assert.equal(precheck({ status: 200, kind: 'breakdown', level: 'few', output: { steps: [{ text: 'Open the checklist', minutes: 5 }] } }).useful, 'y');
assert.equal(precheck({ status: 200, kind: 'compile', output: { clusters: [] } }).useful, 'n');
const strict = strictSchema(breakdownSchema({ min: 1, max: 3 })); assert.equal(strict.additionalProperties, false); assert.equal(strict.properties.steps.maxItems, undefined);
const originalFetch = globalThis.fetch;
try {
  for (const [response, expected] of [[new Response('{}', { status: 500 }), 'error'], [Response.json({ choices: [{ message: { refusal: 'no' } }] }), 'refusal'], [Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"minutes":5}' } }] }), 'ok']] as const) {
    globalThis.fetch = async () => response;
    assert.equal((await createOpenAIClient('test', 'test').generate({ ...input, schema: ESTIMATE_SCHEMA })).kind, expected);
  }
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.equal((await createOpenAIClient('test', 'test').generate({ ...input, schema: {} })).kind, 'error');
  assert.equal((await createOpenAIClient('test', 'test').generate({ ...input, schema: {}, signal: AbortSignal.abort() })).kind, 'timeout');
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: dataset validation, mock schemas, CSV quoting, report math/bars, adapters, auto checks, OpenAI outcomes');
