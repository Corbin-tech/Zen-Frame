import type { RateLimiter } from './ports.ts';

export const ASSIST_RATE_LIMIT = 10;
export const ASSIST_RATE_WINDOW_SECONDS = 60;

interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
}
export interface AssistDatabase { prepare(sql: string): Statement }

export function createD1RateLimiter(db: AssistDatabase, now = Date.now): RateLimiter {
  return { async limit(accountId) {
    const window = Math.floor(now() / (ASSIST_RATE_WINDOW_SECONDS * 1000));
    const row = await db.prepare(`
      INSERT INTO assist_rate_limits (account_id, window, count) VALUES (?, ?, 1)
      ON CONFLICT (account_id) DO UPDATE SET
        count = CASE WHEN assist_rate_limits.window < excluded.window THEN 1
          ELSE MIN(assist_rate_limits.count + 1, ?) END,
        window = excluded.window
      WHERE excluded.window >= assist_rate_limits.window
      RETURNING count
    `).bind(accountId, window, ASSIST_RATE_LIMIT + 1).first<{ count: number }>();
    if (!row) return false;
    if (!Number.isInteger(row.count) || row.count < 1) throw new Error('unavailable');
    return row.count <= ASSIST_RATE_LIMIT;
  } };
}
