import type { Item } from './core.ts';
export function requestBody(item: Item, contract: string) {
  const { id, kind, ...body } = item;
  if (contract === 'ws1') return body;
  if (kind === 'estimate') return { tasks: [(item as any).task] };
  if (kind === 'breakdown') return { task: item.task, detailLevel: { few: '1-3', some: '3-4', five: 'about-5', many: '7+' }[item.level] };
  return body;
}
export function normalize(kind: string, body: any): any {
  if (kind === 'breakdown') return { steps: body.steps.map((s: any) => typeof s === 'string' ? { text: s, minutes: null } : s) };
  if (kind === 'compile') return { clusters: body.clusters.map((c: any) => ({ name: c.name, tasks: c.tasks.map((t: any) => ({ text: t.text ?? t.title, minutes: t.minutes ?? t.estimateMinutes ?? null })) })) };
  return body.tasks ? body.tasks[0] : body;
}
