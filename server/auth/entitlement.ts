import { base64url, decodeJson, encodeJson, hmac, unbase64url, verifyHmac } from "./crypto.ts";
import { type Account, type EntitlementEnv, unixTime } from "./db.ts";

export type { EntitlementEnv } from "./db.ts";

const TRIAL_LIMIT = 20;
const MONTHLY_LIMIT = 1000;
const TOKEN_SECONDS = 5 * 60;
const HOLD_SECONDS = 120;
const TRIAL_PERIOD = "trial";
const TOKEN_CONTEXT = "zen-frame/assist-entitlement/v1:";

export type Identity = { accountId: string; sessionId: string };
export type Reservation = { complete(): Promise<boolean>; release(): Promise<void> };

type Allowance =
    | { tier: "plus"; plusUntil: number; monthlyRemaining: number }
    | { tier: "trial"; trialRemaining: number };

type Claims = Identity & Allowance & { exp: number };

function monthKey(now: number): string {
    return new Date(now * 1000).toISOString().slice(0, 7);
}

export async function issueEntitlement(env: EntitlementEnv, account: Account, sessionId: string, now = unixTime()) {
    const plus = account.plus_until > now;
    const usage = await env.PLUS_DB.prepare("SELECT used FROM plus_usage WHERE account_id = ? AND period = ?")
        .bind(account.id, plus ? monthKey(now) : TRIAL_PERIOD).first<{ used: number }>();
    const used = usage?.used ?? 0;
    const allowance: Allowance = plus
        ? { tier: "plus", plusUntil: account.plus_until, monthlyRemaining: Math.max(0, MONTHLY_LIMIT - used) }
        : { tier: "trial", trialRemaining: Math.max(0, TRIAL_LIMIT - used) };
    const claims: Claims = {
        accountId: account.id,
        sessionId,
        exp: plus ? Math.min(now + TOKEN_SECONDS, account.plus_until) : now + TOKEN_SECONDS,
        ...allowance
    };
    const payload = encodeJson(claims);
    const signature = base64url(await hmac(env.PLUS_SIGNING_KEY, TOKEN_CONTEXT + payload));
    return {
        token: payload + "." + signature,
        expiresAt: claims.exp,
        email: account.email,
        billingAvailable: account.stripe_customer !== null,
        ...allowance
    };
}

export function createEntitlementService(env: EntitlementEnv, clock = unixTime) {
    const db = env.PLUS_DB;
    return {
        async authenticate(token: string): Promise<Identity | null> {
            if (!token || token.length > 2048) return null;
            const parts = token.split(".");
            if (parts.length !== 2) return null;
            const [payload, signature] = parts;

            let claims: Claims;
            let signatureBytes: Uint8Array<ArrayBuffer>;
            try {
                signatureBytes = unbase64url(signature);
                claims = decodeJson(payload) as Claims;
            } catch {
                return null;
            }
            const now = clock();
            if (!claims || typeof claims.accountId !== "string" || typeof claims.sessionId !== "string"
                || !Number.isSafeInteger(claims.exp) || claims.exp <= now || claims.exp > now + TOKEN_SECONDS
                || signatureBytes.length !== 32
                || !await verifyHmac(env.PLUS_SIGNING_KEY, TOKEN_CONTEXT + payload, signatureBytes)) return null;
            const session = await db.prepare(
                "SELECT id FROM plus_sessions WHERE id = ? AND account_id = ? AND expires_at > ?"
            ).bind(claims.sessionId, claims.accountId, now).first();
            return session ? { accountId: claims.accountId, sessionId: claims.sessionId } : null;
        },

        async reserve(identity: Identity): Promise<Reservation | null> {
            const now = clock();
            const id = crypto.randomUUID();
            await db.prepare("DELETE FROM plus_usage_holds WHERE account_id = ? AND expires_at <= ?")
                .bind(identity.accountId, now).run();

            // The signed allowance is informational. D1 chooses the current meter and atomically checks
            // both completed answers and in-flight reservations before granting another request.
            const held = await db.prepare(`
                WITH allowance AS (
                    SELECT a.id,
                        CASE WHEN a.plus_until > ?1 THEN ?2 ELSE ?3 END AS period,
                        CASE WHEN a.plus_until > ?1 THEN ?4 ELSE ?5 END AS quota
                    FROM plus_accounts a JOIN plus_sessions s ON s.account_id = a.id
                    WHERE a.id = ?6 AND s.id = ?7 AND s.expires_at > ?1
                )
                INSERT INTO plus_usage_holds (id, account_id, period, expires_at)
                SELECT ?8, a.id, a.period, ?9 FROM allowance a
                WHERE COALESCE((SELECT used FROM plus_usage WHERE account_id = a.id AND period = a.period), 0)
                    + (SELECT COUNT(*) FROM plus_usage_holds WHERE account_id = a.id AND period = a.period AND expires_at > ?1)
                    < a.quota
                RETURNING id
            `).bind(now, monthKey(now), TRIAL_PERIOD, MONTHLY_LIMIT, TRIAL_LIMIT,
                identity.accountId, identity.sessionId, id, now + HOLD_SECONDS).first();
            if (!held) return null;

            return {
                async complete() {
                    const changed = await db.prepare(`
                        UPDATE plus_usage_holds SET completed = 1 WHERE id = ?1 AND expires_at > ?2
                        AND EXISTS (
                            SELECT 1 FROM plus_sessions WHERE id = ?3 AND account_id = ?4 AND expires_at > ?2
                        )
                        RETURNING id
                    `).bind(id, clock(), identity.sessionId, identity.accountId).first();
                    return changed !== null;
                },
                async release() {
                    await db.prepare("DELETE FROM plus_usage_holds WHERE id = ?").bind(id).run();
                }
            };
        }
    };
}
