// @ts-ignore Node's built-in assertion module is available at runtime; no Node typings dependency.
import assert from 'node:assert/strict';
import { handleAssist, BODY_LIMIT } from './handler.ts';
import { mockModel, mockEntitlement, memoryRateLimiter } from './mocks.ts';
import { breakdownSchema, COMPILE_SCHEMA, ESTIMATE_SCHEMA } from '../../src/lib/assist/api.ts';
import { DETAIL_LEVELS } from '../../src/lib/assist/types.ts';
import { cleanAnswer } from './validation.ts';
import { createAnthropicClient } from './anthropic.ts';
import { createCloudProvider, AssistError } from '../../src/lib/assist/cloudProvider.ts';
import { onRequest } from '../../functions/api/assist/[endpoint].ts';
import type { ModelClient } from './ports.ts';

const secretText = 'private-input-check';
const SCHEMAS = { breakdown: breakdownSchema(DETAIL_LEVELS[0]), compile: COMPILE_SCHEMA, estimate: ESTIMATE_SCHEMA };
const inputs = { breakdown: { task: secretText, level: 'few' }, compile: { text: secretText }, estimate: { task: secretText } };
function request(endpoint = 'breakdown', body: unknown = inputs.breakdown, headers: Record<string, string> = {}, method = 'POST', signal?: AbortSignal) {
  return new Request(`https://zen.test/api/assist/${endpoint}`, { method, headers: { Origin: 'https://zen.test', 'Content-Type': 'application/json', Authorization: 'Bearer test-token', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal });
}
function setup(model = mockModel(), entitlement = mockEntitlement(), limit = 100) {
  return { model, entitlement, rateLimit: memoryRateLimiter(limit) };
}
let tests = 0;
const originalConsole = { ...console };
const logged: unknown[][] = [];
for (const name of ['log', 'error', 'warn', 'info', 'debug'] as const) console[name] = (...args: unknown[]) => { logged.push(args); };
try {
  for (const endpoint of ['breakdown', 'compile', 'estimate'] as const) {
    const deps = setup(); const result = await handleAssist(request(endpoint, inputs[endpoint]), deps);
    assert.equal(result.status, 200); assert.ok(cleanAnswer(endpoint, await result.json()));
    assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 1, released: 0 }); tests++;
  }
  for (const endpoint of ['breakdown', 'compile', 'estimate'] as const) {
    for (const text of ['buy milk\ncall mom', 'buy milk\r\ncall mom', '\u0000buy milk\t\ncall mom\u007f']) {
      const input = endpoint === 'compile' ? { text } : endpoint === 'estimate' ? { task: text } : { task: text, level: 'few' };
      const model: ModelClient = { async generate(args) {
        assert.ok(args.user.includes('buy milk\ncall mom'));
        assert.ok(!args.user.includes('\r'));
        assert.ok(!args.user.includes('\u0000'));
        return mockModel().generate(args);
      } };
      assert.equal((await handleAssist(request(endpoint, input), setup(model))).status, 200); tests++;
    }
  }
  assert.deepEqual(cleanAnswer('breakdown', { steps: [{ text: 'buy milk\ncall mom', minutes: 10 }] }), { steps: [{ text: 'buy milk call mom', minutes: 10 }] }); tests++;
  for (const [req, status] of [
    [request('breakdown', undefined, { Origin: 'https://other.test' }), 403],
    [request('breakdown', undefined, { Origin: '' }), 403],
    [request('breakdown', undefined, { 'Sec-Fetch-Site': 'same-site' }), 403],
    [request('breakdown', undefined, {}, 'GET'), 405],
    [request('breakdown', undefined, {}, 'OPTIONS'), 405],
    [request('unknown'), 404],
    [request('breakdown', undefined, { Authorization: '' }), 401],
    [request('breakdown', undefined, { Authorization: 'Bearer bad' }), 401],
    [request('breakdown', { task: 'a'.repeat(6001), level: 'few' }), 413],
    [request('breakdown', { task: 'a'.repeat(3001), context: 'b'.repeat(3000), level: 'few' }), 413],
    [request('compile', { text: 'a'.repeat(6001) }), 413],
    [request('estimate', { task: 'a'.repeat(6001) }), 413],
    [request('compile', { text: 'a'.repeat(BODY_LIMIT) }), 413],
    [request('compile', { text: '' }), 400], [request('compile', { text: '\r\n\u0000' }), 400], [request('estimate', { task: '' }), 400],
    [request('estimate', { tasks: ['a'] }), 400], [request('compile', { text: 'a', extra: true }), 400],
    [request('breakdown', { task: 'a', level: 'bad' }), 400],
    [request('compile', undefined, { 'Content-Type': 'text/plain' }), 415],
    [new Request('https://zen.test/api/assist/compile', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: '{}' }), 403],
    [new Request('https://zen.test/api/assist/compile', { method: 'POST', headers: { Origin: 'https://zen.test', 'Content-Type': 'application/json', Authorization: 'Bearer test-token' }, body: '{' }), 400],
  ] as const) {
    const deps = setup(); const response = await handleAssist(req, deps); assert.equal(response.status, status);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(deps.entitlement.counts.reserved, 0); tests++;
  }
  const denied = setup(mockModel(), mockEntitlement(), 0);
  assert.equal((await handleAssist(request(), denied)).status, 429); tests++;
  for (const mode of ['invalid', 'refusal', 'timeout', 'throw'] as const) {
    const deps = setup(mockModel(mode)); const response = await handleAssist(request(), deps);
    assert.equal(response.status, mode === 'timeout' ? 504 : mode === 'throw' ? 503 : 502);
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 0, released: 1 }); tests++;
  }
  for (const options of [{ complete: false }, { throws: true }]) {
    const deps = setup(mockModel(), mockEntitlement(options)); const response = await handleAssist(request(), deps);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 1, released: 1 }); tests++;
  }
  const quota = setup(mockModel(), mockEntitlement({ quota: false }));
  assert.equal((await handleAssist(request(), quota)).status, 402); assert.equal(quota.entitlement.counts.completed, 0); tests++;
  const controller = new AbortController();
  const abortModel: ModelClient = { async generate() { controller.abort(); return { kind: 'ok', json: { steps: ['Done'] } }; } };
  const aborted = setup(abortModel); assert.equal((await handleAssist(request('breakdown', inputs.breakdown, {}, 'POST', controller.signal), aborted)).status, 503);
  assert.equal(aborted.entitlement.counts.released, 1); tests++;
  assert.deepEqual(cleanAnswer('breakdown', { steps: [{ text: ' \u0000' + 'a'.repeat(400), minutes: 10 }], id: 'bad' }), { steps: [{ text: 'a'.repeat(200), minutes: 10 }] });
  assert.equal(cleanAnswer('breakdown', { steps: [] }), null);
  assert.equal(cleanAnswer('compile', { clusters: [] }), null);
  assert.equal(cleanAnswer('estimate', { minutes: 0, low: 1, high: 5 }), null);
  assert.deepEqual(cleanAnswer('estimate', { minutes: 10, low: 20, high: 30, id: 'bad' }), { minutes: 10, low: 10, high: 30 });
  const cluster = cleanAnswer('compile', { clusters: [{ name: 'x'.repeat(150), color: 'red', tasks: [{ text: 'y'.repeat(500), minutes: 10, url: 'bad' }] }] });
  assert.deepEqual(cluster, { clusters: [{ name: 'x'.repeat(60), tasks: [{ text: 'y'.repeat(200), minutes: 10 }] }] });
  assert.equal(cleanAnswer('breakdown', { steps: Array(40).fill('step') })?.steps.length, 12); tests++;

  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.anthropic.com/v1/messages');
      const headers = new Headers(init?.headers); assert.equal(headers.get('x-api-key'), 'fake-key'); assert.equal(headers.get('anthropic-version'), '2023-06-01');
      const body = JSON.parse(init?.body as string);
      assert.deepEqual(body, { model: 'claude-haiku-5-5', max_tokens: 100, system: 'system', messages: [{ role: 'user', content: secretText }], thinking: { type: 'disabled' }, output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }] } }, required: ['text', 'minutes'], additionalProperties: false }, minItems: 1 } }, required: ['steps'], additionalProperties: false } } } });
      assert.equal('tools' in body, false);
      return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"steps":["Start"]}' }] });
    };
    const client = createAnthropicClient('fake-key'); const arg = { system: 'system', user: secretText, schema: SCHEMAS.breakdown, maxTokens: 100, signal: new AbortController().signal };
    assert.deepEqual(await client.generate(arg), { kind: 'ok', json: { steps: ['Start'] } }); tests++;
    const strictSchemas = JSON.stringify(SCHEMAS);
    globalThis.fetch = async (_url, init) => {
      const schema = JSON.parse(init?.body as string).output_config.format.schema;
      function check(value: unknown) {
        if (!value || typeof value !== 'object') return;
        for (const [key, item] of Object.entries(value)) {
          assert.ok(!['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'maxItems'].includes(key));
          if (key === 'minItems') assert.ok(item === 0 || item === 1);
          check(item);
        }
      }
      check(schema);
      return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] });
    };
    for (const schema of [...Object.values(SCHEMAS), { type: 'array', minItems: 2, maxItems: 10, items: { type: 'number', minimum: 1, maximum: 10, exclusiveMinimum: 0, exclusiveMaximum: 11, multipleOf: 1 } }]) {
      assert.equal((await client.generate({ ...arg, schema })).kind, 'ok'); tests++;
    }
    assert.equal(JSON.stringify(SCHEMAS), strictSchemas);
    for (const [response, kind] of [[new Response('fake-key', { status: 500 }), 'error'], [Response.json({ stop_reason: 'refusal' }), 'refusal'], [Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'invalid' }] }), 'error']] as const) {
      globalThis.fetch = async () => response; assert.deepEqual(await client.generate(arg), { kind }); tests++;
    }
    globalThis.fetch = async () => { throw new Error('fake-key'); };
    assert.deepEqual(await client.generate(arg), { kind: 'error' });
    const c = new AbortController(); c.abort(); assert.deepEqual(await client.generate({ ...arg, signal: c.signal }), { kind: 'timeout' }); tests++;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/assist/breakdown'); assert.equal(init?.credentials, 'same-origin'); assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
      assert.deepEqual(JSON.parse(init?.body as string), { task: secretText, level: 'few', context: 'Home' });
      return Response.json({ steps: [{ text: ' Start ', minutes: 10 }], id: 'bad' });
    };
    const cloud = createCloudProvider({ getToken: () => 'test-token' });
    assert.equal(cloud.id, 'plus'); assert.equal(await cloud.status(), 'ready');
    assert.deepEqual(await cloud.breakdown(secretText, 'few', 'Home'), { steps: [{ text: 'Start', minutes: 10 }] }); tests++;
    for (const [status, code] of [[401, 'unauthorized'], [429, 'rate_limited'], [413, 'too_long'], [503, 'unavailable'], [400, 'invalid']] as const) {
      globalThis.fetch = async () => new Response('{}', { status });
      await assert.rejects(cloud.breakdown('a', 'few', ''), (e: unknown) => e instanceof AssistError && e.code === code); tests++;
    }
    globalThis.fetch = async () => Response.json({ steps: [] });
    await assert.rejects(cloud.breakdown('a', 'few', ''), AssistError); tests++;
  } finally { globalThis.fetch = realFetch; }
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
  assert.equal((await onRequest({ request: request(), env: { ANTHROPIC_API_KEY: 'fake-key', ASSIST_RATE_LIMITER: { async limit() { return { success: true }; } } } })).status, 401); tests++;
  assert.equal(JSON.stringify(logged).includes(secretText), false);
  assert.equal(logged.length, 0); tests++;
} finally { Object.assign(console, originalConsole); }
console.log(`All ${tests} assist checks passed.`);
