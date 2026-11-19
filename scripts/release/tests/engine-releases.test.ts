// covers-rel: FR-018, FR-021, SC-006
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { testedFromTags, untestedReleases } from "../engine-releases.js";
import { startRegistry, type StandIn } from "./helpers/stand-in-registry.js";
import { fetchVersions } from "../lib/registry.js";

const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures/engine-releases/registry.json"), "utf8")) as { versions: string[]; deprecated: string[]; tested: string[] };
let reg: StandIn | undefined;
afterEach(async () => reg?.close());

describe("which engine releases are untested", () => {
  it("lists the untested releases oldest first, leaving out prereleases, deprecated releases and those already tested", () => {
    const tested = testedFromTags(fixture.tested);
    expect(tested).toEqual(["0.16.0", "0.16.1"]);
    expect(untestedReleases(fixture.versions, fixture.deprecated, tested)).toEqual(["0.17.0", "0.18.1"]);
  });

  it("tests a release once however many times it is signalled", () => {
    const after = testedFromTags([...fixture.tested, "engine-tested/0.17.0"]);
    expect(untestedReleases(fixture.versions, fixture.deprecated, after)).toEqual(["0.18.1"]);
    expect(untestedReleases([...fixture.versions, "0.17.0", "0.17.0"], fixture.deprecated, after)).toEqual(["0.18.1"]);
  });

  it("returns two untested releases in order, each once, and none when everything is tested", () => {
    expect(untestedReleases(["0.19.0", "0.18.1", "0.18.1"], [], [])).toEqual(["0.18.1", "0.19.0"]);
    expect(untestedReleases(["0.18.1"], [], ["0.18.1"])).toEqual([]);
  });

  it("ignores tags that are not engine-tested tags", () => {
    expect(testedFromTags(["v1.0.0", "@relate/contrib-web@0.1.0", "engine-tested/0.17.0"])).toEqual(["0.17.0"]);
  });

  it("reads the engine's versions and deprecations from the registry's answer", async () => {
    reg = await startRegistry({ "@relate/relate-wasm": { versions: fixture.versions, deprecated: fixture.deprecated } });
    const got = await fetchVersions("@relate/relate-wasm", reg.url);
    expect(got).toMatchObject({ status: "ok", deprecated: ["0.18.0"] });
    if (got.status === "ok") expect(untestedReleases(got.versions, got.deprecated, testedFromTags(fixture.tested))).toEqual(["0.17.0", "0.18.1"]);
  });
});
