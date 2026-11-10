// Reading and writing the catalog file from a test page, the way a build of the core earlier than the one under test, or
// a visitor's tooling, would see it: the file at relate-web/catalog.json under the Web Lock relate-web:catalog.
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

/** The parsed catalog, or null when there is no file. */
export async function catalogFile(page: Page): Promise<{ format: number; graphs: Record<string, RawEntry> } | null> {
  const text = await catalogText(page);
  return text === null ? null : JSON.parse(text);
}

/** One graph's entry, or undefined. */
export async function entry(page: Page, store: string): Promise<RawEntry | undefined> {
  return (await catalogFile(page))?.graphs[store];
}

/**
 * Change one entry as an earlier run would have left it: merge `patch` into it (an application entry at version 1 is
 * created when there is none), or delete it with `null`.
 */
export async function putEntry(page: Page, store: string, patch: RawEntry | null): Promise<void> {
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

/**
 * Watch the catalog until `store`'s entry is in one of `states`, and end the page's client at that moment, which stops
 * its worker the way a closed tab or a terminated worker does. Resolves to the state seen, or null when it never was.
 */
export function endWhenState(page: Page, store: string, states: string[], timeoutMs = 90_000): Promise<string | null> {
  return page.evaluate(
    async ([s, wanted, timeout]) => {
      const started = performance.now();
      while (performance.now() - started < (timeout as number)) {
        const state = await navigator.locks.request("relate-web:catalog", { mode: "shared" }, async () => {
          try {
            const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle("relate-web");
            const file = JSON.parse(await (await (await dir.getFileHandle("catalog.json")).getFile()).text());
            return (file.graphs[s as string]?.state as string | undefined) ?? null;
          } catch {
            return null;
          }
        });
        if (state && (wanted as string[]).includes(state)) {
          window.client!.destroy();
          return state;
        }
        await new Promise((r) => setTimeout(r, 2));
      }
      return null;
    },
    [store, states, timeoutMs] as const,
  );
}
