import { afterEach, expect, test, vi } from 'vitest';
import { brainDump } from '../src/lib/brainDump';

afterEach(() => vi.unstubAllGlobals());

function setupBrainDump(taskTexts: string[]) {
  const added: { text: string; fields: { parentId: string; estimateMinutes: number | null } }[] = [];
  const assistStore = {
    busy: false,
    preview: {
      kind: 'compile',
      clusters: [{ name: 'Errands', tasks: taskTexts.map(text => ({ text, minutes: 15 })) }],
    } as unknown,
    discard: vi.fn(() => { assistStore.preview = null; }),
  };
  const todosStore = {
    clusters: [] as { id: string; todo: string }[],
    createCluster: vi.fn((name: string) => {
      const id = `cluster-${todosStore.clusters.length + 1}`;
      todosStore.clusters.push({ id, todo: name });
      return id;
    }),
    addTodo: vi.fn((text: string, fields: { parentId: string; estimateMinutes: number | null }) => {
      added.push({ text, fields });
      return `todo-${added.length}`;
    }),
  };

  const session = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => session.set(k, v),
    removeItem: (k: string) => session.delete(k),
  });
  vi.stubGlobal('window', {
    Alpine: { store: (name: string) => (name === 'assist' ? assistStore : todosStore) },
    dispatchEvent: vi.fn(),
  });

  const draft = { focus: vi.fn() };
  const comp = brainDump() as unknown as ReturnType<typeof brainDump> & {
    $refs: { draft: typeof draft; dialog: HTMLElement };
    $nextTick: (fn: () => void) => void;
    $watch: () => void;
  };
  comp.$refs = { draft, dialog: {} as HTMLElement };
  comp.$nextTick = (fn: () => void) => fn();
  comp.$watch = () => {};
  comp.syncPreview();
  return { comp, assistStore, todosStore, added, draft };
}

test('accept announces singular for 1 task and plural for multiple tasks', () => {
  const single = setupBrainDump(['Buy milk']);
  single.comp.accept();
  expect(single.comp.announcement).toBe('Added 1 task. Your draft is cleared.');

  const multi = setupBrainDump(['Buy milk', 'Mail letter']);
  multi.comp.accept();
  expect(multi.comp.announcement).toBe('Added 2 tasks. Your draft is cleared.');
});

test('close skips focus restoration when restoreFocus is false and restores on default', () => {
  const { comp } = setupBrainDump([]);
  const opener = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;

  comp.open = true;
  comp.opener = opener;
  comp.close(false);
  expect(comp.open).toBe(false);
  expect(comp.opener).toBeNull();
  expect(opener.focus).not.toHaveBeenCalled();

  comp.open = true;
  comp.opener = opener;
  comp.close();
  expect(comp.open).toBe(false);
  expect(opener.focus).toHaveBeenCalledOnce();
});
