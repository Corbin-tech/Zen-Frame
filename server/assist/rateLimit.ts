import type { RateLimiter } from './ports.ts';

export const ASSIST_RATE_LIMIT = 10;
export const ASSIST_IP_RATE_LIMIT = 60;
export const ASSIST_RATE_WINDOW_SECONDS = 60;
export type RateLimitScope = 'account' | 'ip';

export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return 'ip:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
}
export interface AssistDatabase { prepare(sql: string): Statement }

export function createD1RateLimiter(db: AssistDatabase, now = Date.now, scope: RateLimitScope = 'account'): RateLimiter {
  const table = scope === 'ip' ? 'assist_ip_rate_limits' : 'assist_rate_limits';
  const column = scope === 'ip' ? 'ip_hash' : 'account_id';
  const limit = scope === 'ip' ? ASSIST_IP_RATE_LIMIT : ASSIST_RATE_LIMIT;
  return { async limit(key) {
    const window = Math.floor(now() / (ASSIST_RATE_WINDOW_SECONDS * 1000));
    const row = await db.prepare(`
      INSERT INTO ${table} (${column}, window, count) VALUES (?, ?, 1)
      ON CONFLICT (${column}) DO UPDATE SET
        count = CASE WHEN ${table}.window < excluded.window THEN 1
          ELSE MIN(${table}.count + 1, ?) END,
        window = excluded.window
      WHERE excluded.window >= ${table}.window
      RETURNING count
    `).bind(key, window, limit + 1).first<{ count: number }>();
    if (!row) return false;
    if (!Number.isInteger(row.count) || row.count < 1) throw new Error('unavailable');
    return row.count <= limit;
  } };
}
