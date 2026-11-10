// Setting up what the origin's private storage holds before the demo starts, from the blank page: the catalog file and
// the store as an earlier run, a newer version or a damaged file would have left them, so a failure can be forced.
// (Modelled on packages/web/tests/catalog/browser/catalog-file.ts; the file is relate-web/catalog.json under the Web
// Lock relate-web:catalog.)
import type { Page } from "@playwright/test";

export interface RawEntry {
  kind?: string;
  name?: string;
  state?: string;
  version?: number;
  target?: number;
  seeded?: boolean;
  revision?: string;
  updatedAt?: string;
}

/** The store the demo's application graph lives in (src/main.tsx). */
export const STORE = "app-react-admin-demo";

/** Open the blank page: same origin as the demo, no client. */
export async function openBlank(page: Page): Promise<void> {
  await page.goto("/blank.html");
}

/** The catalog file's text, or null when there is none. */
export function catalogText(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    navigator.locks.request("relate-web:catalog", { mode: "shared" }, async () => {
      try {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web");
        return await (await (await dir.getFileHandle("catalog.json")).getFile()).text();
      } catch {
        return null;
      }
    }),
  );
}

export async function catalogFile(page: Page): Promise<{ format: number; graphs: Record<string, RawEntry> } | null> {
  const text = await catalogText(page);
  return text === null ? null : JSON.parse(text);
}

export async function entry(page: Page, store = STORE): Promise<RawEntry | undefined> {
  return (await catalogFile(page))?.graphs[store];
}

/** Change one entry as an earlier run would have left it: merge `patch` into it, or delete it with `null`. */
export async function putEntry(page: Page, patch: RawEntry | null, store = STORE): Promise<void> {
  await page.evaluate(
    ([s, p]) =>
      navigator.locks.request("relate-web:catalog", { mode: "exclusive" }, async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web", { create: true });
        let file: { format: number; graphs: Record<string, Record<string, unknown>> } = { format: 1, graphs: {} };
        try {
          file = JSON.parse(await (await (await dir.getFileHandle("catalog.json")).getFile()).text());
        } catch {
          /* no file yet */
        }
        const now = new Date().toISOString();
        if (p === null) delete file.graphs[s as string];
        else file.graphs[s as string] = { kind: "application", name: (s as string).slice(4), version: 1, seeded: true, ...file.graphs[s as string], ...(p as object), updatedAt: now };
        const writable = await (await dir.getFileHandle("catalog.json", { create: true })).createWritable();
        await writable.write(JSON.stringify(file));
        await writable.close();
      }),
    [store, patch] as const,
  );
}

/** Replace the whole file with `text` (a damaged file, a file of another format). */
export async function writeCatalogText(page: Page, text: string): Promise<void> {
  await page.evaluate(
    (t) =>
      navigator.locks.request("relate-web:catalog", { mode: "exclusive" }, async () => {
        const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web", { create: true });
        const writable = await (await dir.getFileHandle("catalog.json", { create: true })).createWritable();
        await writable.write(t);
        await writable.close();
      }),
    text,
  );
}

/** Remove the engine's store directory for the demo's graph, leaving the catalog as it is (a store whose data is gone). */
export async function removeStoreDirectory(page: Page, store = STORE): Promise<void> {
  await page.evaluate(async (s) => {
    const root = await navigator.storage.getDirectory();
    const base = await root.getDirectoryHandle("relate");
    await base.removeEntry(s, { recursive: true });
  }, store);
}
