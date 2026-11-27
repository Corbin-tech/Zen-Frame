import { afterEach, expect, test, vi } from "vitest";
import { registerStores } from "../src/lib/registerStores";

afterEach(() => vi.restoreAllMocks());

test("a store that throws does not stop the stores after it", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const registered: string[] = [];
  const failed = registerStores([
    ["theme", () => { registered.push("theme"); }],
    ["goals", () => { throw new TypeError("n.map is not a function"); }],
    ["pomoState", () => { registered.push("pomoState"); }]
  ]);
  expect(failed).toEqual(["goals"]);
  expect(registered).toEqual(["theme", "pomoState"]);
  expect(error).toHaveBeenCalledOnce();
});

test("no failures returns an empty list", () => {
  expect(registerStores([["theme", () => {}]])).toEqual([]);
});
