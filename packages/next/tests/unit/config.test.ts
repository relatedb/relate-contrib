// covers: FR-002
import { afterEach, describe, expect, it } from "vitest";
import { withRelatedWeb } from "../../src/index.js";

const saved = { base: process.env.RELATED_WEB_BASE_PATH, nav: process.env.RELATED_WEB_NAVIGATION };
afterEach(() => {
  for (const [key, value] of [["RELATED_WEB_BASE_PATH", saved.base], ["RELATED_WEB_NAVIGATION", saved.nav]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("withRelatedWeb", () => {
  it("defaults the profile to client-routing and the base path to none, and changes no other setting", () => {
    const config = { reactStrictMode: true, images: { unoptimized: true }, env: { MINE: "1" } };
    const wrapped = withRelatedWeb(config);
    expect(wrapped).toEqual({ ...config, env: { MINE: "1", RELATED_WEB_BASE_PATH: "", RELATED_WEB_NAVIGATION: "client-routing" } });
    expect(config.env).toEqual({ MINE: "1" }); // the argument is not changed
    expect(process.env.RELATED_WEB_NAVIGATION).toBe("client-routing");
  });

  it("passes multi-page through and reads the base path from the configuration", () => {
    const wrapped = withRelatedWeb({ basePath: "/docs" }, { navigation: "multi-page" });
    expect(wrapped.env).toEqual({ RELATED_WEB_BASE_PATH: "/docs", RELATED_WEB_NAVIGATION: "multi-page" });
    expect(wrapped.basePath).toBe("/docs");
    expect(process.env.RELATED_WEB_BASE_PATH).toBe("/docs");
  });

  it("accepts no configuration at all", () => {
    expect(withRelatedWeb(undefined).env?.RELATED_WEB_NAVIGATION).toBe("client-routing");
  });

  it("rejects a profile that is not listed, naming the allowed ones", () => {
    expect(() => withRelatedWeb({}, { navigation: "spa" as never })).toThrow('navigation "spa" is not one of "client-routing", "multi-page"');
  });
});
