// covers: FR-012, FR-013
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachment, installPage, stubClient } from "../helpers/stubs.js";

const client = stubClient();
const createClient = vi.fn((_options: unknown) => client);
vi.mock("@relate/contrib-web", () => ({ createClient: (o: unknown) => createClient(o) }));

const { open } = await import("../../src/open.js");
const never = new Promise<void>(() => undefined);

beforeEach(() => {
  createClient.mockClear();
  installPage();
});

describe("open, with a descriptor and its data", () => {
  const descriptor = { version: 1, id: "pantry", revision: "9f2c41e0a1b2", data: { url: "data/pantry.graph.json", nodes: 3, links: 2 }, indexes: [{ label: "Page", property: "id" }] };

  it("sets the descriptor's data location to the data attachment's published location, whatever its hash", async () => {
    await open({
      engine: attachment("/_file/data/relate.wasm"),
      worker: attachment("/_file/data/relate-worker.js"),
      graph: { descriptor: attachment("/_file/data/pantry.descriptor.aa11.json", descriptor), data: attachment("/_file/data/pantry.graph.c0ffee.json") },
      invalidation: never,
    });
    const options = createClient.mock.calls[0]![0] as { navigation: string; graph: { descriptor: typeof descriptor } };
    expect(options.navigation).toBe("multi-page");
    expect(options.graph.descriptor).toEqual({ ...descriptor, data: { url: "/_file/data/pantry.graph.c0ffee.json", nodes: 3, links: 2 } });
  });

  it("passes the descriptor as data, not as a location, and leaves the parsed original unchanged", async () => {
    const parsed = structuredClone(descriptor);
    await open({
      engine: attachment("/e.wasm"),
      worker: attachment("/w.js"),
      graph: { descriptor: attachment("/d.json", parsed), data: attachment("/_file/data/g.1.json") },
      invalidation: never,
    });
    const passed = (createClient.mock.calls[0]![0] as { graph: { descriptor: unknown } }).graph.descriptor;
    expect(typeof passed).toBe("object");
    expect(parsed.data.url).toBe("data/pantry.graph.json");
  });
});
