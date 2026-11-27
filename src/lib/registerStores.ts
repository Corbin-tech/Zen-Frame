// Registers the Alpine stores one by one. Alpine runs each store's init() inside
// Alpine.store(), so one store that throws on bad saved data would otherwise stop every
// store after it from registering, and the whole page would break. A failed store keeps
// its defaults, and the rest of the app still works.

type StoreStep = [name: string, register: () => void];

export function registerStores(steps: readonly StoreStep[]): string[] {
  const failed: string[] = [];
  for (const [name, register] of steps) {
    try {
      register();
    } catch (error) {
      failed.push(name);
      console.error(`Could not load the "${name}" store; it starts from defaults.`, error);
    }
  }
  return failed;
}
