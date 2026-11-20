import { DETAIL_LEVELS } from '../src/lib/assist/types.ts';
export { DETAIL_LEVELS };
export type Item = { id: string; kind: 'breakdown'; task: string; level: string; context?: string } | { id: string; kind: 'compile'; text: string } | { id: string; kind: 'estimate'; task: string };
export type Dataset = { version: 1; consent: { source: 'synthetic' | 'contributed'; notes: string }; items: Item[] };
export type ModelClient = { generate(input: { system: string; user: string; schema: unknown; maxTokens: number; signal: AbortSignal }): Promise<{ kind: 'ok'; json: unknown } | { kind: 'refusal' | 'timeout' | 'error' }> };
export function validateDataset(value: any): Dataset {
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 6000;
  if (value?.version !== 1 || !['synthetic', 'contributed'].includes(value.consent?.source) || !text(value.consent?.notes) || !Array.isArray(value.items) || !value.items.length) throw new Error('Invalid dataset envelope or consent');
  const ids = new Set();
  for (const item of value.items) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id)) throw new Error('Invalid or duplicate dataset id');
    ids.add(item.id);
    const fields = item.kind === 'breakdown' ? ['id', 'kind', 'task', 'level', 'context'] : item.kind === 'compile' ? ['id', 'kind', 'text'] : item.kind === 'estimate' ? ['id', 'kind', 'task'] : [];
    if (!fields.length || Object.keys(item).some(k => !fields.includes(k)) || !text(item.kind === 'compile' ? item.text : item.task) || (item.kind === 'breakdown' && (!DETAIL_LEVELS.some(l => l.id === item.level) || (item.context !== undefined && (typeof item.context !== 'string' || item.context.length > 6000))))) throw new Error('Invalid dataset item');
  }
  return value;
}
export function args(argv = process.argv.slice(2)): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('Expected --option value');
    result[argv[i].slice(2)] = argv[i + 1];
  }
  return result;
}
export const csvCell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
export const ratingHeader = ['id', 'kind', 'useful', 'literal', 'one_action', 'realistic_minutes', 'notes', 'rater'];
export function ratingsCsv(rows: Record<string, unknown>[]) { return [ratingHeader, ...rows.map(r => ratingHeader.map(k => r[k] ?? ''))].map(row => row.map(csvCell).join(',')).join('\n') + '\n'; }
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (!cell || quoted) quoted = !quoted; else throw new Error('Invalid CSV quote'); }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(cell.replace(/\r$/, '')); cell = ''; if (c === '\n') { rows.push(row); row = []; } }
    else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() ?? [];
  if (ratingHeader.some(k => !header.includes(k)) || new Set(header).size !== header.length) throw new Error('Invalid ratings header');
  return rows.filter(r => r.some(Boolean)).map(r => { if (r.length !== header.length) throw new Error('Invalid CSV row'); return Object.fromEntries(header.map((k, i) => [k, r[i]])); });
}
