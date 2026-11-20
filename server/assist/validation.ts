import { cleanBreakdown, cleanCompile, cleanEstimate } from '../../src/lib/assist/sanitize.ts';
import type { AssistRequestMap, AssistResponseMap } from '../../src/lib/assist/api.ts';
export type Endpoint = keyof AssistRequestMap;
export function cleanAnswer<K extends Endpoint>(endpoint: K, raw: unknown): AssistResponseMap[K] | null {
  try {
    const result = endpoint === 'breakdown' ? cleanBreakdown(raw) : endpoint === 'compile' ? cleanCompile(raw) : cleanEstimate(raw);
    if (!result || ('steps' in result && !result.steps.length) || ('clusters' in result && !result.clusters.length)) return null;
    return result as AssistResponseMap[K];
  } catch { return null; }
}
