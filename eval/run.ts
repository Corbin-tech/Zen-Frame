import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, validateDataset, ratingsCsv, requestBody } from './core.ts';
import type { ModelClient } from './core.ts';
import { mockModel } from './models/mock.ts';
import { createOpenAIClient } from './models/openai.ts';
import { checkOutputDirectory } from './output.ts';
import { memoryRateLimiter } from '../server/assist/mocks.ts';
async function main() {
  const a = args();
  if (!a.dataset || !['mock', 'anthropic', 'openai'].includes(a.model)) throw new Error('Usage: node eval/run.ts --dataset path --model mock|anthropic|openai');
  if (Object.keys(a).some(k => !['dataset', 'model', 'handler', 'out', 'limit', 'force'].includes(k))) throw new Error('Unknown runner option');
  const out = resolve(a.out ?? 'eval/out');
  await checkOutputDirectory(out, a.force === 'true');
  if (a.model === 'anthropic' && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required (set locally)');
  if (a.model === 'openai' && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_EVAL_MODEL)) throw new Error('OPENAI_API_KEY and OPENAI_EVAL_MODEL are required (set locally)');
  const handlerPath = resolve(a.handler ?? 'server/assist/handler.ts');
  try { await access(handlerPath); } catch { throw new Error('Handler missing; merge WS2 or supply --handler path/to/server/assist/handler.ts'); }
  let handler: any;
  try { handler = await import(pathToFileURL(handlerPath).href); } catch { throw new Error('Handler import failed; check its dependencies and Node 24 type-stripping compatibility'); }
  if (typeof handler.handleAssist !== 'function') throw new Error('Handler must export handleAssist');
  let model: ModelClient = mockModel;
  let modelName = a.model === 'openai' ? process.env.OPENAI_EVAL_MODEL : 'mock';
  if (a.model === 'openai') model = createOpenAIClient(process.env.OPENAI_API_KEY!, process.env.OPENAI_EVAL_MODEL!);
  if (a.model === 'anthropic') {
    try {
      const client = await import(pathToFileURL(resolve(dirname(handlerPath), 'anthropic.ts')).href);
      model = client.createAnthropicClient(process.env.ANTHROPIC_API_KEY);
      modelName = [client.ANTHROPIC_MODEL_ID, client.ANTHROPIC_MODEL, client.MODEL_ID, client.MODEL].find(v => typeof v === 'string' && v.trim()) ?? 'claude-haiku-5-5';
    } catch { throw new Error('Could not load WS2 Anthropic client beside handler'); }
  }
  const dataset = validateDataset(JSON.parse(await readFile(resolve(a.dataset), 'utf8')));
  const limit = a.limit === undefined ? dataset.items.length : Number(a.limit);
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
  const ipRateLimit = a.model === 'mock' ? memoryRateLimiter(limit) : undefined;
  const results = [];
  for (const item of dataset.items.slice(0, limit)) {
    const start = performance.now(); let status = 0, error: string | null = null, output: unknown = null;
    try {
      const request = new Request(`http://eval.local/api/assist/${item.kind}`, { method: 'POST', headers: { Origin: 'http://eval.local', 'Content-Type': 'application/json', Authorization: 'Bearer eval-local', 'Sec-Fetch-Site': 'same-origin', ...(ipRateLimit ? { 'CF-Connecting-IP': '192.0.2.1' } : {}) }, body: JSON.stringify(requestBody(item)) });
      const response = await handler.handleAssist(request, { model, entitlement: { authenticate: async () => ({ accountId: 'eval', sessionId: 'eval' }), reserve: async () => ({ complete: async () => true, release: async () => {} }) }, rateLimit: { limit: () => true }, ...(ipRateLimit ? { ipRateLimit } : {}) });
      status = response.status; const body = await response.json();
      if (response.ok) output = body; else error = typeof body.error === 'string' && /^[a-z_]{1,60}$/.test(body.error) ? body.error : 'handler_error';
    } catch { error = 'handler_failure'; }
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    results.push({ id: item.id, kind: item.kind, ...(item.kind === 'breakdown' ? { level: item.level } : {}), status, error, latencyMs, output });
    console.log(`${item.id} status=${status} latency_ms=${latencyMs}`);
  }
  await mkdir(out, { recursive: true, mode: 0o700 });
  await writeFile(resolve(out, 'results.json'), JSON.stringify({ version: 1, model: a.model, modelName, consent: dataset.consent, createdAt: new Date().toISOString(), results }, null, 2), { mode: 0o600, flag: a.force === 'true' ? 'w' : 'wx' });
  await writeFile(resolve(out, 'ratings.csv'), ratingsCsv(results.filter(r => r.kind !== 'estimate').map(r => ({ id: r.id, kind: r.kind }))), { mode: 0o600, flag: a.force === 'true' ? 'w' : 'wx' });
  console.log(`Completed ${results.length} items`);
}
main().catch((error) => {
  const message = error instanceof SyntaxError ? 'Invalid dataset JSON' : error instanceof Error && !('code' in error) ? error.message : 'Evaluation file access failed';
  console.error(message); process.exitCode = 1;
});
