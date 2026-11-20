import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks, stripTypeScriptTypes } from 'node:module';

const storeUrl = new URL('./plusStore.ts', import.meta.url);
const hooks = registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === '../lib/dates' && context.parentURL === storeUrl.href
            ? new URL('../lib/dates.ts', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return url === storeUrl.href
            ? { format: 'module', source: stripTypeScriptTypes(readFileSync(storeUrl, 'utf8'), { mode: 'transform' }), shortCircuit: true }
            : next(url, context);
    }
});
let initPlusStore;
try { ({ initPlusStore } = await import(storeUrl.href)); }
finally { hooks.deregister(); }

const unavailable = 'Zen Frame Plus is unavailable right now. Try again in a moment.';
const store = initPlusStore();
let requests = 0;
let respond;
globalThis.fetch = (url, options) => {
    assert.equal(url, '/api/assist/account/session');
    assert.equal(options.credentials, 'same-origin');
    requests++;
    return new Promise(resolve => { respond = resolve; });
};
const refresh = store.refresh();
assert.equal(store.refreshing, true);
respond(new Response('Not found', { status: 404 }));
assert.equal(await refresh, false);
assert.equal(store.ready, false);
assert.equal(store.refreshing, false);
assert.equal(store.error, unavailable);

for (const status of [404, 503]) {
    const before = requests;
    const retry = store.refresh();
    const repeat = store.refresh();
    assert.equal(requests, before + 1);
    assert.equal(store.refreshing, true);
    assert.equal(store.error, unavailable);
    respond(new Response('Still unavailable', { status }));
    assert.deepEqual(await Promise.all([retry, repeat]), [false, false]);
    assert.equal(store.refreshing, false);
    assert.equal(store.error, unavailable);
    assert.equal(store.ready, false);
}

globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal(await store.refresh(), false);
assert.equal(store.error, unavailable);
assert.equal(store.refreshing, false);

globalThis.fetch = async () => Response.json({ error: 'sign_in_required' }, { status: 401 });
assert.equal(await store.refresh(), false);
assert.equal(store.ready, true);
assert.equal(store.account, null);
assert.equal(store.error, '');
assert.equal(store.refreshing, false);

const session = { email: 'fixture@example.com', tier: 'trial', trialRemaining: 20, billingAvailable: false,
    token: 'fixture-token', expiresAt: Date.now() / 1000 + 300 };
store.error = unavailable;
globalThis.fetch = async () => Response.json(session);
assert.equal(await store.refresh(), true);
assert.equal(store.error, '');
assert.equal(store.refreshing, false);
assert.equal(store.account.email, session.email);
assert.equal(await store.getToken(), 'fixture-token');
console.log('Plus store checks passed (404/503/offline retries, preserved error, single-flight, 401 sign-in, successful recovery).');
