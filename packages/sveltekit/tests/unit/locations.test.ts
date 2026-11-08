// covers: FR-024
import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../helpers/app-paths-stub.js";
import { descriptorLocation } from "../../src/locations.js";

beforeEach(() => {
  state.base = "";
});

describe("a registered graph's descriptor location", () => {
  it("is built with resolve() from $app/paths, so it carries the site's base path", () => {
    expect(descriptorLocation("example")).toBe("/relate/example/descriptor.json");
    state.base = "/docs";
    expect(descriptorLocation("example")).toBe("/docs/relate/example/descriptor.json");
  });
});
