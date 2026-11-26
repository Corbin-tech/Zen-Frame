import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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

// Consent belongs to the account that gave it
assert.equal(assist.consent, true); // Plus has not confirmed a sign-out yet (ready is unset)
plus.account = { email: 'other@example.com' };
await assist.refresh();
assert.equal(assist.consent, false);
assert.equal(saved.get('assistConsent'), 'false');
assert.equal(assist.aiStatus, 'needs-consent');
plus.account = { email: 'fixture@example.com' };
assist.giveConsent();
await assist.refresh();
plus.account = null;
plus.ready = true; // Plus confirmed that nobody is signed in
await assist.refresh();
assert.equal(assist.consent, false);
assert.equal(saved.get('assistConsent'), 'false');
saved.set('assistConsent', 'true');
const reloaded = initAssistStore();
assert.equal(reloaded.consent, true);
plus.account = { email: 'fixture@example.com' };
await reloaded.refresh(); // The saved consent is adopted by the account signed in at load
assert.equal(reloaded.consent, true);
plus.account = { email: 'other@example.com' };
await reloaded.refresh();
assert.equal(reloaded.consent, false);
assert.equal(saved.get('assistConsent'), 'false');
plus.account = { email: 'fixture@example.com' };
assist.giveConsent();
saved.set('assistConsent', 'false'); // Another tab signed out
await assist.refresh();
assert.equal(assist.consent, false);
saved.set('assistConsent', 'true');
const outage = initAssistStore(); // Loaded while the Plus session check failed
plus.account = null;
plus.ready = false;
await outage.refresh();
assert.equal(outage.consent, true);
saved.set('assistConsent', 'false'); // Meanwhile another tab: A signs out, B signs in
plus.account = { email: 'other@example.com' };
await outage.refresh();
assert.equal(outage.consent, false);
plus.ready = true;
plus.account = { email: 'fixture@example.com' };
assist.giveConsent();
await assist.refresh();
const gated = (await pickProvider(true)).provider;
plus.account = { email: 'other@example.com' }; // Account switch, no refresh yet
const tokensBeforeSwitch = tokens;
await assert.rejects(() => gated.compile('fixture'), { code: 'unauthorized' });
assert.equal(tokens, tokensBeforeSwitch);
assert.equal(assist.consent, false);
delete plus.ready;
plus.account = { email: 'fixture@example.com' };
assist.giveConsent();

const panelUrl = new URL('../../scripts/BreakdownPanel.ts', import.meta.url);
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === '../lib/assist' && context.parentURL === panelUrl.href
    ? new URL('./index.ts', import.meta.url).href : specifier, context);
} });
let registerBreakdownPanel;
try { ({ registerBreakdownPanel } = await import(panelUrl.href)); }
finally { hooks.deregister(); }
let panelFactory;
window.Alpine.data = (name, factory) => {
  assert.equal(name, 'breakdownPanel');
  panelFactory = factory;
};
registerBreakdownPanel();
const task = { id: 'fixture', todo: 'Fixture task', parentId: null, steps: [{ text: 'Existing step', minutes: 1 }] };
let writes = 0;
const stores = { plus, assist, todos: {
  find: () => task, clusterName: () => '', setSteps: () => { writes++; }
} };
window.Alpine.store = name => stores[name];
plus.account = { email: 'fixture@example.com' };
await assist.refresh();
const answer = { steps: Array.from({ length: 4 }, (_, i) => ({ text: `Step ${i + 1}`, minutes: 1 })) };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
for (const mode of ['success', 'error', 'abort', 'late-response']) {
  const started = deferred();
  const late = deferred();
  let fetchSignal;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/assist/breakdown');
    fetchSignal = options.signal;
    assert.ok(fetchSignal instanceof AbortSignal);
    started.resolve();
    if (mode === 'abort') await new Promise((_, reject) => {
      fetchSignal.addEventListener('abort', () => reject(fetchSignal.reason), { once: true });
    });
    if (mode === 'late-response') await late.promise;
    return mode === 'error' ? Response.json({ error: 'model_error' }, { status: 502 }) : Response.json(answer);
  };
  const focus = () => {};
  const panel = Object.assign(panelFactory(() => task.id, () => undefined), {
    $dispatch() {}, $nextTick: fn => fn(),
    $refs: { level: { focus }, cancel: { focus }, generate: { focus }, add: { focus } },
    $root: { querySelector: () => ({ focus }) }
  });
  panel.show();
  const beforeRefresh = refreshes;
  const running = panel.generate();
  await started.promise;
  assert.equal(panel.working, true);
  assert.equal(assist.busy, true);
  if (mode === 'abort' || mode === 'late-response') {
    panel.cancel();
    assert.equal(fetchSignal.aborted, true);
  }
  let timeout;
  try {
    await Promise.race([running, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Breakdown busy state did not settle')), 1000);
    })]);
  } finally { clearTimeout(timeout); }
  assert.equal(panel.working, false);
  assert.equal(assist.busy, false);
  assert.equal(assist.preview, null);
  assert.equal(writes, 0);
  assert.deepEqual(task.steps, [{ text: 'Existing step', minutes: 1 }]);
  if (mode === 'success') {
    assert.equal(panel.editing, true);
    assert.equal(panel.draft.length, 4);
    assert.equal(refreshes, beforeRefresh + 1);
    // Withdrawing consent: Accept cannot save the draft, and the panel discards it
    assist.withdrawConsent();
    await assist.refresh();
    panel.accept();
    assert.equal(writes, 0);
    assert.deepEqual(task.steps, [{ text: 'Existing step', minutes: 1 }]);
    const watchers = {};
    panel.$watch = (key, callback) => { watchers[key] = callback; };
    panel.$root.contains = () => false;
    panel.init();
    globalThis.document = { activeElement: null };
    watchers.plusReady(panel.plusReady);
    delete globalThis.document;
    assert.equal(panel.open, false);
    assert.equal(panel.editing, false);
    assert.deepEqual(panel.draft, []);
    assert.equal(panel.announcement, 'Task helpers are off. The suggestion was discarded.');
    assist.giveConsent();
    await assist.refresh();
  } else {
    assert.equal(panel.editing, false);
    assert.deepEqual(panel.draft, []);
    assert.equal(refreshes, beforeRefresh);
    assert.equal(Boolean(panel.error), mode === 'error');
  }
  late.resolve();
  await new Promise(resolve => setImmediate(resolve));
  if (mode === 'late-response') {
    assert.deepEqual(panel.draft, []);
    assert.equal(panel.editing, false);
    assert.equal(panel.announcement, 'Step suggestions canceled.');
    assert.equal(assist.preview, null);
    assert.equal(writes, 0);
  }
}
stores.todos.setEstimate = () => { writes++; };
stores.todos.createCluster = () => { writes++; return 'new-cluster'; };
stores.todos.addTodo = () => { writes++; };
for (const preview of [
  { kind: 'breakdown', taskId: task.id, steps: answer.steps },
  { kind: 'estimate', taskId: task.id, result: { minutes: 20, low: 10, high: 30 } },
  { kind: 'compile', clusters: [{ name: 'Home', tasks: [{ text: 'Open the notes', minutes: 5 }] }] }
]) {
  assist.withdrawConsent();
  await assist.refresh();
  const beforeWrites = writes;
  assist.preview = preview; // A stale caller restores a preview after consent was cleared
  assist.accept();
  assert.equal(writes, beforeWrites);
  assert.equal(assist.preview, preview);
  assist.giveConsent();
  await assist.refresh();
  assist.accept();
  assert.equal(writes, beforeWrites + (preview.kind === 'compile' ? 2 : 1));
  assert.equal(assist.preview, null);
  assist.accept(); // No preview is a no-op even with consent
  assert.equal(writes, beforeWrites + (preview.kind === 'compile' ? 2 : 1));
}
console.log('Assist integration checks passed (status, consent, async token, allowance, errors, backup exclusion, Breakdown cancel/late response, consent-gated acceptance).');
