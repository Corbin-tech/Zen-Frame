import { cleanBreakdown, cleanCompile, cleanEstimate } from '../../src/lib/assist/sanitize.ts';
import type { AssistRequestMap, AssistResponseMap } from '../../src/lib/assist/api.ts';
import { detailLevel } from '../../src/lib/assist/types.ts';
import type { DetailLevel } from '../../src/lib/assist/types.ts';
export type Endpoint = keyof AssistRequestMap;
export function cleanAnswer<K extends Endpoint>(endpoint: K, raw: unknown, level?: DetailLevel): AssistResponseMap[K] | null {
  try {
    if (endpoint === 'compile' && (!raw || typeof raw !== 'object' || !Array.isArray((raw as { clusters?: unknown }).clusters))) return null;
    const result = endpoint === 'breakdown' ? cleanBreakdown(raw) : endpoint === 'compile' ? cleanCompile(raw) : cleanEstimate(raw);
    if (!result || ('steps' in result && !result.steps.length)) return null;
    if ('clusters' in result && !result.clusters.length && (raw as { clusters: { tasks?: unknown }[] }).clusters.some(cluster => Array.isArray(cluster?.tasks) && cluster.tasks.length > 0)) return null;
    if ('steps' in result && level) {
      const { min, max } = detailLevel(level);
      if (result.steps.length < min || result.steps.length > max) return null;
    }
    return result as AssistResponseMap[K];
  } catch { return null; }
}
