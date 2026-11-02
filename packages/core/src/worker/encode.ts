// Writes the parameters of a statement as JSON text. The engine reads a whole number as an integer and a
// number with a decimal point as a float, and rejects a list that mixes the two, so a number array that
// contains any fractional item is written with every item as a float (`1.0`), which JSON.stringify cannot do.

function floatText(n: number): string {
  const s = Object.is(n, -0) ? "-0" : String(n);
  return /[eE.]/.test(s) ? s : `${s}.0`;
}

function numberText(n: number): string {
  if (!Number.isFinite(n)) throw new Error("cannot encode a number that is not finite");
  return String(n);
}

export function encodeParams(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return numberText(value);
    case "object":
      break;
    default:
      throw new Error(`cannot encode a value of type ${typeof value}`);
  }
  if (Array.isArray(value)) {
    const allNumbers = value.length > 0 && value.every((v) => typeof v === "number");
    if (allNumbers && (value as number[]).some((v) => !Number.isInteger(v))) {
      return `[${(value as number[]).map((v) => (numberText(v), floatText(v))).join(",")}]`;
    }
    return `[${value.map(encodeParams).join(",")}]`;
  }
  const parts: string[] = [];
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${encodeParams(v)}`);
  }
  return `{${parts.join(",")}}`;
}
