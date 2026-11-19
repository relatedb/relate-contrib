// covers: FR-015, FR-016, FR-025
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachment, installPage, stubClient } from "../helpers/stubs.js";

const clients: Array<ReturnType<typeof stubClient>> = [];
const createClient = vi.fn((_options: unknown) => {
  const c = stubClient();
  clients.push(c);
  return c;
});
vi.mock("@relate/contrib-web", () => ({ createClient: (o: unknown) => createClient(o) }));

let page: ReturnType<typeof installPage>;
let open: typeof import("../../src/open.js").open;

beforeEach(async () => {
  vi.resetModules(); // `open` keeps a once-only reload flag in module state
  createClient.mockClear();
  clients.length = 0;
  page = installPage();
  ({ open } = await import("../../src/open.js"));
});

const document = { version: 1, nodes: [], links: [] };
const options = (invalidation: Promise<unknown>) => ({ engine: attachment("/e.wasm"), worker: attachment("/w.js"), graph: { document }, invalidation });

describe("a client's lifetime", () => {
  it("starts nothing before `open` is called", () => {
    expect(createClient).not.toHaveBeenCalled();
    expect(page.workers).toEqual([]);
  });

  it("destroys the client when the cell's invalidation resolves, and only then", async () => {
    let invalidate!: () => void;
    await open(options(new Promise<void>((r) => (invalidate = r))));
    await Promise.resolve();
    expect(clients[0]!.destroy).not.toHaveBeenCalled();
    invalidate();
    await new Promise((r) => setTimeout(r, 0));
    expect(clients[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the client on pagehide", async () => {
    await open(options(new Promise<void>(() => undefined)));
    page.pagehide();
    expect(clients[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys once when invalidation follows pagehide", async () => {
    let invalidate!: () => void;
    await open(options(new Promise<void>((r) => (invalidate = r))));
    page.pagehide();
    invalidate();
    await new Promise((r) => setTimeout(r, 0));
    expect(clients[0]!.destroy).toHaveBeenCalledTimes(1);
  });

  it("reloads the document once on a pageshow from the back-forward cache, and not otherwise", async () => {
    await open(options(new Promise<void>(() => undefined)));
    await open(options(new Promise<void>(() => undefined)));
    page.pageshow(false);
    expect(page.reload).not.toHaveBeenCalled();
    page.pagehide();
    page.pageshow(true);
    expect(page.reload).toHaveBeenCalledTimes(1);
  });

  it("stops listening for a restored page once the cell has been invalidated", async () => {
    let invalidate!: () => void;
    await open(options(new Promise<void>((r) => (invalidate = r))));
    invalidate();
    await new Promise((r) => setTimeout(r, 0));
    page.pageshow(true);
    expect(page.reload).not.toHaveBeenCalled();
  });

  it("opens any number of independent clients, each destroyed on its own cell's invalidation", async () => {
    let first!: () => void;
    await open(options(new Promise<void>((r) => (first = r))));
    await open(options(new Promise<void>(() => undefined)));
    await open(options(new Promise<void>(() => undefined)));
    expect(clients).toHaveLength(3);
    first();
    await new Promise((r) => setTimeout(r, 0));
    expect(clients.map((c) => c.destroy.mock.calls.length)).toEqual([1, 0, 0]);
  });

  it("asks each attachment for its location once per page, however many graphs are opened", async () => {
    const shared = options(new Promise<void>(() => undefined));
    await open(shared);
    await open({ ...shared, invalidation: new Promise<void>(() => undefined) });
    await open({ ...shared, invalidation: new Promise<void>(() => undefined) });
    expect(shared.engine.url).toHaveBeenCalledTimes(1);
    expect(shared.worker.url).toHaveBeenCalledTimes(1);
  });
});
