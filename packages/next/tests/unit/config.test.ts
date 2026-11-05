// covers: FR-002
import { afterEach, describe, expect, it } from "vitest";
import { withRelateWeb } from "../../src/index.js";

const saved = { base: process.env.RELATE_WEB_BASE_PATH, nav: process.env.RELATE_WEB_NAVIGATION };
afterEach(() => {
  for (const [key, value] of [["RELATE_WEB_BASE_PATH", saved.base], ["RELATE_WEB_NAVIGATION", saved.nav]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("withRelateWeb", () => {
  it("defaults the profile to client-routing and the base path to none, and changes no other setting", () => {
    const config = { reactStrictMode: true, images: { unoptimized: true }, env: { MINE: "1" } };
    const wrapped = withRelateWeb(config);
    expect(wrapped).toEqual({ ...config, env: { MINE: "1", RELATE_WEB_BASE_PATH: "", RELATE_WEB_NAVIGATION: "client-routing" } });
    expect(config.env).toEqual({ MINE: "1" }); // the argument is not changed
    expect(process.env.RELATE_WEB_NAVIGATION).toBe("client-routing");
  });

  it("passes multi-page through and reads the base path from the configuration", () => {
    const wrapped = withRelateWeb({ basePath: "/docs" }, { navigation: "multi-page" });
    expect(wrapped.env).toEqual({ RELATE_WEB_BASE_PATH: "/docs", RELATE_WEB_NAVIGATION: "multi-page" });
    expect(wrapped.basePath).toBe("/docs");
    expect(process.env.RELATE_WEB_BASE_PATH).toBe("/docs");
  });

  it("accepts no configuration at all", () => {
    expect(withRelateWeb(undefined).env?.RELATE_WEB_NAVIGATION).toBe("client-routing");
  });

  it("rejects a profile that is not listed, naming the allowed ones", () => {
    expect(() => withRelateWeb({}, { navigation: "spa" as never })).toThrow('navigation "spa" is not one of "client-routing", "multi-page"');
  });
});
