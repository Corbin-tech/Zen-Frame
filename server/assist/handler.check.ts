// @ts-ignore Node's built-in assertion module is available at runtime; no Node typings dependency.
import assert from 'node:assert/strict';
import { handleAssist, BODY_LIMIT } from './handler.ts';
import { mockModel, mockEntitlement, memoryRateLimiter } from './mocks.ts';
import { ASSIST_ERROR_STATUS, breakdownSchema, COMPILE_SCHEMA, ESTIMATE_SCHEMA } from '../../src/lib/assist/api.ts';
import { DETAIL_LEVELS } from '../../src/lib/assist/types.ts';
import { cleanAnswer } from './validation.ts';
import { createAnthropicClient } from './anthropic.ts';
import { createCloudProvider, AssistError } from '../../src/lib/assist/cloudProvider.ts';
import { onRequest, selectAssistRateLimiter } from '../../functions/api/assist/[endpoint].ts';
import type { ModelClient, RateLimiter } from './ports.ts';
import { ASSIST_IP_RATE_LIMIT, ASSIST_RATE_LIMIT, ASSIST_RATE_WINDOW_SECONDS, createD1RateLimiter, hashIp } from './rateLimit.ts';
import type { AssistDatabase } from './rateLimit.ts';

const secretText = 'private-input-check';
const SCHEMAS = { breakdown: breakdownSchema(DETAIL_LEVELS[0]), compile: COMPILE_SCHEMA, estimate: ESTIMATE_SCHEMA };
const inputs = { breakdown: { task: secretText, level: 'few' }, compile: { text: secretText }, estimate: { task: secretText } };
function request(endpoint = 'breakdown', body: unknown = inputs.breakdown, headers: Record<string, string> = {}, method = 'POST', signal?: AbortSignal) {
  return new Request(`https://zen.test/api/assist/${endpoint}`, { method, headers: { Origin: 'https://zen.test', 'Content-Type': 'application/json', Authorization: 'Bearer test-token', 'CF-Connecting-IP': '192.0.2.1', ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}), signal });
}
function setup(model = mockModel(), entitlement = mockEntitlement(), limit = 100) {
  return { model, entitlement, rateLimit: memoryRateLimiter(limit), ipRateLimit: memoryRateLimiter(1000) as RateLimiter | null };
}
function fakeD1() {
  const rows = new Map<string, { window: number; count: number }>();
  const calls: { sql: string; values: (string | number | null)[] }[] = [];
  const db: AssistDatabase = { prepare(sql) {
    assert.match(sql, /INSERT INTO assist_(?:ip_)?rate_limits/);
    assert.match(sql, /ON CONFLICT \((?:account_id|ip_hash)\) DO UPDATE/);
    assert.match(sql, /RETURNING count/);
    return { bind(...values) {
      calls.push({ sql, values });
      this.first = async <T>() => {
        const [accountId, window, cap] = values as [string, number, number];
        const rowKey = sql.includes('assist_ip_rate_limits') ? `ip-table:${accountId}` : accountId;
        const old = rows.get(rowKey);
        if (old && old.window > window) return null;
        const row = { window, count: !old || old.window < window ? 1 : Math.min(old.count + 1, cap) };
        rows.set(rowKey, row);
        return { count: row.count } as T;
      };
      return this;
    }, async first<T>(): Promise<T | null> { throw new Error('unbound statement'); } };
  } };
  return { db, rows, calls };
}
let tests = 0;
const originalConsole = { ...console };
const logged: unknown[][] = [];
for (const name of ['log', 'error', 'warn', 'info', 'debug'] as const) console[name] = (...args: unknown[]) => { logged.push(args); };
try {
  const ipAddress = '192.0.2.1';
  const digest = await hashIp(ipAddress);
  assert.match(digest, /^ip:[a-f0-9]{64}$/); assert.ok(!digest.includes(ipAddress)); tests++;
  function observed() {
    const deps = setup(); const calls = { authenticate: 0, accountLimit: 0, model: 0 };
    const authenticate = deps.entitlement.authenticate;
    deps.entitlement.authenticate = async token => { calls.authenticate++; return authenticate(token); };
    const generate = deps.model.generate;
    deps.model.generate = async input => { calls.model++; return generate(input); };
    deps.rateLimit = { limit() { calls.accountLimit++; return true; } };
    return { deps, calls };
  }
  const guarded = observed(); guarded.deps.ipRateLimit = memoryRateLimiter(2);
  assert.equal((await handleAssist(request(), guarded.deps)).status, 200);
  assert.equal((await handleAssist(request('compile', inputs.compile), guarded.deps)).status, 200);
  const ipBlocked = await handleAssist(request('estimate', inputs.estimate), guarded.deps);
  assert.equal(ipBlocked.status, 429); assert.deepEqual(await ipBlocked.json(), { error: 'rate_limited' });
  assert.deepEqual(guarded.calls, { authenticate: 2, accountLimit: 2, model: 2 });
  assert.deepEqual(guarded.deps.entitlement.counts, { reserved: 2, completed: 2, released: 0 }); tests++;
  assert.equal((await handleAssist(request('estimate', inputs.estimate, { 'CF-Connecting-IP': '192.0.2.2' }), guarded.deps)).status, 200); tests++;
  for (const mode of ['missing-header', 'blank-header', 'missing-limiter', 'limiter-error', 'blocked-without-token'] as const) {
    const { deps, calls } = observed();
    const req = request();
    if (mode === 'missing-header') req.headers.delete('CF-Connecting-IP');
    if (mode === 'blank-header') req.headers.set('CF-Connecting-IP', ' ');
    if (mode === 'missing-limiter') deps.ipRateLimit = null;
    if (mode === 'limiter-error') deps.ipRateLimit = { async limit() { throw new Error('unavailable'); } };
    if (mode === 'blocked-without-token') { req.headers.delete('Authorization'); deps.ipRateLimit = memoryRateLimiter(0); }
    const response = await handleAssist(req, deps);
    assert.equal(response.status, mode === 'blocked-without-token' ? 429 : 503);
    assert.deepEqual(await response.json(), { error: mode === 'blocked-without-token' ? 'rate_limited' : 'unavailable' });
    assert.deepEqual(calls, { authenticate: 0, accountLimit: 0, model: 0 });
    assert.deepEqual(deps.entitlement.counts, { reserved: 0, completed: 0, released: 0 }); tests++;
  }
  const ipDb = fakeD1(); let ipClock = 0;
  const dbIpLimiter = createD1RateLimiter(ipDb.db, () => ipClock, 'ip');
  const ipOnly = observed(); ipOnly.deps.ipRateLimit = dbIpLimiter;
  for (let i = 0; i < ASSIST_IP_RATE_LIMIT; i++) {
    assert.equal((await handleAssist(request('breakdown', inputs.breakdown, { Authorization: '' }), ipOnly.deps)).status, 401);
  }
  assert.equal((await handleAssist(request(), ipOnly.deps)).status, 429);
  assert.deepEqual(ipOnly.calls, { authenticate: 0, accountLimit: 0, model: 0 });
  assert.deepEqual(ipOnly.deps.entitlement.counts, { reserved: 0, completed: 0, released: 0 }); tests++;
  const sameKeyAccountLimiter = createD1RateLimiter(ipDb.db, () => ipClock);
  for (let i = 0; i < ASSIST_RATE_LIMIT; i++) assert.equal(await sameKeyAccountLimiter.limit(digest), true);
  assert.equal(await sameKeyAccountLimiter.limit(digest), false);
  assert.equal(await dbIpLimiter.limit(await hashIp('192.0.2.2')), true);
  assert.equal(await dbIpLimiter.limit(digest), false); tests++;
  ipClock = ASSIST_RATE_WINDOW_SECONDS * 1000;
  assert.equal(await dbIpLimiter.limit(digest), true);
  assert.ok(ipDb.calls.every(call => !JSON.stringify(call).includes(ipAddress))); tests++;
  const separateDb = fakeD1();
  const independentIp = createD1RateLimiter(separateDb.db, () => 0, 'ip');
  const independentAccount = createD1RateLimiter(separateDb.db, () => 0);
  for (let i = 0; i < ASSIST_RATE_LIMIT; i++) assert.equal(await independentAccount.limit(digest), true);
  assert.equal(await independentAccount.limit(digest), false);
  assert.equal(await independentIp.limit(digest), true); tests++;
  let ipBindingCalls = 0;
  const boundIp = selectAssistRateLimiter({ PLUS_DB: separateDb.db, ASSIST_IP_RATE_LIMITER: { async limit({ key }) { assert.equal(key, digest); ipBindingCalls++; return { success: true }; } } }, 'ip');
  const priorIpDbCalls = separateDb.calls.length;
  assert.equal(await boundIp?.limit(digest), true); assert.equal(ipBindingCalls, 1); assert.equal(separateDb.calls.length, priorIpDbCalls); tests++;
  assert.equal(await selectAssistRateLimiter({ PLUS_DB: separateDb.db }, 'ip')?.limit(await hashIp('192.0.2.3')), true);
  assert.equal(selectAssistRateLimiter({ ASSIST_RATE_LIMITER: { async limit() { return { success: true }; } } }, 'ip'), null); tests++;
  for (const binding of [false, 'error'] as const) {
    const { deps, calls } = observed();
    deps.ipRateLimit = selectAssistRateLimiter({ PLUS_DB: separateDb.db, ASSIST_IP_RATE_LIMITER: { async limit() { if (binding === 'error') throw new Error('unavailable'); return { success: false }; } } }, 'ip');
    const dbCallsBefore = separateDb.calls.length;
    assert.equal((await handleAssist(request(), deps)).status, binding === false ? 429 : 503);
    assert.equal(separateDb.calls.length, dbCallsBefore);
    assert.deepEqual(calls, { authenticate: 0, accountLimit: 0, model: 0 });
    assert.deepEqual(deps.entitlement.counts, { reserved: 0, completed: 0, released: 0 }); tests++;
  }
  const database = fakeD1(); let clock = 0;
  const rateLimit = createD1RateLimiter(database.db, () => clock);
  const d1Deps = { ...setup(), rateLimit };
  for (let i = 0; i < ASSIST_RATE_LIMIT; i++) {
    assert.equal((await handleAssist(request(), d1Deps)).status, 200); tests++;
  }
  const limited = await handleAssist(request(), d1Deps);
  assert.equal(limited.status, 429); assert.deepEqual(await limited.json(), { error: 'rate_limited' });
  assert.equal(d1Deps.entitlement.counts.reserved, ASSIST_RATE_LIMIT); tests++;
  assert.equal(await rateLimit.limit('other-account'), true); tests++;
  clock = ASSIST_RATE_WINDOW_SECONDS * 1000 - 1;
  assert.equal(await rateLimit.limit('test-account'), false); tests++;
  clock++;
  assert.equal(await rateLimit.limit('test-account'), true);
  assert.equal(database.rows.get('test-account')?.count, 1); assert.equal(database.rows.size, 2); tests++;
  clock = 0; assert.equal(await rateLimit.limit('test-account'), false); tests++;
  assert.ok(database.calls.every(call => !call.sql.includes('test-account')));
  let bindingCalls = 0;
  const selected = selectAssistRateLimiter({ PLUS_DB: database.db, ASSIST_RATE_LIMITER: { async limit({ key }) { assert.equal(key, 'chosen-account'); bindingCalls++; return { success: false }; } } });
  const dbCalls = database.calls.length;
  assert.equal(await selected?.limit('chosen-account'), false); assert.equal(bindingCalls, 1); assert.equal(database.calls.length, dbCalls); tests++;
  assert.equal(await selectAssistRateLimiter({ PLUS_DB: database.db })?.limit('db-account'), true);
  assert.equal(database.calls.length, dbCalls + 1); assert.equal(selectAssistRateLimiter({}), null); tests++;
  assert.equal((await onRequest({ request: request(), env: { ANTHROPIC_API_KEY: 'fake-key', PLUS_DB: database.db } })).status, 401); tests++;
  assert.equal((await onRequest({ request: request(), env: { ANTHROPIC_API_KEY: 'fake-key' } })).status, 503); tests++;
  const brokenDb: AssistDatabase = { prepare() { throw new Error('unavailable'); } };
  const dbFailure = { ...setup(), rateLimit: createD1RateLimiter(brokenDb) };
  assert.equal((await handleAssist(request(), dbFailure)).status, 503); assert.equal(dbFailure.entitlement.counts.reserved, 0); tests++;
  for (const endpoint of ['breakdown', 'compile', 'estimate'] as const) {
    const deps = setup(); const result = await handleAssist(request(endpoint, inputs[endpoint]), deps);
    assert.equal(result.status, 200); assert.ok(cleanAnswer(endpoint, await result.json()));
    assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 1, released: 0 }); tests++;
  }
  for (const level of DETAIL_LEVELS) {
    for (const count of [level.min - 1, level.min, level.max, level.max + 1]) {
      const steps = Array.from({ length: count }, () => ({ text: 'Start task', minutes: 10 }));
      const deps = setup({ async generate() { return { kind: 'ok', json: { steps } }; } });
      const result = await handleAssist(request('breakdown', { task: secretText, level: level.id }), deps);
      const valid = count >= level.min && count <= level.max;
      assert.equal(result.status, valid ? 200 : 502);
      assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: valid ? 1 : 0, released: valid ? 0 : 1 }); tests++;
    }
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
    [new Request('https://zen.test/api/assist/compile', { method: 'POST', headers: { Origin: 'https://zen.test', 'Content-Type': 'application/json', Authorization: 'Bearer test-token', 'CF-Connecting-IP': '192.0.2.1' }, body: '{' }), 400],
  ] as const) {
    const deps = setup(); const response = await handleAssist(req, deps); assert.equal(response.status, status);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(deps.entitlement.counts.reserved, 0); tests++;
  }
  const denied = setup(mockModel(), mockEntitlement(), 0);
  assert.equal((await handleAssist(request(), denied)).status, 429); tests++;
  for (const mode of ['invalid', 'refusal', 'timeout', 'throw'] as const) {
    const deps = setup(mockModel(mode)); const response = await handleAssist(request(), deps);
    assert.equal(response.status, mode === 'timeout' || mode === 'throw' ? 503 : 502);
    assert.deepEqual(await response.json(), { error: mode === 'timeout' || mode === 'throw' ? 'unavailable' : 'model_error' });
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 0, released: 1 }); tests++;
  }
  for (const options of [{ complete: false }, { throws: true }]) {
    const deps = setup(mockModel(), mockEntitlement(options)); const response = await handleAssist(request(), deps);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
    assert.deepEqual(deps.entitlement.counts, { reserved: 1, completed: 1, released: 1 }); tests++;
  }
  const quota = setup(mockModel(), mockEntitlement({ quota: false }));
  const quotaResponse = await handleAssist(request(), quota);
  assert.equal(quotaResponse.status, ASSIST_ERROR_STATUS.trial_exhausted);
  assert.deepEqual(await quotaResponse.json(), { error: 'trial_exhausted' }); assert.equal(quota.entitlement.counts.completed, 0); tests++;
  const badInput = await handleAssist(request('estimate', { task: '' }), setup());
  assert.equal(badInput.status, ASSIST_ERROR_STATUS.bad_request); assert.deepEqual(await badInput.json(), { error: 'bad_request' }); tests++;
  const controller = new AbortController();
  const abortModel: ModelClient = { async generate() { controller.abort(); return { kind: 'ok', json: { steps: ['Done'] } }; } };
  const aborted = setup(abortModel); assert.equal((await handleAssist(request('breakdown', inputs.breakdown, {}, 'POST', controller.signal), aborted)).status, 503);
  assert.equal(aborted.entitlement.counts.released, 1); tests++;
  assert.deepEqual(cleanAnswer('breakdown', { steps: [{ text: ' \u0000' + 'a'.repeat(400), minutes: 10 }], id: 'bad' }), { steps: [{ text: 'a'.repeat(200), minutes: 10 }] });
  assert.equal(cleanAnswer('breakdown', { steps: [] }), null);
  assert.deepEqual(cleanAnswer('compile', { clusters: [] }), { clusters: [] });
  for (const raw of [null, 'invalid JSON', {}, { clusters: null }]) assert.equal(cleanAnswer('compile', raw), null);
  const emptyCompile = setup({ async generate() { return { kind: 'ok', json: { clusters: [] } }; } });
  const emptyResponse = await handleAssist(request('compile', { text: 'Only feelings, no actions' }), emptyCompile);
  assert.equal(emptyResponse.status, 200); assert.deepEqual(await emptyResponse.json(), { clusters: [] });
  assert.deepEqual(emptyCompile.entitlement.counts, { reserved: 1, completed: 1, released: 0 }); tests++;
  const discardedTasks = setup({ async generate() { return { kind: 'ok', json: { clusters: [{ name: 'Tasks', tasks: [{ text: '', minutes: 10 }, { text: null }] }] } }; } });
  const discardedResponse = await handleAssist(request('compile', { text: secretText }), discardedTasks);
  assert.equal(discardedResponse.status, 502); assert.deepEqual(await discardedResponse.json(), { error: 'model_error' });
  assert.deepEqual(discardedTasks.entitlement.counts, { reserved: 1, completed: 0, released: 1 }); tests++;
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
    globalThis.fetch = async () => Response.json({ clusters: [] });
    assert.deepEqual(await cloud.compile('Only feelings, no actions'), { clusters: [] }); tests++;
    for (const [code, status] of Object.entries(ASSIST_ERROR_STATUS)) {
      globalThis.fetch = async () => Response.json({ error: code }, { status });
      await assert.rejects(cloud.breakdown('a', 'few', ''), (e: unknown) => e instanceof AssistError && e.code === code); tests++;
    }
    for (const response of [Response.json({ error: 'forbidden' }, { status: 403 }), Response.json({}, { status: 403 }), new Response('invalid JSON', { status: 403 })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(cloud.estimate('a'), (e: unknown) => e instanceof AssistError && e.code === 'bad_request'); tests++;
    }
    globalThis.fetch = async () => Response.json({ error: 'needs_plus' }, { status: 500 });
    await assert.rejects(cloud.estimate('a'), (e: unknown) => e instanceof AssistError && e.code === 'unavailable'); tests++;
    for (const stage of ['fetch', 'success-body', 'error-body'] as const) {
      const abort = new AbortController();
      const reason = new DOMException('Cancelled', 'AbortError');
      globalThis.fetch = async (_url, init) => {
        assert.equal(init?.signal, abort.signal);
        if (stage === 'fetch') { abort.abort(reason); throw reason; }
        const response = new Response('', { status: stage === 'success-body' ? 200 : 403 });
        response.json = async () => { abort.abort(reason); throw reason; };
        return response;
      };
      await assert.rejects(cloud.estimate('a', abort.signal), (e: unknown) => e === reason); tests++;
    }
    globalThis.fetch = async () => Response.json({ steps: [] });
    await assert.rejects(cloud.breakdown('a', 'few', ''), AssistError); tests++;
  } finally { globalThis.fetch = realFetch; }
  assert.equal((await onRequest({ request: request(), env: {} })).status, 503);
  assert.equal((await onRequest({ request: request(), env: { ANTHROPIC_API_KEY: 'fake-key', ASSIST_RATE_LIMITER: { async limit() { return { success: true }; } }, ASSIST_IP_RATE_LIMITER: { async limit() { return { success: true }; } } } })).status, 401); tests++;
  assert.equal(JSON.stringify(logged).includes(secretText), false);
  assert.equal(logged.length, 0); tests++;
} finally { Object.assign(console, originalConsole); }
console.log(`All ${tests} assist checks passed.`);
