import { DETAIL_LEVELS, PROMPTS, SANITIZERS, SCHEMAS, cleanText } from './contract.ts';
import type { Endpoint } from './contract.ts';
import type { EntitlementGate, ModelClient, RateLimiter } from './ports.ts';
export const BODY_LIMIT = 32_768;
export const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (status: number, error: string) => jsonResponse(status, { error });
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > BODY_LIMIT) { await reader.cancel(); return null; } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}
function inputFor(endpoint: Endpoint, value: unknown): { input?: unknown; tooLong?: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  if (endpoint === 'estimate') {
    if (!Array.isArray(v.tasks) || !v.tasks.length || v.tasks.length > 50 || !v.tasks.every(t => typeof t === 'string')) return {};
    if (v.tasks.reduce((sum, t) => sum + t.length, 0) > 6000) return { tooLong: true };
    const tasks = v.tasks.map(t => cleanText(t, 6000));
    return tasks.every(Boolean) ? { input: { tasks } } : {};
  }
  const text = endpoint === 'breakdown' ? v.task : v.text;
  if (typeof text !== 'string') return {};
  if (text.length > 6000) return { tooLong: true };
  const clean = cleanText(text, 6000); if (!clean) return {};
  if (endpoint === 'compile') return { input: { text: clean } };
  return DETAIL_LEVELS.includes(v.detailLevel as typeof DETAIL_LEVELS[number]) ? { input: { task: clean, detailLevel: v.detailLevel } } : {};
}
export async function handleAssist(request: Request, deps: { model: ModelClient; entitlement: EntitlementGate; rateLimit: RateLimiter }): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/api\/assist\/(breakdown|compile|estimate)$/.exec(url.pathname);
  if (!match) return fail(404, 'not_found');
  if (request.method !== 'POST') return fail(405, 'method_not_allowed');
  if (request.headers.get('origin') !== url.origin || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) return fail(403, 'forbidden');
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail(415, 'unsupported_media_type');
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return fail(401, 'unauthorized');
  try {
    const identity = await deps.entitlement.authenticate(token);
    if (!identity) return fail(401, 'unauthorized');
    if (!await deps.rateLimit.limit(identity.accountId)) return fail(429, 'rate_limited');
    let raw: unknown;
    try { const body = await readBody(request); if (body === null) return fail(413, 'too_long'); raw = JSON.parse(body); } catch { return fail(400, 'invalid_input'); }
    const endpoint = match[1] as Endpoint;
    const parsed = inputFor(endpoint, raw);
    if (parsed.tooLong) return fail(413, 'too_long');
    if (!parsed.input) return fail(400, 'invalid_input');
    if (request.signal.aborted) return fail(503, 'unavailable');
    const reservation = await deps.entitlement.reserve(identity);
    if (!reservation) return fail(402, 'quota_exhausted');
    let completed = false;
    try {
      const result = await deps.model.generate({ system: PROMPTS[endpoint], user: JSON.stringify(parsed.input), schema: SCHEMAS[endpoint], maxTokens: 4096, signal: request.signal });
      if (request.signal.aborted) return fail(503, 'unavailable');
      if (result.kind !== 'ok') return fail(result.kind === 'timeout' ? 504 : 502, 'unavailable');
      const clean = SANITIZERS[endpoint](result.json);
      if (!clean || (endpoint === 'estimate' && 'tasks' in clean && clean.tasks.length !== (parsed.input as { tasks: string[] }).tasks.length)) return fail(502, 'invalid_answer');
      completed = await reservation.complete();
      if (!completed) return fail(503, 'unavailable');
      return jsonResponse(200, clean);
    } finally { if (!completed) await reservation.release(); }
  } catch { return fail(503, 'unavailable'); }
}
