import { cleanCompile, cleanMinutes, cleanText } from './assist/sanitize';
import { loadSessionJson, removeSession, saveSessionJson } from './storage';
import type { initAssistStore } from '../stores/assistStore';
import type { AlpineComponent } from 'alpinejs';

type Assist = ReturnType<typeof initAssistStore>;
interface Task { id: number; text: string; minutes: number | null; included: boolean }
interface Cluster { id: number; name: string; tasks: Task[] }
interface Todos {
  clusters: { id: string; todo: string }[];
  createCluster(name: string): string;
  addTodo(text: string, fields: { parentId: string; estimateMinutes: number | null }): string;
}
const KEY = 'brain-dump-draft';
const assist = () => window.Alpine.store('assist') as unknown as Assist;
const todos = () => window.Alpine.store('todos') as unknown as Todos;

export function reviewClusters(raw: unknown): Cluster[] {
  let id = 0;
  return cleanCompile(raw).clusters.map(cluster => ({
    id: id++, name: cluster.name,
    tasks: cluster.tasks.map(task => ({ ...task, id: id++, included: true }))
  }));
}

export function acceptBrainDump(clusters: Cluster[], store: Todos): number {
  let count = 0;
  for (const cluster of clusters) {
    const tasks = cluster.tasks.filter(task => task.included && cleanText(task.text));
    if (!tasks.length) continue;
    const name = cleanText(cluster.name, 60) || 'Tasks';
    const parentId = store.clusters.find(item => item.todo.trim().toLowerCase() === name.toLowerCase())?.id
      ?? store.createCluster(name);
    for (const task of tasks) {
      store.addTodo(cleanText(task.text), { parentId, estimateMinutes: cleanMinutes(task.minutes) });
      count++;
    }
  }
  return count;
}

function component<T>(value: AlpineComponent<T>): AlpineComponent<T> { return value; }

export function brainDump() {
  return component({
    open: false, text: '', clusters: [] as Cluster[], announcement: '',
    dragging: null as { cluster: number; task: number } | null,
    opener: null as HTMLElement | null,
    init() {
      const saved = loadSessionJson<{ text?: unknown }>(KEY, {});
      this.text = typeof saved?.text === 'string' ? saved.text.slice(0, 6000) : '';
      this.$watch('text', () => saveSessionJson(KEY, { text: this.text }));
      this.$watch('$store.assist.preview', () => this.syncPreview());
      this.syncPreview();
    },
    syncPreview() {
      const preview = assist().preview;
      this.clusters = preview?.kind === 'compile' ? reviewClusters(preview) : [];
    },
    show(input?: { text?: unknown }) {
      if (typeof input?.text === 'string' && input.text) {
        this.text = `${this.text}${this.text ? '\n' : ''}${input.text}`.slice(0, 6000);
      }
      const detail = { name: 'brain-dump', opener: null as HTMLElement | null };
      window.dispatchEvent(new CustomEvent('overlay-opened', { detail }));
      this.opener = detail.opener || document.activeElement as HTMLElement;
      this.open = true;
      this.$nextTick(() => this.$refs.draft.focus());
    },
    close() {
      this.open = false;
      this.opener?.focus();
    },
    trap(event: KeyboardEvent) {
      const elements = Array.from((this.$refs.dialog as HTMLElement).querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, select'))
        .filter(element => element.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    },
    existing(name: string) {
      const match = todos().clusters.find(item => item.todo.trim().toLowerCase() === cleanText(name, 60).toLowerCase());
      return match ? `Adds to existing cluster ${match.todo}` : '';
    },
    move(source: number, taskId: number, destination: number) {
      const from = this.clusters.find(cluster => cluster.id === source);
      const to = this.clusters.find(cluster => cluster.id === Number(destination));
      const index = from?.tasks.findIndex(task => task.id === taskId) ?? -1;
      if (!from || !to || from === to || index < 0) return;
      const [task] = from.tasks.splice(index, 1);
      to.tasks.push(task);
      this.announcement = `Moved ${task.text} to ${to.name}.`;
      this.$nextTick(() => document.getElementById(`brain-move-${task.id}`)?.focus());
    },
    drop(destination: number) {
      if (this.dragging) this.move(this.dragging.cluster, this.dragging.task, destination);
      this.dragging = null;
    },
    normalize(task: Task) {
      task.text = cleanText(task.text);
      task.minutes = cleanMinutes(task.minutes);
    },
    get selected() { return this.clusters.reduce((sum, cluster) => sum + cluster.tasks.filter(task => task.included && cleanText(task.text)).length, 0); },
    accept() {
      if (assist().busy || assist().preview?.kind !== 'compile') return;
      const count = acceptBrainDump(this.clusters, todos());
      this.$refs.draft.focus();
      assist().discard();
      this.text = '';
      this.$nextTick(() => removeSession(KEY));
      this.announcement = `Added ${count} tasks. Your draft is cleared.`;
    },
    discard() { assist().discard(); this.announcement = 'Preview discarded. Your draft is kept.'; }
  });
}
