// covers-rel: FR-009, FR-010, FR-011, SC-003
import { afterEach, describe, expect, it } from "vitest";
import { gate } from "../release-gate.js";
import { CORE } from "../lib/workspace.js";
import { makeFixture, type Fixture } from "./helpers/fixture-workspace.js";
import { startRegistry, type StandIn } from "./helpers/stand-in-registry.js";

let fx: Fixture | undefined;
let reg: StandIn | undefined;
afterEach(async () => {
  fx?.remove();
  await reg?.close();
});
const ASTRO = "@relate/contrib-astro";
const ENGINE = "@relate/relate-wasm";

/** An adapter at 0.1.0, already known to the registry at 0.0.9 (so that it is not a first release), with its peers in place. */
const world = {
  [CORE]: { versions: ["0.1.0"] },
  [ENGINE]: { versions: ["0.16.1"] },
  [ASTRO]: { versions: ["0.0.9"] },
};

describe("the release gate", () => {
  it("passes an adapter whose peers are on the registry at versions its ranges accept", async () => {
    fx = makeFixture();
    reg = await startRegistry(world);
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toEqual({ pass: true });
  });

  it("refuses with peer-not-published, naming the core, when the core is absent", async () => {
    fx = makeFixture();
    const { [CORE]: _core, ...rest } = world;
    reg = await startRegistry(rest);
    const v = await gate(fx.root, ASTRO, { registry: reg.url });
    expect(v).toMatchObject({ pass: false, reason: "peer-not-published" });
    expect((v as { detail: string }).detail).toContain(CORE);
  });

  it("refuses with peer-out-of-range, naming the versions found, when the core is only at versions the range rejects", async () => {
    fx = makeFixture({ [ASTRO]: { peerDependencies: { [CORE]: ">=0.2.0 <1.0.0", "@relate/relate-wasm": ">=0.16.1 <=0.16.1" } } });
    reg = await startRegistry(world);
    const v = await gate(fx.root, ASTRO, { registry: reg.url });
    expect(v).toMatchObject({ pass: false, reason: "peer-out-of-range" });
    expect((v as { detail: string }).detail).toContain("0.1.0");
  });

  it("refuses with peer-not-published when the engine is not on the registry (no supported engine can run the package)", async () => {
    fx = makeFixture();
    const { [ENGINE]: _engine, ...rest } = world;
    reg = await startRegistry(rest);
    const v = await gate(fx.root, ASTRO, { registry: reg.url });
    expect(v).toMatchObject({ pass: false, reason: "peer-not-published" });
    expect((v as { detail: string }).detail).toContain(ENGINE);
  });

  it('refuses with engine-range-invalid for an engine range of "any version"', async () => {
    fx = makeFixture({ [ASTRO]: { peerDependencies: { [CORE]: ">=0.0.0 <1.0.0", "@relate/relate-wasm": "*" } } });
    reg = await startRegistry(world);
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toMatchObject({ pass: false, reason: "engine-range-invalid" });
  });

  it("refuses with version-exists when the version is already published", async () => {
    fx = makeFixture({ [ASTRO]: { version: "0.0.9" } });
    reg = await startRegistry(world);
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toMatchObject({ pass: false, reason: "version-exists" });
  });

  it("refuses with first-release-is-manual for a package that is not on the registry", async () => {
    fx = makeFixture();
    const { [ASTRO]: _astro, ...rest } = world;
    reg = await startRegistry(rest);
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toMatchObject({ pass: false, reason: "first-release-is-manual" });
  });

  it("refuses with registry-unreachable when the registry fails, and does not take that for absent or published", async () => {
    fx = makeFixture();
    reg = await startRegistry(world, { fail: true });
    const v = await gate(fx.root, ASTRO, { registry: reg.url });
    expect(v).toMatchObject({ pass: false, reason: "registry-unreachable" });
    const dead = await gate(fx.root, ASTRO, { registry: "http://127.0.0.1:1" });
    expect(dead).toMatchObject({ pass: false, reason: "registry-unreachable" });
  });

  it("judges the core first in a plan: an adapter passes against a core that is about to be published earlier in the same plan", async () => {
    fx = makeFixture();
    const { [CORE]: _core, ...rest } = world;
    reg = await startRegistry(rest);
    expect(await gate(fx.root, ASTRO, { registry: reg.url, pending: { [CORE]: "0.1.0" } })).toEqual({ pass: true });
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toMatchObject({ pass: false, reason: "peer-not-published" });
  });

  it("does not count a deprecated version as published for a peer", async () => {
    fx = makeFixture();
    reg = await startRegistry({ ...world, [CORE]: { versions: ["0.1.0"], deprecated: ["0.1.0"] } });
    expect(await gate(fx.root, ASTRO, { registry: reg.url })).toMatchObject({ pass: false, reason: "peer-out-of-range" });
  });
});
