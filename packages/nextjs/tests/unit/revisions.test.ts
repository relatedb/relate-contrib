// covers: FR-006
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishedRevision, recordRevision } from "../../src/server/revisions.js";

let cwd: string;
let dir: string;
beforeEach(() => {
  cwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), "relate-rev-"));
  process.chdir(dir);
  process.env.RELATE_NEXTJS_DIST_DIR = ".out";
});
afterEach(() => {
  process.chdir(cwd);
  delete process.env.RELATE_NEXTJS_DIST_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe("the recorded revisions", () => {
  it("answers nothing when the build left no record, so the server evaluates", () => {
    expect(publishedRevision("example")).toBeUndefined();
  });

  it("keeps one revision per graph, replaces it on a rebuild and keeps the other graphs", () => {
    recordRevision("a", "aaaaaaaaaaaa");
    recordRevision("b", "bbbbbbbbbbbb");
    recordRevision("a", "cccccccccccc");
    expect(publishedRevision("a")).toBe("cccccccccccc");
    expect(publishedRevision("b")).toBe("bbbbbbbbbbbb");
    expect(publishedRevision("c")).toBeUndefined();
  });
});
