// covers-rel: FR-011, FR-014, FR-016, SC-004
import { afterEach, describe, expect, it } from "vitest";
import { formatPlan, planRelease } from "../plan-release.js";
import { CORE } from "../lib/workspace.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";
import { startRegistry, type StandIn } from "./helpers/stand-in-registry.js";

let fx: Fixture | undefined;
let reg: StandIn | undefined;
afterEach(async () => {
  fx?.remove();
  await reg?.close();
});
const ENGINE = "@relate/relate-wasm";

describe("the release plan", () => {
  it("lists every package in dependency order with the core first, each with its gate verdict, using no credential in a rehearsal", async () => {
    fx = makeFixture();
    reg = await startRegistry({});
    const plan = await planRelease(fx.root, { registry: reg.url, rehearsal: true });
    expect(plan.mode).toBe("rehearsal");
    expect(plan.credentials).toBe("none");
    expect(plan.entries[0]!.package).toBe(CORE);
    expect(plan.entries).toHaveLength(7);
    expect(plan.entries.every((e) => !e.verdict.pass)).toBe(true); // nothing is published yet: each first release is manual
    expect(formatPlan(plan)).toContain("no registry credential is used");
  });

  it("leaves out a package already published at its version, and judges a dependent against a core that is about to be published", async () => {
    fx = makeFixture();
    reg = await startRegistry({
      [ENGINE]: { versions: ["0.16.1"] },
      [CORE]: { versions: ["0.0.9"] },
      "@relate/contrib-astro": { versions: ["0.1.0"] }, // already published at its version
      "@relate/contrib-phaser": { versions: ["0.0.9"] },
    });
    const plan = await planRelease(fx.root, { registry: reg.url });
    const names = plan.entries.map((e) => e.package);
    expect(names).not.toContain("@relate/contrib-astro");
    expect(names[0]).toBe(CORE);
    expect(plan.entries[0]!.verdict).toEqual({ pass: true });
    expect(plan.entries.find((e) => e.package === "@relate/contrib-phaser")!.verdict).toEqual({ pass: true }); // the core is about to be published
    expect(plan.entries.find((e) => e.package === "@relate/contrib-nextjs")!.verdict).toMatchObject({ pass: false, reason: "first-release-is-manual" });
  });

  it("can be limited to one package, and reports nothing to publish when every package is on the registry", async () => {
    fx = makeFixture();
    reg = await startRegistry(Object.fromEntries([CORE, ...["astro", "nextjs", "observable", "sveltekit", "react-admin", "phaser"].map((n) => `@relate/contrib-${n}`)].map((n) => [n, { versions: ["0.1.0"] }])));
    const all = await planRelease(fx.root, { registry: reg.url });
    expect(all.entries).toEqual([]);
    expect(formatPlan(all)).toContain("nothing to publish");
    const one = await planRelease(fx.root, { registry: reg.url, only: ["@relate/contrib-phaser"] });
    expect(one.entries).toEqual([]);
  });

  it("marks a real release as using the registry's trusted publishing, and a rehearsal as using none", async () => {
    fx = makeFixture();
    reg = await startRegistry({});
    expect((await planRelease(fx.root, { registry: reg.url, rehearsal: false })).credentials).toBe("trusted-publishing");
    expect((await planRelease(fx.root, { registry: reg.url, rehearsal: true })).credentials).toBe("none");
  });
});
