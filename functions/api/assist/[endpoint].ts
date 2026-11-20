import { createAnthropicClient } from '../../../server/assist/anthropic.ts';
import { handleAssist, jsonResponse } from '../../../server/assist/handler.ts';
import type { EntitlementGate } from '../../../server/assist/ports.ts';
import { createEntitlementService, type EntitlementEnv } from '../../../server/auth/entitlement.ts';
import type { RateLimiter } from '../../../server/assist/ports.ts';
import { createD1RateLimiter } from '../../../server/assist/rateLimit.ts';
import type { AssistDatabase, RateLimitScope } from '../../../server/assist/rateLimit.ts';
interface Env {
  ANTHROPIC_API_KEY?: string;
  ASSIST_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ASSIST_IP_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  PLUS_DB?: EntitlementEnv['PLUS_DB'];
  PLUS_SIGNING_KEY?: string;
}
export function selectAssistRateLimiter(env: Omit<Env, 'PLUS_DB'> & { PLUS_DB?: AssistDatabase }, scope: RateLimitScope = 'account'): RateLimiter | null {
  const binding = scope === 'ip' ? env.ASSIST_IP_RATE_LIMITER : env.ASSIST_RATE_LIMITER;
  if (binding) return { async limit(key) { return (await binding.limit({ key })).success; } };
  return env.PLUS_DB ? createD1RateLimiter(env.PLUS_DB, Date.now, scope) : null;
}
export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const rateLimit = selectAssistRateLimiter(env);
  const ipRateLimit = selectAssistRateLimiter(env, 'ip');
  if (!env.ANTHROPIC_API_KEY || !env.PLUS_DB || !env.PLUS_SIGNING_KEY || !rateLimit || !ipRateLimit) return jsonResponse(503, { error: 'unavailable' });
  const entitlement: EntitlementGate = createEntitlementService({ PLUS_DB: env.PLUS_DB, PLUS_SIGNING_KEY: env.PLUS_SIGNING_KEY });
  return handleAssist(request, { model: createAnthropicClient(env.ANTHROPIC_API_KEY), entitlement, rateLimit, ipRateLimit });
}
