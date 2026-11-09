// A registered graph's descriptor location, built with the site's base path (ADR-007 §2.2, research V-1). Called only after mount: the
// server render gets a path relative to the page, which is never fetched.
import { resolve } from "$app/paths";

/**
 * @param {string} id
 * @returns {string}
 */
export const descriptorLocation = (id) => /** @type {(path: string) => string} */ (/** @type {unknown} */ (resolve))(`/relate/${id}/descriptor.json`);
