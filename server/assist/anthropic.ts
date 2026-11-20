import type { ModelClient } from './ports.ts';
export function createAnthropicClient(key: string): ModelClient {
  return { async generate(input) {
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(10_000)]);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: input.maxTokens, system: input.system, messages: [{ role: 'user', content: input.user }], thinking: { type: 'disabled' }, output_config: { effort: 'low', format: { type: 'json_schema', schema: input.schema } } }),
      });
      if (!response.ok) return { kind: 'error' };
      const body = await response.json();
      if (body.stop_reason === 'refusal') return { kind: 'refusal' };
      if (body.stop_reason !== 'end_turn') return { kind: 'error' };
      const blocks = body.content;
      if (!Array.isArray(blocks)) return { kind: 'error' };
      const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');
      return { kind: 'ok', json: JSON.parse(text) };
    } catch { return { kind: signal.aborted ? 'timeout' : 'error' }; }
  } };
}
