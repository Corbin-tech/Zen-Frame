export interface OriginEnv {
    PLUS_ORIGIN: string;
}

export class HttpError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string) {
        super(code);
        this.status = status;
        this.code = code;
    }
}

export function appOrigin(request: Request, env: OriginEnv): URL {
    const origin = new URL(env.PLUS_ORIGIN);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if (origin.href !== origin.origin + "/" || (origin.protocol !== "https:" && !(isLoopback && origin.protocol === "http:"))) {
        throw new Error("Invalid Plus origin");
    }
    if (new URL(request.url).origin !== origin.origin) throw new HttpError(403, "origin_not_allowed");
    return origin;
}

export function requireSameOrigin(request: Request, origin: URL) {
    if (request.headers.get("Origin") !== origin.origin) throw new HttpError(403, "origin_not_allowed");
}

export async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
    const length = Number(request.headers.get("Content-Length"));
    if (length > limit) throw new HttpError(413, "body_too_large");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "invalid_request");
    const bytes = new Uint8Array(limit);
    let size = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (size + value.length > limit) {
                await reader.cancel();
                throw new HttpError(413, "body_too_large");
            }
            bytes.set(value, size);
            size += value.length;
        }
    } finally {
        reader.releaseLock();
    }
    return bytes.subarray(0, size);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        throw new HttpError(415, "json_required");
    }
    const bytes = await readBody(request, 2048);
    let body: unknown;
    try {
        body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
        throw new HttpError(400, "invalid_request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_request");
    return body as Record<string, unknown>;
}

export function json(body: unknown, status = 200, headers?: HeadersInit) {
    const response = Response.json(body, { status, headers });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
}

export function handlePost(request: Request, run: () => Promise<Response>): Promise<Response> {
    if (request.method !== "POST") return Promise.resolve(json({ error: "method_not_allowed" }, 405, { Allow: "POST" }));
    return run().catch((error: unknown) => error instanceof HttpError
        ? json({ error: error.code }, error.status)
        : json({ error: "plus_unavailable" }, 503));
}
