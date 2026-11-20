const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function unbase64url(value: string): Uint8Array<ArrayBuffer> {
    if (!/^[\w-]+$/.test(value)) throw new Error("Invalid encoding");
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (base64url(bytes) !== value) throw new Error("Invalid encoding");
    return bytes;
}

export function randomToken(): string {
    return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(value: string): Promise<string> {
    return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
    if (!secret || encoder.encode(secret).length < 32) throw new Error("Missing or weak Plus signing key");
    return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmac(secret: string, value: string): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value)));
}

export async function verifyHmac(secret: string, value: string, signature: Uint8Array<ArrayBuffer>): Promise<boolean> {
    return crypto.subtle.verify("HMAC", await hmacKey(secret), signature, encoder.encode(value));
}

export const encodeJson = (value: unknown) => base64url(encoder.encode(JSON.stringify(value)));
export const decodeJson = (value: string): unknown => JSON.parse(decoder.decode(unbase64url(value)));
