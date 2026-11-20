import { createAnthropicClient } from '../../../server/assist/anthropic.ts';
import { handleAssist, jsonResponse } from '../../../server/assist/handler.ts';
import type { EntitlementGate } from '../../../server/assist/ports.ts';
interface Env {
  ANTHROPIC_API_KEY?: string;
  ASSIST_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
// TODO WS3: wire createEntitlementService(env) from server/auth/entitlement.ts,
// with PLUS_DB and PLUS_SIGNING_KEY bindings. Fail closed until then.
const entitlement: EntitlementGate = { async authenticate() { return null; }, async reserve() { return null; } };
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  if (!env.ANTHROPIC_API_KEY || !env.ASSIST_RATE_LIMITER) return jsonResponse(503, { error: 'unavailable' });
  const binding = env.ASSIST_RATE_LIMITER;
  return handleAssist(request, { model: createAnthropicClient(env.ANTHROPIC_API_KEY), entitlement, rateLimit: { async limit(key) { return (await binding.limit({ key })).success; } } });
}
