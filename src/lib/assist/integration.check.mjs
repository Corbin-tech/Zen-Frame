import assert from 'node:assert/strict';
import { pickProvider } from './index.ts';
import { initAssistStore } from '../../stores/assistStore.ts';
import { exportBackup } from '../storage.ts';

const saved = new Map();
globalThis.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value)
};
assert.equal((await pickProvider()).status, 'needs-plus');
globalThis.window = {};
assert.equal((await pickProvider(true)).status, 'needs-plus');
let tokens = 0;
let refreshes = 0;
let requests = 0;
const plus = {
  account: null,
  async getToken() { tokens++; return 'fixture-token'; },
  async refresh() { refreshes++; }
};
let assist;
window.Alpine = { store: name => ({ plus, assist })[name] };
saved.set('assistConsent', '"true"');
assist = initAssistStore();
await assist.init();
assert.equal(assist.consent, false);
assert.equal(assist.aiStatus, 'needs-plus');
plus.account = { email: 'fixture@example.com' };
await assist.refresh();
assert.equal(assist.aiStatus, 'needs-consent');
assert.equal(tokens, 0);
assist.giveConsent();
await assist.refresh();
assert.equal(saved.get('assistConsent'), 'true');
assert.equal(assist.aiStatus, 'ready');
assert.equal(tokens, 0);
assert.equal('assistConsent' in JSON.parse(exportBackup()).data, false);
globalThis.fetch = async (url, options) => {
  requests++;
  assert.equal(url, '/api/assist/compile');
  assert.equal(options.headers.Authorization, 'Bearer fixture-token');
  return Response.json({ clusters: [] });
};
assert.deepEqual(await assist.run(p => p.compile('fixture')), { clusters: [] });
assert.equal(tokens, 1);
assert.equal(refreshes, 1);
globalThis.fetch = async () => Response.json({ error: 'trial_exhausted' }, { status: 403 });
assert.equal(await assist.run(p => p.compile('fixture')), null);
assert.equal(assist.error, "Plus isn't available yet. You can still edit the task by hand.");
assert.equal(refreshes, 1);
globalThis.fetch = async () => { throw new Error('offline'); };
assert.equal(await assist.run(p => p.compile('fixture')), null);
assert.equal(assist.error, "Couldn't make suggestions this time. Try again, or edit the task by hand.");
const stale = (await pickProvider(true)).provider;
assist.withdrawConsent();
await assist.refresh();
assert.equal(assist.aiStatus, 'needs-consent');
assert.equal(saved.get('assistConsent'), 'false');
const previousTokens = tokens;
await assert.rejects(() => stale.compile('fixture'), { code: 'unauthorized' });
assert.equal(tokens, previousTokens);
assert.equal(await assist.run(p => p.compile('fixture')), null);
assert.equal(tokens, previousTokens);
assert.equal(requests, 1);
assist.giveConsent();
await assist.refresh();
plus.account = null;
await assist.refresh();
assert.equal(assist.aiStatus, 'needs-plus');
await assert.rejects(() => stale.compile('fixture'), { code: 'unauthorized' });
assert.equal(tokens, previousTokens);
console.log('Assist integration checks passed (status, consent, async token, allowance, errors, backup exclusion).');
