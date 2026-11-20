import { detailLevel } from '../../src/lib/assist/types.ts';
import { ASSIST_ERROR_STATUS, MAX_INPUT_CHARS, breakdownSchema, COMPILE_SCHEMA, ESTIMATE_SCHEMA } from '../../src/lib/assist/api.ts';
import { SYSTEM_PROMPT, breakdownPrompt, compilePrompt, estimatePrompt } from '../../src/lib/assist/prompts.ts';
import { cleanBreakdownRequest, cleanCompileRequest, cleanEstimateRequest } from '../../src/lib/assist/sanitize.ts';
import type { AssistErrorCode, AssistRequestMap } from '../../src/lib/assist/api.ts';
import { cleanAnswer } from './validation.ts';
import type { Endpoint } from './validation.ts';
import type { EntitlementGate, ModelClient, RateLimiter } from './ports.ts';
export const BODY_LIMIT = 32_768;
export const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const fail = (error: AssistErrorCode) => jsonResponse(ASSIST_ERROR_STATUS[error], { error });
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
const cleanInputText = (value: string): string | null => value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '').trim() || null;
function inputFor(endpoint: Endpoint, value: unknown): { input?: AssistRequestMap[Endpoint]; tooLong?: boolean } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const v = value as Record<string, unknown>;
  const text = endpoint === 'compile' ? v.text : v.task;
  if (typeof text !== 'string') return {};
  if (text.length + (endpoint === 'breakdown' && typeof v.context === 'string' ? v.context.length : 0) > MAX_INPUT_CHARS) return { tooLong: true };
  const clean = cleanInputText(text); if (!clean) return {};
  if (endpoint === 'compile') return cleanCompileRequest(value) ? { input: { text: clean } } : {};
  if (endpoint === 'estimate') return cleanEstimateRequest(value) ? { input: { task: clean } } : {};
  const parsed = cleanBreakdownRequest(value);
  return parsed ? { input: { ...parsed, task: clean, ...(typeof v.context === 'string' ? { context: cleanInputText(v.context) ?? '' } : {}) } } : {};
}
function modelInput(endpoint: Endpoint, input: AssistRequestMap[Endpoint]) {
  if (endpoint === 'compile') return { user: compilePrompt((input as AssistRequestMap['compile']).text), schema: COMPILE_SCHEMA };
  if (endpoint === 'estimate') return { user: estimatePrompt((input as AssistRequestMap['estimate']).task), schema: ESTIMATE_SCHEMA };
  const { task, level, context } = input as AssistRequestMap['breakdown'];
  return { user: breakdownPrompt(task, detailLevel(level), context ?? ''), schema: breakdownSchema(detailLevel(level)) };
}
export async function handleAssist(request: Request, deps: { model: ModelClient; entitlement: EntitlementGate; rateLimit: RateLimiter }): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/api\/assist\/(breakdown|compile|estimate)$/.exec(url.pathname);
  if (!match) return jsonResponse(404, { error: 'not_found' });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' });
  if (request.headers.get('origin') !== url.origin || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) return jsonResponse(403, { error: 'forbidden' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return jsonResponse(415, { error: 'unsupported_media_type' });
  const token = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return fail('unauthorized');
  try {
    const identity = await deps.entitlement.authenticate(token);
    if (!identity) return fail('unauthorized');
    if (!await deps.rateLimit.limit(identity.accountId)) return fail('rate_limited');
    let raw: unknown;
    try { const body = await readBody(request); if (body === null) return fail('too_long'); raw = JSON.parse(body); } catch { return fail('bad_request'); }
    const endpoint = match[1] as Endpoint;
    const parsed = inputFor(endpoint, raw);
    if (parsed.tooLong) return fail('too_long');
    if (!parsed.input) return fail('bad_request');
    if (request.signal.aborted) return fail('unavailable');
    const reservation = await deps.entitlement.reserve(identity);
    if (!reservation) return fail('trial_exhausted');
    let completed = false;
    try {
      const result = await deps.model.generate({ system: SYSTEM_PROMPT, ...modelInput(endpoint, parsed.input), maxTokens: 4096, signal: request.signal });
      if (request.signal.aborted) return fail('unavailable');
      if (result.kind !== 'ok') return fail(result.kind === 'timeout' ? 'unavailable' : 'model_error');
      const clean = cleanAnswer(endpoint, result.json, endpoint === 'breakdown' ? (parsed.input as AssistRequestMap['breakdown']).level : undefined);
      if (!clean) return fail('model_error');
      completed = await reservation.complete();
      if (!completed) return fail('unavailable');
      return jsonResponse(200, clean);
    } finally { if (!completed) await reservation.release(); }
  } catch { return fail('unavailable'); }
}
