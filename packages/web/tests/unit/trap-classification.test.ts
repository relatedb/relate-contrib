import { describe, expect, it } from "vitest";
import { isEngineTrap } from "../../src/worker/engine.js";

describe("what the core treats as a trap", () => {
  it.each([
    ["a WebAssembly runtime error", new WebAssembly.RuntimeError("unreachable")],
    ["Chromium's and WebKit's stack exhaustion", new RangeError("Maximum call stack size exceeded")],
    ["Firefox's stack exhaustion", Object.assign(new Error("too much recursion"), { name: "InternalError" })],
    ["the borrow an overflowed instance keeps", new Error("recursive use of an object detected which would lead to unsafe aliasing in rust")],
  ])("%s", (_name, err) => {
    expect(isEngineTrap(err)).toBe(true);
  });

  it.each([
    ["an engine error answered in the envelope's text", new Error("syntax error: unexpected token")],
    ["a storage lock", new Error("storage locked")],
  ])("does not treat %s as one", (_name, err) => {
    expect(isEngineTrap(err)).toBe(false);
  });
});
