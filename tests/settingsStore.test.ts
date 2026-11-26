import { afterEach, expect, test, vi } from "vitest";
import { initSettingsStore } from "../src/stores/settingsStore";

vi.mock("../src/lib/favicon", () => ({ applyAccentFavicon: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

function sharedTabs() {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("document", { documentElement: { dataset: {} } });
  function tab() {
    let listener: (event: any) => void = () => {};
    vi.stubGlobal("window", { addEventListener: (_name: string, callback: typeof listener) => { listener = callback; }, dispatchEvent: vi.fn() });
    const store = initSettingsStore();
    store.init();
    return { store, dispatch: (key: string | null = "settings", storageArea: unknown = storage) => listener({ key, storageArea }) };
  }
  return { a: tab(), b: tab(), storage };
}

test("an accent change in a stale tab preserves another tab's name", () => {
  const { a, b, storage } = sharedTabs();
  a.store.update({ name: "Alex" });
  b.store.update({ accent: "rose" });
  expect(JSON.parse(storage.getItem("settings")!)).toMatchObject({ name: "Alex", accent: "rose" });
  expect(b.store.name).toBe("Alex");
});

test("storage events apply settings without writing back and ignore other storage", () => {
  const { a, b, storage } = sharedTabs();
  a.store.update({ name: "Alex", accent: "rose" });
  storage.setItem.mockClear();
  b.dispatch("unrelated");
  b.dispatch("settings", {});
  expect(b.store.name).toBe("");
  b.dispatch();
  expect(b.store.name).toBe("Alex");
  expect(document.documentElement.dataset.accent).toBe("rose");
  b.store.save();
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.setItem("settings", "{}");
  b.dispatch(null);
  expect(b.store.name).toBe("");
  expect(b.store.accent).toBe("teal");
});

test("failed local writes survive a remote update and can be retried", () => {
  const { a, b, storage } = sharedTabs();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("CustomEvent", class {});
  storage.setItem.mockImplementationOnce(() => { throw new Error("Full"); });
  a.store.update({ name: "Alex" });
  b.store.update({ accent: "rose" });
  a.dispatch();
  a.store.save();
  expect(JSON.parse(storage.getItem("settings")!)).toMatchObject({ name: "Alex", accent: "rose" });
  error.mockRestore();
});

test("legacy zenShowTimer key is ignored on load and dropped on save", () => {
  const { a, storage } = sharedTabs();
  storage.setItem("settings", JSON.stringify({ name: "Sam", zenShowTimer: true }));
  a.dispatch();
  expect("zenShowTimer" in a.store).toBe(false);
  a.store.update({ accent: "ocean" });
  const saved = JSON.parse(storage.getItem("settings")!);
  expect(saved).toMatchObject({ name: "Sam", accent: "ocean" });
  expect("zenShowTimer" in saved).toBe(false);
});
