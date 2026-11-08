// covers: FR-019
import { describe, expect, it } from "vitest";
import { encodeParams } from "../../src/worker/encode.js";

describe("the parameter encoder", () => {
  it("writes whole numbers as integers and other numbers as floats", () => {
    expect(encodeParams({ a: 3, b: 0.25, c: -2 })).toBe('{"a":3,"b":0.25,"c":-2}');
  });

  it("writes every item of an array with a fractional item as a float", () => {
    expect(encodeParams({ v: [0, 1, 0.5] })).toBe('{"v":[0.0,1.0,0.5]}');
    expect(encodeParams({ v: [-1, 2.5] })).toBe('{"v":[-1.0,2.5]}');
  });

  it("leaves an array of only whole numbers as integers", () => {
    expect(encodeParams({ v: [1, 2, 3] })).toBe('{"v":[1,2,3]}');
  });

  it("leaves an array of only fractional numbers as written", () => {
    expect(encodeParams({ v: [0.5, 1.5] })).toBe('{"v":[0.5,1.5]}');
  });

  it("keeps a value written as 2.0 an integer, since JSON cannot tell them apart", () => {
    expect(encodeParams({ x: 2.0 })).toBe('{"x":2}');
  });

  it("applies the rule at any depth, such as the rows of a batch", () => {
    const text = encodeParams({ rows: [{ props: { v: [0, 0.5] } }, { props: { v: [1, 2] } }] });
    expect(text).toBe('{"rows":[{"props":{"v":[0.0,0.5]}},{"props":{"v":[1,2]}}]}');
  });

  it("writes large whole floats and negative zero as valid float text", () => {
    expect(encodeParams({ v: [1e21, 0.5] })).toBe('{"v":[1e+21,0.5]}');
    expect(encodeParams({ v: [-0, 0.5] })).toBe('{"v":[-0.0,0.5]}');
  });

  it("escapes strings and keys like JSON", () => {
    expect(encodeParams({ 'k"ey': 'a"b\n' })).toBe('{"k\\"ey":"a\\"b\\n"}');
  });

  it("writes strings, booleans, null and nested arrays like JSON, and omits undefined", () => {
    expect(encodeParams({ s: "x", b: true, n: null, a: ["a", "b"], u: undefined })).toBe('{"s":"x","b":true,"n":null,"a":["a","b"]}');
  });

  it("produces text that JSON.parse reads back to the same values", () => {
    const value = { v: [0, 1, 0.5], w: [3, 4], s: "é" };
    expect(JSON.parse(encodeParams(value))).toEqual(value);
  });

  it("refuses numbers that are not finite", () => {
    expect(() => encodeParams({ x: Infinity })).toThrow();
    expect(() => encodeParams({ x: NaN })).toThrow();
  });
});
