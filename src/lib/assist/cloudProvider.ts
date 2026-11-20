import { cleanAnswer } from '../../../server/assist/validation.ts';
import { ASSIST_ENDPOINTS } from './api.ts';
import type { AssistRequestMap, AssistResponseMap } from './api.ts';
import type { AssistProvider } from './types.ts';
export type AssistErrorCode = 'unauthorized' | 'rate_limited' | 'too_long' | 'unavailable' | 'invalid';
export class AssistError extends Error {
  readonly code: AssistErrorCode;
  constructor(code: AssistErrorCode) { super(code); this.name = 'AssistError'; this.code = code; }
}
export function createCloudProvider({ getToken }: { getToken: () => string | null }): AssistProvider {
  async function call<K extends keyof AssistRequestMap>(endpoint: K, input: AssistRequestMap[K], signal?: AbortSignal): Promise<AssistResponseMap[K]> {
    const token = getToken(); if (!token) throw new AssistError('unauthorized');
    let response: Response;
    try { response = await fetch(ASSIST_ENDPOINTS[endpoint], { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal }); }
    catch (error) { if (signal?.aborted) throw error; throw new AssistError('unavailable'); }
    if (!response.ok) throw new AssistError(response.status === 401 || response.status === 402 ? 'unauthorized' : response.status === 429 ? 'rate_limited' : response.status === 413 ? 'too_long' : response.status >= 500 ? 'unavailable' : 'invalid');
    try { const result = cleanAnswer(endpoint, await response.json(), endpoint === 'breakdown' ? (input as AssistRequestMap['breakdown']).level : undefined); if (!result) throw new AssistError('invalid'); return result; }
    catch { throw new AssistError('invalid'); }
  }
  return {
    id: 'plus',
    status: async () => getToken() ? 'ready' : 'needs-plus',
    breakdown: (task, level, context, signal) => call('breakdown', { task, level, context }, signal),
    compile: (text, signal) => call('compile', { text }, signal),
    estimate: (task, signal) => call('estimate', { task }, signal),
  };
}
