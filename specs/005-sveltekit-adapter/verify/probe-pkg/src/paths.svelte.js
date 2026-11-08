// a helper compiled by the site's build that builds a location with the site's base path (plain JavaScript: see research V-4)
import { resolve } from "$app/paths";
/** @param {string} id @returns {string} */
export const locationOf = (id) => /** @type {(p: string) => string} */ (/** @type {unknown} */ (resolve))(`/relate/${id}/descriptor.json`);
