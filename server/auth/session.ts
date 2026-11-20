import { randomToken, sha256 } from "./crypto.ts";
import { type Account, type PlusDatabase, unixTime } from "./db.ts";
import { HttpError } from "./http.ts";

const SESSION_SECONDS = 30 * 24 * 60 * 60;

function cookieName(origin: URL): string {
    return origin.protocol === "https:" ? "__Host-zen-plus" : "zen-plus-local";
}

function cookieToken(request: Request, origin: URL): string | null {
    const prefix = cookieName(origin) + "=";
    const raw = request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
    const token = raw?.slice(prefix.length);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(origin: URL, token = "", maxAge = 0): string {
    return `${cookieName(origin)}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict`
        + (origin.protocol === "https:" ? "; Secure" : "");
}

export async function createSession(db: PlusDatabase, account: Account, origin: URL) {
    const token = randomToken();
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO plus_sessions (id, account_id, cookie_hash, expires_at) VALUES (?, ?, ?, ?)")
        .bind(id, account.id, await sha256(token), unixTime() + SESSION_SECONDS).run();
    return { id, cookie: sessionCookie(origin, token, SESSION_SECONDS) };
}

export async function requireSession(db: PlusDatabase, request: Request, origin: URL) {
    const token = cookieToken(request, origin);
    const session = token ? await db.prepare(`
        SELECT a.id, a.email, a.stripe_customer, a.plus_until, s.id AS session_id
        FROM plus_sessions s JOIN plus_accounts a ON s.account_id = a.id
        WHERE s.cookie_hash = ? AND s.expires_at > ?
    `).bind(await sha256(token), unixTime()).first<Account & { session_id: string }>() : null;
    if (!session) throw new HttpError(401, "sign_in_required");
    return session;
}

export async function revokeSession(db: PlusDatabase, request: Request, origin: URL): Promise<void> {
    const token = cookieToken(request, origin);
    if (token) await db.prepare("DELETE FROM plus_sessions WHERE cookie_hash = ?").bind(await sha256(token)).run();
}
