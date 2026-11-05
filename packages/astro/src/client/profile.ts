// The development-time check that the configured navigation setting agrees with the router (spec FR-026). The router
// marks a page that has it with a meta tag; nothing here runs in a production build.
import { navigation } from "virtual:relate-web/config";
import { profileWarning } from "./warning.js";

let checked = false;

/** Warn once, in development only. */
export function checkProfile(): void {
  if (checked || !import.meta.env.DEV) return;
  checked = true;
  const warning = profileWarning(navigation, document.querySelector('meta[name="astro-view-transitions-enabled"]') !== null);
  if (warning) console.warn(warning);
}
