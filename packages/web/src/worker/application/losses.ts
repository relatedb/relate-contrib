// Reading values with their types, and deciding what the graph data format (ADR-002) can carry (ADR-009 2.5).
// The engine's `columnTypes` names one type per column from one row, so it cannot classify a property whose type
// differs across nodes; each value is read with `valueType()` and `toString()` instead (specs/006 research P-1).
import type { LossKind } from "../../application/types.js";

/** One property as the typed read returns it: the key, the engine's type name, the value's exact text. */
export type TypedValue = [key: string, type: string, text: string];

export interface Converted {
  /** True when the value goes into the document; false when it is left out. */
  keep: boolean;
  value?: unknown;
  loss?: LossKind;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** An engine type name without nullability: `LIST<INTEGER NOT NULL> NOT NULL` is `LIST<INTEGER>`. */
function base(type: string): string {
  return type.replace(/ NOT NULL/g, "").trim();
}

const isTemporal = (t: string): boolean => /^(DATE|ZONED DATETIME|LOCAL DATETIME|ZONED TIME|LOCAL TIME)$/.test(t);

/** The elements of a list's text, `[1, 2]`, as strings. A list holds one kind of value, so a split on ", " is exact for numbers. */
const listElements = (text: string): string[] => text.slice(1, -1).split(", ").filter((x) => x !== "");

const beyond = (text: string): boolean => {
  try {
    const n = BigInt(text);
    return n > MAX_SAFE || n < -MAX_SAFE;
  } catch {
    return false;
  }
};

/** `json` is the value as the properties read gives it (numbers pass through JSON, so large integers are inexact there). */
export function convert(type: string, text: string, json: unknown): Converted {
  const t = base(type);
  switch (t) {
    case "STRING":
    case "BOOLEAN":
      return { keep: true, value: json };
    case "INTEGER":
      return beyond(text) ? { keep: true, value: Number(text), loss: "integer-beyond-2^53" } : { keep: true, value: json };
    case "FLOAT":
      return Number.isInteger(Number(text)) && Number.isFinite(Number(text))
        ? { keep: true, value: Number(text), loss: "whole-number-float" }
        : { keep: true, value: json };
    case "DURATION":
      return { keep: true, value: text, loss: "duration" };
    case "POINT":
      return { keep: false, loss: "point" };
    case "LIST<NOTHING>":
      return { keep: false, loss: "empty-list" };
  }
  if (isTemporal(t)) return { keep: true, value: json ?? text, loss: "date" };
  const list = /^LIST<(.*)>$/.exec(t);
  if (list) {
    const element = list[1]!;
    if (element === "STRING" || element === "BOOLEAN") return { keep: true, value: json };
    if (element === "INTEGER") return listElements(text).some(beyond) ? { keep: true, value: listElements(text).map(Number), loss: "integer-beyond-2^53" } : { keep: true, value: json };
    if (element === "FLOAT") {
      const items = listElements(text);
      // a list with any fractional element is written as floats on load; only an all-whole list reads back as integers
      return items.length > 0 && items.every((x) => Number.isInteger(Number(x))) ? { keep: true, value: items.map(Number), loss: "whole-number-float" } : { keep: true, value: json };
    }
    if (isTemporal(element)) return { keep: true, value: json, loss: "date" };
    if (element === "DURATION") return { keep: true, value: json, loss: "duration" };
    if (element === "POINT") return { keep: false, loss: "point" };
  }
  throw new Error(`export cannot read a value of type ${type}`);
}
