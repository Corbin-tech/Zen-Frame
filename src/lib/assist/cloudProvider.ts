import { cleanAnswer } from '../../../server/assist/validation.ts';
import { ASSIST_ENDPOINTS, ASSIST_ERROR_STATUS } from './api.ts';
import type { AssistErrorCode, AssistRequestMap, AssistResponseMap } from './api.ts';
export type { AssistErrorCode } from './api.ts';
import type { AssistProvider } from './types.ts';
export class AssistError extends Error {
  readonly code: AssistErrorCode;
  constructor(code: AssistErrorCode) { super(code); this.name = 'AssistError'; this.code = code; }
}
export function createCloudProvider({ getToken }: { getToken: () => string | null | Promise<string | null> }): AssistProvider {
  async function call<K extends keyof AssistRequestMap>(endpoint: K, input: AssistRequestMap[K], signal?: AbortSignal): Promise<AssistResponseMap[K]> {
    const token = await getToken(); if (!token) throw new AssistError('unauthorized');
    if (signal?.aborted) throw signal.reason;
    let response: Response;
    try { response = await fetch(ASSIST_ENDPOINTS[endpoint], { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(input), signal }); }
    catch (error) { if (signal?.aborted) throw error; throw new AssistError('unavailable'); }
    if (!response.ok) {
      let code: AssistErrorCode = response.status === 401 ? 'unauthorized' : response.status === 429 ? 'rate_limited' : response.status === 413 ? 'too_long' : response.status === 502 ? 'model_error' : response.status >= 500 ? 'unavailable' : 'bad_request';
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string' && Object.hasOwn(ASSIST_ERROR_STATUS, body.error) && ASSIST_ERROR_STATUS[body.error as AssistErrorCode] === response.status) code = body.error;
      } catch (error) { if (signal?.aborted) throw error; }
      throw new AssistError(code);
    }
    try { const result = cleanAnswer(endpoint, await response.json(), endpoint === 'breakdown' ? (input as AssistRequestMap['breakdown']).level : undefined); if (!result) throw new AssistError('model_error'); return result; }
    catch (error) { if (signal?.aborted) throw error; throw new AssistError('model_error'); }
  }
  return {
    id: 'plus',
    status: async () => await getToken() ? 'ready' : 'needs-plus',
    breakdown: (task, level, context, signal) => call('breakdown', { task, level, context }, signal),
    compile: (text, signal) => call('compile', { text }, signal),
    estimate: (task, signal) => call('estimate', { task }, signal),
  };
}
