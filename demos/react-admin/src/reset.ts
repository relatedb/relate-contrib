import { resetCatalog, type Client } from "@relate/web";

/**
 * Discard the stored records and load the demo data again. A catalog file that does not parse is never written over,
 * so `resetApplication()` cannot recover from it; the documented way out is `resetCatalog()`, after which the store
 * has data and no record and a reset can take it over. That clears this origin's record of every stored graph.
 */
export async function resetDemo(client: Client): Promise<void> {
  try {
    await client.resetApplication();
  } catch (first) {
    if (client.diagnostic?.reason !== "store-unreadable") throw first;
    await resetCatalog();
    await client.resetApplication();
  }
}

/** Save a value as a JSON file the visitor can keep. */
export function saveJson(fileName: string, value: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
