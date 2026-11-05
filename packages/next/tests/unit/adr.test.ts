// covers: FR-033, SC-009
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const adr = readFileSync(fileURLToPath(new URL("../../../../design/adr/ADR-005-next-adapter.md", import.meta.url)), "utf8");
const amendments = adr.slice(adr.indexOf("## 6. Amendments"));

describe("ADR-005 section 6", () => {
  it("has a dated entry for the implementation's check of each question it listed", () => {
    expect([...amendments.matchAll(/^- (\d{4}-\d{2}-\d{2})/gm)].length).toBeGreaterThanOrEqual(3);
    expect(amendments).toMatch(/hidden earlier page/i);
    expect(amendments).toMatch(/development server/i);
    expect(amendments).toMatch(/destructured route export/i);
    expect(amendments).toMatch(/catalog as props/i);
  });

  it("states what RFC-001 §7.5 settles (static export and the Node server) and what stays open (edge and serverless)", () => {
    expect(amendments).toMatch(/7\.5/);
    expect(amendments).toMatch(/static export/i);
    expect(amendments).toMatch(/edge and serverless/i);
  });
});
