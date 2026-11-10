// The stored copy of a descriptor, the file an earlier form of this package kept for each content cache at
// `relate-web/<id>.json` (ADR-003 2.5). The catalog entry replaced it (ADR-010 2.4); the file is only removed, when its
// cache is next opened, so no copy lingers in a visitor's storage.
import { CATALOG_DIR } from "../config.js";

/** Remove `relate-web/<id>.json` if it is there. Absence, or no storage at all, is not an error. */
export async function removeLegacyCopy(id: string): Promise<void> {
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(CATALOG_DIR);
    await dir.removeEntry(`${id}.json`);
  } catch {
    /* there was no copy */
  }
}
