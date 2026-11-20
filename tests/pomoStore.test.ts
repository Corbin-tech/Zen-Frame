import { afterEach, expect, test, vi } from "vitest";
import { initPomoStore } from "../src/stores/pomoStore";

afterEach(() => vi.unstubAllGlobals());

test.each([
  { name: "dialog hidden by its backdrop", visible: false, tab: "pomodoro", starts: true },
  { name: "visible dialog", visible: true, tab: "pomodoro", starts: false },
  { name: "no dialogs", visible: null, tab: "pomodoro", starts: true },
  { name: "hidden dialog in Zen mode", visible: false, tab: "zenmode", starts: true },
  { name: "unrelated tab", visible: false, tab: "dashboard", starts: false },
])("Space respects $name", ({ visible, tab, starts }) => {
  let keydown: (event: unknown) => void = () => {};
  const dialog = visible === null ? null : { checkVisibility: () => visible };
  vi.stubGlobal("document", {
    addEventListener: (_: string, listener: typeof keydown) => { keydown = listener; },
    querySelector: () => dialog,
    querySelectorAll: () => dialog ? [dialog] : [],
  });
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "activeTab" ? tab : null });
  vi.stubGlobal("sessionStorage", { getItem: () => null });
  vi.stubGlobal("window", { Alpine: { store: () => ({ zenShowTimer: true }) } });
  const store = initPomoStore();
  const start = vi.spyOn(store, "startTimer").mockImplementation(() => {});
  const pause = vi.spyOn(store, "pauseTimer").mockImplementation(() => {});
  store.init();
  const preventDefault = vi.fn();
  keydown({ code: "Space", target: { closest: () => null }, preventDefault });
  expect(start).toHaveBeenCalledTimes(starts ? 1 : 0);
  expect(preventDefault).toHaveBeenCalledTimes(starts ? 1 : 0);
  if (starts) {
    store.isRunning = true;
    keydown({ code: "Space", target: { closest: () => null }, preventDefault });
    expect(pause).toHaveBeenCalledOnce();
  }
});
