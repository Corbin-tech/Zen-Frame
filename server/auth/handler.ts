import { base64url, hmac } from "./crypto.ts";
import { type Account, type EntitlementEnv, unixTime } from "./db.ts";
import { type EmailEnv, sendEmail } from "./email.ts";
import { issueEntitlement } from "./entitlement.ts";
import { appOrigin, handlePost, HttpError, json, type OriginEnv, readJson, requireSameOrigin } from "./http.ts";
import { createSession, requireSession, revokeSession, sessionCookie } from "./session.ts";

export type AccountEnv = EntitlementEnv & EmailEnv & OriginEnv;
type Mailer = (to: string, code: string) => Promise<void>;

const CODE_SECONDS = 600;
const CODE_ATTEMPTS = 5;

function normalizeEmail(raw: unknown): string {
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)) {
        throw new HttpError(400, "invalid_email");
    }
    return email;
}

function makeCode(): string {
    const value = new Uint32Array(1);
    do { crypto.getRandomValues(value); } while (value[0] >= 4_294_000_000);
    return (value[0] % 1_000_000).toString().padStart(6, "0");
}

async function codeDigest(secret: string, email: string, challenge: string, code: string): Promise<string> {
    return base64url(await hmac(secret, `zen-frame/sign-in-code/v1:\n${email}\n${challenge}\n${code}`));
}

async function rateLimit(env: AccountEnv, request: Request, email: string, stage: "send" | "verify", now: number) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = stage === "send" ? { email: 4, ip: 20 } : { email: 20, ip: 100 };
    const window = Math.floor(now / 3600);
    const buckets = await Promise.all(Object.entries({ email, ip }).map(async ([kind, value]) => {
        const bucket = base64url(await hmac(env.PLUS_SIGNING_KEY, `zen-frame/auth-limit/v1:${stage}:${kind}:${value}`));
        const hit = await env.PLUS_DB.prepare(`
            INSERT INTO plus_auth_limits (bucket, window, hits) VALUES (?1, ?2, 1)
            ON CONFLICT(bucket) DO UPDATE SET window = ?2, hits = CASE WHEN window < ?2 THEN 1 ELSE hits + 1 END
            WHERE window < ?2 OR hits < ?3
            RETURNING hits
        `).bind(bucket, window, limit[kind as "email" | "ip"]).first();
        return Boolean(hit);
    }));
    if (buckets.includes(false)) throw new HttpError(429, "try_again_later");
}

export function handleAccount(request: Request, action: string, env: AccountEnv, mailer: Mailer = (to, code) => sendEmail(env, to, code)) {
    return handlePost(request, "account", async () => {
        const origin = appOrigin(request, env);
        requireSameOrigin(request, origin);
        const db = env.PLUS_DB;
        const now = unixTime();

        switch (action) {
            case "code": {
                const { email: raw } = await readJson(request);
                const email = normalizeEmail(raw);
                await rateLimit(env, request, email, "send", now);
                const code = makeCode();
                const challenge = crypto.randomUUID();
                const digest = await codeDigest(env.PLUS_SIGNING_KEY, email, challenge, code);
                const saved = await db.prepare(`
                    INSERT INTO plus_codes (email, challenge, digest, sent_at, expires_at, attempts)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                    ON CONFLICT (email) DO UPDATE SET challenge = ?2, digest = ?3, sent_at = ?4, expires_at = ?5, attempts = ?6
                    WHERE sent_at <= ?4 - 60
                    RETURNING challenge
                `).bind(email, challenge, digest, now, now + CODE_SECONDS, CODE_ATTEMPTS).first();
                if (!saved) throw new HttpError(429, "try_again_later");
                try {
                    await mailer(email, code);
                } catch {
                    await db.prepare("DELETE FROM plus_codes WHERE email = ? AND challenge = ?").bind(email, challenge).run();
                    throw new HttpError(503, "email_unavailable");
                }
                return json({ challenge });
            }
            case "verify": {
                const { email: raw, challenge, code } = await readJson(request);
                const email = normalizeEmail(raw);
                if (typeof challenge !== "string" || !/^[0-9a-f-]{36}$/.test(challenge)
                    || typeof code !== "string" || !/^\d{6}$/.test(code)) throw new HttpError(400, "invalid_code");
                await rateLimit(env, request, email, "verify", now);
                const digest = await codeDigest(env.PLUS_SIGNING_KEY, email, challenge, code);
                const attempt = await db.prepare(`
                    UPDATE plus_codes SET attempts = CASE WHEN digest = ?3 THEN 0 ELSE attempts - 1 END
                    WHERE email = ?1 AND challenge = ?2 AND expires_at > ?4 AND attempts > 0
                    RETURNING digest = ?3 AS verified
                `).bind(email, challenge, digest, now).first<{ verified: number }>();
                if (!attempt?.verified) throw new HttpError(401, "invalid_code");
                await db.prepare("DELETE FROM plus_codes WHERE email = ? AND challenge = ?").bind(email, challenge).run();
                const account = await db.prepare(`
                    INSERT INTO plus_accounts (id, email) VALUES (?, ?)
                    ON CONFLICT(email) DO UPDATE SET email = excluded.email
                    RETURNING id, email, stripe_customer, plus_until
                `).bind(crypto.randomUUID(), email).first<Account>();
                if (!account) throw new Error("Account not created");
                await revokeSession(db, request, origin);
                const session = await createSession(db, account, origin);
                return json(await issueEntitlement(env, account, session.id), 200, { "Set-Cookie": session.cookie });
            }
            case "session": {
                const account = await requireSession(db, request, origin);
                return json(await issueEntitlement(env, account, account.session_id));
            }
            case "logout":
                await revokeSession(db, request, origin);
                return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(origin) });
            default:
                throw new HttpError(404, "not_found");
        }
    });
}
