// covers: FR-013, FR-014, FR-015
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import GraphData from "../../src/GraphData.svelte";

const KEY = Symbol.for("@relate/contrib-sveltekit/config");
const context = (registered: string[] = []) => new Map([[KEY, { catalog: registered.map((id) => ({ id, lifetime: "page", indexes: [] })), engineUrl: "/e", profile: "client-routing", renderIds: new Set<string>() }]]);
const doc = { version: 1, nodes: [{ id: "a", labels: ["Item"], properties: { note: "<" + "/script><b>x</b> & <" + "!-- y\u2028\u2029" } }], links: [] };
const html = (props: Record<string, unknown>, ctx = context()) => render(GraphData, { props: { id: "g", document: doc, page: "/inline.html", ...props } as never, context: ctx }).body;
const payload = (body: string) => JSON.parse(body.match(/<script type="application\/json" data-relate-graph="[^"]+">([\s\S]*?)<\/script>/)![1]!);

describe("GraphData rendered on the server", () => {
  it("writes one script element with the document and the config, with no descriptor and no request", () => {
    const body = html({ config: { indexes: [{ label: "Item", property: "id" }] } });
    expect(body.match(/<script type="application\/json" data-relate-graph="g">/g)).toHaveLength(1);
    expect(payload(body)).toEqual({ document: doc, config: { indexes: [{ label: "Item", property: "id" }] } });
    expect(body).not.toMatch(/revision|descriptor/);
  });

  it("escapes what could close the element or open a comment, and the text parses back to the document", () => {
    const body = html({});
    const text = body.match(/data-relate-graph="g">([\s\S]*?)<\/script>/)![1]!;
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(text).toContain("\\u003c/script\\u003e");
    expect(payload(body).document).toEqual(doc);
  });

  it("has no index in the config unless the author gives one", () => {
    expect(payload(html({})).config).toEqual({});
  });

  it("fails, naming the page, the graph and the first problem, for an invalid document or config", () => {
    expect(() => html({ document: { version: 1, nodes: [{ labels: ["x"] }], links: [] } })).toThrow(/\/inline\.html: inline graph "g": nodes\[0\]/);
    expect(() => html({ config: { indexes: [{ label: "", property: "id" }] } })).toThrow(/inline graph "g": config\.indexes/);
    expect(() => html({ config: { nope: 1 } })).toThrow(/config\.nope: unknown setting/);
  });

  it("fails for an id used twice in one render, and for an id that is also registered", () => {
    const ctx = context();
    html({}, ctx);
    expect(() => html({}, ctx)).toThrow(/\/inline\.html: inline graph "g": the name is used twice on this page/);
    expect(() => html({}, context(["g"]))).toThrow(/inline graph "g": the name is also a registered graph/);
  });

  it("does not carry the record of ids from one render to the next, and allows several ids on one page", () => {
    html({}, context());
    expect(() => html({}, context())).not.toThrow();
    const ctx = context();
    html({ id: "first" }, ctx);
    expect(() => html({ id: "second" }, ctx)).not.toThrow();
  });

  it("fails without a page prop or outside the provider", () => {
    expect(() => html({ page: "" })).toThrow(/needs a page prop/);
    expect(() => render(GraphData, { props: { id: "g", document: doc, page: "/x" } as never }).body).toThrow(/outside RelateProvider/);
  });
});
