// covers-cat: FR-016
import { afterEach, describe, expect, it, vi } from "vitest";
import { removeLegacyCopy } from "../../../src/worker/legacy-copy.js";

function fakeNavigator() {
  const removed: string[] = [];
  const dir = { removeEntry: async (name: string) => void removed.push(name) };
  const navigator = { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) } };
  return { navigator, removed };
}

afterEach(() => vi.unstubAllGlobals());

describe("removing a leftover stored copy", () => {
  it("removes relate-web/<id>.json", async () => {
    const { navigator, removed } = fakeNavigator();
    vi.stubGlobal("navigator", navigator);
    await removeLegacyCopy("docs");
    expect(removed).toEqual(["docs.json"]);
  });

  it("never removes the catalog itself, which a descriptor id of \"catalog\" would name", async () => {
    const { navigator, removed } = fakeNavigator();
    vi.stubGlobal("navigator", navigator);
    await removeLegacyCopy("catalog");
    expect(removed).toEqual([]);
  });

  it("does nothing where there is no storage", async () => {
    vi.stubGlobal("navigator", undefined);
    await expect(removeLegacyCopy("docs")).resolves.toBeUndefined();
  });
});
