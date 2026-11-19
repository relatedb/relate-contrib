// covers: FR-025, FR-016
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config, installDocument, stubClient } from "../helpers/stubs.js";

const createClient = vi.fn((_o: unknown) => stubClient());
const createSiteClient = vi.fn((_o: unknown) => stubClient());
vi.mock("@relate/contrib-web", () => ({ createClient: (o: unknown) => createClient(o), createSiteClient: (o: unknown) => createSiteClient(o) }));

const registry = await import("../../src/registry.js");
const cfg = config([{ id: "small", lifetime: "page" }], "client-routing", "/engine.wasm");

beforeEach(() => {
  createClient.mockClear();
  registry.forgetAll();
  installDocument([]);
});

describe("the testing-aid options", () => {
  it("pass the engine's location unchanged and use the provider's profile by default", () => {
    registry.hold(cfg, "small");
    expect(createClient.mock.calls[0]![0]).toMatchObject({ engineUrl: "/engine.wasm", navigation: "client-routing" });
  });

  it("`navigation` changes only the profile passed to the core", () => {
    registry.hold(cfg, "small", { navigation: "multi-page" });
    expect(createClient.mock.calls[0]![0]).toMatchObject({ navigation: "multi-page", graph: { descriptor: "/relate/small/descriptor.json" }, store: true });
  });

  it("`descriptor` changes only the descriptor location passed to the core", () => {
    registry.hold(cfg, "small", { descriptor: "/descriptor-b.json" });
    expect(createClient.mock.calls[0]![0]).toMatchObject({ navigation: "client-routing", graph: { descriptor: "/descriptor-b.json" }, store: true });
  });

  it("the provider's profile follows the provider (a multi-page provider gives the core multi-page)", () => {
    registry.hold(config([{ id: "small", lifetime: "page" }], "multi-page"), "small");
    expect(createClient.mock.calls[0]![0]).toMatchObject({ navigation: "multi-page" });
  });
});
