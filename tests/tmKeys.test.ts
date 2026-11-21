import { describe, expect, test } from "vitest";
import {
  INBOX_NAME,
  TM_OVERLAY_NAME,
  moveAnnouncementText,
  stepRowIndex,
  tmKeyIntent
} from "../src/scripts/tmKeys";

// One bare keypress; per-key modifiers can be overridden
function key(key: string, overrides: Partial<Parameters<typeof tmKeyIntent>[0]> = {}) {
  return { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...overrides };
}

// The Task Manager tab visible with focus on a task row, nothing else competing for the keys
const ready = { typing: false, tabActive: true, overlayOpen: false, rowMenuOpen: false, rowFocus: "row" as const };

describe("tmKeys", () => {
  describe("tmKeyIntent (spec item 17's key map)", () => {
    test("j and k move row focus", () => {
      expect(tmKeyIntent(key("j"), ready)).toEqual({ kind: "focusRow", direction: 1 });
      expect(tmKeyIntent(key("k"), ready)).toEqual({ kind: "focusRow", direction: -1 });
    });

    test("x completes, e and Enter edit, and # opens the cluster picker", () => {
      expect(tmKeyIntent(key("x"), ready)).toEqual({ kind: "completeTask" });
      expect(tmKeyIntent(key("e"), ready)).toEqual({ kind: "editTask" });
      expect(tmKeyIntent(key("Enter"), ready)).toEqual({ kind: "editTask" });
      expect(tmKeyIntent(key("#"), ready)).toEqual({ kind: "openClusterPicker" });
    });

    test("outside a row, j/k still focus rows while Enter, e, x, and # are left to the browser", () => {
      const outside = { ...ready, rowFocus: "none" as const };
      expect(tmKeyIntent(key("j"), outside)).toEqual({ kind: "focusRow", direction: 1 });
      expect(tmKeyIntent(key("k"), outside)).toEqual({ kind: "focusRow", direction: -1 });
      expect(tmKeyIntent(key("Enter"), outside)).toBeNull();
      expect(tmKeyIntent(key("e"), outside)).toBeNull();
      expect(tmKeyIntent(key("x"), outside)).toBeNull();
      expect(tmKeyIntent(key("#"), outside)).toBeNull();
    });

    test("on a control inside a row, Enter and e stay with the control while x and # act on the row", () => {
      const within = { ...ready, rowFocus: "within" as const };
      expect(tmKeyIntent(key("Enter"), within)).toBeNull();
      expect(tmKeyIntent(key("e"), within)).toBeNull();
      expect(tmKeyIntent(key("x"), within)).toEqual({ kind: "completeTask" });
      expect(tmKeyIntent(key("#"), within)).toEqual({ kind: "openClusterPicker" });
      expect(tmKeyIntent(key("j"), within)).toEqual({ kind: "focusRow", direction: 1 });
    });

    test("# works with Shift held, the way most keyboards type it", () => {
      expect(tmKeyIntent(key("#", { shiftKey: true }), ready)).toEqual({ kind: "openClusterPicker" });
    });

    test("nothing happens while the user is typing somewhere", () => {
      const typing = { ...ready, typing: true };
      expect(tmKeyIntent(key("j"), typing)).toBeNull();
      expect(tmKeyIntent(key("Enter"), typing)).toBeNull();
    });

    test("nothing happens on another tab, under an overlay, or with a row sheet open", () => {
      for (const context of [
        { ...ready, tabActive: false },
        { ...ready, overlayOpen: true },
        { ...ready, rowMenuOpen: true }
      ]) {
        expect(tmKeyIntent(key("j"), context)).toBeNull();
        expect(tmKeyIntent(key("#"), context)).toBeNull();
      }
    });

    test("browser and system combinations bail out untouched", () => {
      expect(tmKeyIntent(key("j", { altKey: true }), ready)).toBeNull();
      expect(tmKeyIntent(key("Enter", { ctrlKey: true }), ready)).toBeNull();
      expect(tmKeyIntent(key("x", { metaKey: true }), ready)).toBeNull();
      expect(tmKeyIntent(key("#", { altKey: true }), ready)).toBeNull();
      expect(tmKeyIntent(key("j", { shiftKey: true }), ready)).toBeNull();
    });

    test("keys the app does not own are left alone, including the global N", () => {
      for (const other of ["n", "a", " ", "Escape", "ArrowDown", "Tab", "Backspace"]) {
        expect(tmKeyIntent(key(other), ready)).toBeNull();
      }
    });
  });

  describe("stepRowIndex (the j/k row walk)", () => {
    test("with no row focused, j goes to the first and k to the last", () => {
      expect(stepRowIndex(-1, 1, 4)).toBe(0);
      expect(stepRowIndex(-1, -1, 4)).toBe(3);
    });

    test("each step moves by one and clamps at the ends", () => {
      expect(stepRowIndex(0, 1, 3)).toBe(1);
      expect(stepRowIndex(1, -1, 3)).toBe(0);
      expect(stepRowIndex(0, -1, 3)).toBe(0);
      expect(stepRowIndex(2, 1, 3)).toBe(2);
    });

    test("an empty list has nowhere to go", () => {
      expect(stepRowIndex(-1, 1, 0)).toBeNull();
      expect(stepRowIndex(0, -1, 0)).toBeNull();
    });
  });

  describe("moveAnnouncementText (the one spoke line, destination-aware)", () => {
    test("a clustered task names its cluster", () => {
      const task = { parentId: "c1" };
      expect(moveAnnouncementText(task, 2, 3, "CS101")).toBe("Moved to position 2 of 3 in CS101");
    });

    test("a loose task is in the Inbox, by one name everywhere", () => {
      expect(moveAnnouncementText({ parentId: null }, 1, 1, "")).toBe(`Moved to position 1 of 1 in ${INBOX_NAME}`);
      expect(INBOX_NAME).toBe("Inbox");
    });

    test("a cluster whose name went missing still says where the task sits", () => {
      const task = { parentId: "c1" };
      expect(moveAnnouncementText(task, 2, 2, "")).toBe("Moved to position 2 of 2 in its cluster");
    });
  });

  test("TM_OVERLAY_NAME joins the app's overlay coordination", () => {
    expect(TM_OVERLAY_NAME).toBe("tm-cluster-picker");
  });
});
