import { COMPILE_SCHEMA } from '../../src/lib/assist/api.ts';
import type { EntitlementGate, ModelClient, RateLimiter } from './ports.ts';
export function mockModel(mode: 'ok' | 'invalid' | 'refusal' | 'timeout' | 'throw' = 'ok'): ModelClient {
  return { async generate({ schema }) {
    if (mode === 'throw') throw new Error('model unavailable');
    if (mode === 'refusal' || mode === 'timeout') return { kind: mode };
    if (mode === 'invalid') return { kind: 'ok', json: 'not JSON' };
    const json = schema === COMPILE_SCHEMA ? { clusters: [{ name: 'Tasks', tasks: [{ text: 'Start the task', minutes: 10 }] }] } : 'steps' in (schema as { properties: object }).properties ? { steps: [{ text: 'Start the task', minutes: 10 }] } : { minutes: 10, low: 5, high: 15 };
    return { kind: 'ok', json };
  } };
}
export function mockEntitlement(options: { quota?: boolean; complete?: boolean; throws?: boolean } = {}) {
  const counts = { reserved: 0, completed: 0, released: 0 };
  const gate: EntitlementGate = {
    async authenticate(token) { return token === 'test-token' ? { accountId: 'test-account', sessionId: 'test-session' } : null; },
    async reserve() {
      if (options.quota === false) return null;
      counts.reserved++;
      return { async complete() { counts.completed++; if (options.throws) throw new Error('unavailable'); return options.complete !== false; }, async release() { counts.released++; } };
    },
  };
  return { ...gate, counts };
}
export function memoryRateLimiter(max = 10, windowMs = 60_000): RateLimiter {
  const entries = new Map<string, { start: number; count: number }>();
  return { limit(key) {
    const now = Date.now();
    for (const [id, entry] of entries) if (now - entry.start >= windowMs) entries.delete(id);
    const entry = entries.get(key) ?? { start: now, count: 0 };
    entries.set(key, entry); return ++entry.count <= max;
  } };
}
