import { SANITIZERS } from '../../../server/assist/contract.ts';
import type { AssistProvider, Endpoint } from '../../../server/assist/contract.ts';
export type AssistErrorCode = 'unauthorized' | 'rate_limited' | 'too_long' | 'unavailable' | 'invalid';
export class AssistError extends Error {
  readonly code: AssistErrorCode;
  constructor(code: AssistErrorCode) { super(code); this.name = 'AssistError'; this.code = code; }
}
export function createCloudProvider({ getToken }: { getToken: () => string | null }): AssistProvider {
  async function call(endpoint: Endpoint, input: unknown, signal?: AbortSignal) {
    const token = getToken(); if (!token) throw new AssistError('unauthorized');
    let response: Response;
    try { response = await fetch(`/api/assist/${endpoint}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal }); }
    catch (error) { if (signal?.aborted) throw error; throw new AssistError('unavailable'); }
    if (!response.ok) throw new AssistError(response.status === 401 || response.status === 402 ? 'unauthorized' : response.status === 429 ? 'rate_limited' : response.status === 413 ? 'too_long' : response.status >= 500 ? 'unavailable' : 'invalid');
    try { const result = SANITIZERS[endpoint](await response.json()); if (!result) throw new AssistError('invalid'); return result; }
    catch { throw new AssistError('invalid'); }
  }
  return {
    breakdown: async (input, signal) => await call('breakdown', input, signal) as Awaited<ReturnType<AssistProvider['breakdown']>>,
    compile: async (input, signal) => await call('compile', input, signal) as Awaited<ReturnType<AssistProvider['compile']>>,
    estimate: async (input, signal) => await call('estimate', input, signal) as Awaited<ReturnType<AssistProvider['estimate']>>,
  };
}
