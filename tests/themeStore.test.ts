import { afterEach, expect, test, vi } from "vitest";
import { initThemeStore } from "../src/stores/themeStore";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function sharedTabs(prefersDark = false) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); }
  };
  vi.stubGlobal("localStorage", storage);

  function tab() {
    const classes = new Set<string>(prefersDark ? ["dark"] : []);
    const attrs: Record<string, string> = { "data-theme": prefersDark ? "dark" : "light" };
    const meta = { content: "" };
    const doc = {
      documentElement: {
        classList: {
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
          contains: (name: string) => classes.has(name),
          toggle: (name: string, force?: boolean) => {
            const on = force === undefined ? !classes.has(name) : force;
            if (on) classes.add(name); else classes.delete(name);
            return on;
          }
        },
        setAttribute: (name: string, value: string) => { attrs[name] = value; },
        getAttribute: (name: string) => attrs[name] ?? null
      },
      querySelector: (selector: string) => selector === 'meta[name="theme-color"]' ? meta : null
    };
    const media = { matches: prefersDark, addEventListener: vi.fn() };
    let storageListener: (event: any) => void = () => {};
    vi.stubGlobal("document", doc);
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (prop: string) => prop === "--bg-color" ? (classes.has("dark") ? "#111111" : "#F7F5EF") : ""
    }));
    vi.stubGlobal("window", {
      matchMedia: () => media,
      addEventListener: (name: string, callback: typeof storageListener) => {
        if (name === "storage") storageListener = callback;
      },
      dispatchEvent: vi.fn()
    });
    const store = initThemeStore();
    store.init();
    const bindGlobals = () => {
      vi.stubGlobal("document", doc);
      vi.stubGlobal("getComputedStyle", () => ({
        getPropertyValue: (prop: string) => prop === "--bg-color" ? (classes.has("dark") ? "#111111" : "#F7F5EF") : ""
      }));
    };
    return {
      store,
      classes,
      attrs,
      meta,
      media,
      setTheme: (theme: "light" | "dark") => {
        bindGlobals();
        store.setTheme(theme);
      },
      dispatch: (key: string | null = "theme", storageArea: unknown = storage) => {
        bindGlobals();
        storageListener({ key, storageArea });
      }
    };
  }

  return { a: tab(), b: tab(), storage };
}

test("storage events sync theme changes without writing back and ignore other keys or storage", () => {
  vi.useFakeTimers();
  const { a, b, storage } = sharedTabs(false);
  a.setTheme("dark");
  storage.setItem.mockClear();

  b.dispatch("settings");
  b.dispatch("theme", {});
  expect(b.store.current).toBe("light");
  expect(b.classes.has("dark")).toBe(false);
  expect(b.attrs["data-theme"]).toBe("light");

  b.dispatch();
  expect(b.store.current).toBe("dark");
  expect(b.classes.has("dark")).toBe(true);
  expect(b.attrs["data-theme"]).toBe("dark");
  expect(b.meta.content).toBe("#111111");
  expect(storage.setItem).not.toHaveBeenCalled();

  a.setTheme("light");
  storage.setItem.mockClear();
  b.dispatch();
  expect(b.store.current).toBe("light");
  expect(b.classes.has("dark")).toBe(false);
  expect(b.attrs["data-theme"]).toBe("light");
  expect(b.meta.content).toBe("#F7F5EF");
  expect(storage.setItem).not.toHaveBeenCalled();
});

test("clearing or invalidating stored theme falls back to system preference", () => {
  vi.useFakeTimers();
  const { a, b, storage } = sharedTabs(false);
  a.setTheme("dark");
  b.dispatch();
  expect(b.store.current).toBe("dark");

  storage.clear();
  b.dispatch(null);
  expect(b.store.current).toBe("light");
  expect(b.classes.has("dark")).toBe(false);

  b.media.matches = true;
  storage.setItem("theme", "sepia");
  b.dispatch("theme");
  expect(b.store.current).toBe("dark");
  expect(b.classes.has("dark")).toBe(true);
});
