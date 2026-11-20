import type { ModelClient } from '../core.ts';
export const mockModel: ModelClient = { async generate(input) {
  try {
    function shape(s: any, key = ''): any {
      if (s.anyOf) return shape(s.anyOf.find((v: any) => v.type !== 'null') ?? s.anyOf[0], key);
      if (s.enum) return s.enum[0];
      if (s.type === 'object') return Object.fromEntries(Object.entries(s.properties ?? {}).map(([k, v]) => [k, shape(v, k)]));
      if (s.type === 'array') return Array.from({ length: Math.min(s.maxItems ?? 100, Math.max(s.minItems ?? 0, 1)) }, () => shape(s.items, key));
      if (s.type === 'integer' || s.type === 'number') return Math.max(s.minimum ?? 1, Math.min(s.maximum ?? 600, 5));
      if (s.type === 'null') return null;
      return key === 'name' ? 'Preparation' : 'Open the checklist';
    }
    return { kind: 'ok', json: shape(input.schema) };
  } catch { return { kind: 'error' }; }
} };
