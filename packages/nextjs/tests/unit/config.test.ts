// covers: FR-002
import { afterEach, describe, expect, it } from "vitest";
import { withRelate } from "../../src/index.js";

const saved = { base: process.env.RELATE_NEXTJS_BASE_PATH, nav: process.env.RELATE_NEXTJS_NAVIGATION };
afterEach(() => {
  for (const [key, value] of [["RELATE_NEXTJS_BASE_PATH", saved.base], ["RELATE_NEXTJS_NAVIGATION", saved.nav]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("withRelate", () => {
  it("defaults the profile to client-routing and the base path to none, and changes no other setting", () => {
    const config = { reactStrictMode: true, images: { unoptimized: true }, env: { MINE: "1" } };
    const wrapped = withRelate(config);
    expect(wrapped).toEqual({ ...config, env: { MINE: "1", RELATE_NEXTJS_BASE_PATH: "", RELATE_NEXTJS_NAVIGATION: "client-routing" } });
    expect(config.env).toEqual({ MINE: "1" }); // the argument is not changed
    expect(process.env.RELATE_NEXTJS_NAVIGATION).toBe("client-routing");
  });

  it("passes multi-page through and reads the base path from the configuration", () => {
    const wrapped = withRelate({ basePath: "/docs" }, { navigation: "multi-page" });
    expect(wrapped.env).toEqual({ RELATE_NEXTJS_BASE_PATH: "/docs", RELATE_NEXTJS_NAVIGATION: "multi-page" });
    expect(wrapped.basePath).toBe("/docs");
    expect(process.env.RELATE_NEXTJS_BASE_PATH).toBe("/docs");
  });

  it("wraps a function configuration, and an async one, and passes its arguments through", async () => {
    const seen: unknown[] = [];
    const sync = withRelate((phase: string) => (seen.push(phase), { basePath: "/docs", reactStrictMode: true }));
    const a = await sync("phase-production-build");
    expect(seen).toEqual(["phase-production-build"]);
    expect(a).toMatchObject({ basePath: "/docs", reactStrictMode: true, env: { RELATE_NEXTJS_BASE_PATH: "/docs", RELATE_NEXTJS_NAVIGATION: "client-routing" } });
    const asynchronous = withRelate(async () => ({ basePath: "/x", images: { unoptimized: true } }), { navigation: "multi-page" });
    expect(await asynchronous()).toMatchObject({ basePath: "/x", images: { unoptimized: true }, env: { RELATE_NEXTJS_NAVIGATION: "multi-page" } });
    expect(process.env.RELATE_NEXTJS_BASE_PATH).toBe("/x");
  });

  it("accepts no configuration at all", () => {
    expect(withRelate(undefined).env?.RELATE_NEXTJS_NAVIGATION).toBe("client-routing");
  });

  it("rejects a profile that is not listed, naming the allowed ones", () => {
    expect(() => withRelate({}, { navigation: "spa" as never })).toThrow('navigation "spa" is not one of "client-routing", "multi-page"');
  });
});
