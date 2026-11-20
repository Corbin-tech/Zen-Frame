import type { ModelClient } from '../core.ts';
export function strictSchema(value: any): any {
  if (Array.isArray(value)) return value.map(strictSchema);
  if (!value || typeof value !== 'object') return value;
  const unsupported = new Set(['minLength', 'maxLength', 'minimum', 'maximum', 'minItems', 'maxItems', 'format', 'pattern', 'multipleOf']);
  const result = Object.fromEntries(Object.entries(value).filter(([k]) => !unsupported.has(k)).map(([k, v]) => [k, k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([name, schema]) => [name, strictSchema(schema)])) : strictSchema(v)]));
  if (value.type === 'object') { result.required = Object.keys(value.properties ?? {}); result.additionalProperties = false; }
  return result;
}
export function createOpenAIClient(key: string, model: string): ModelClient {
  return { async generate(input) {
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(10_000)]);
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }], max_completion_tokens: input.maxTokens, response_format: { type: 'json_schema', json_schema: { name: 'assist_answer', schema: strictSchema(input.schema), strict: true } } }) });
      if (!response.ok) return { kind: 'error' };
      const body = await response.json(); const choice = body.choices?.[0];
      if (choice?.message?.refusal) return { kind: 'refusal' };
      if (choice?.finish_reason !== 'stop') return { kind: 'error' };
      return { kind: 'ok', json: JSON.parse(choice.message.content) };
    } catch { return { kind: signal.aborted ? 'timeout' : 'error' }; }
  } };
}
