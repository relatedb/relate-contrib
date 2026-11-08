// Which builds of the conformance site a spec runs against: those named by REL_ONLY (default: all) that also satisfy the spec's own
// condition. One place, so a new kind of build is a change here and not in every spec.
import { BUILDS } from "../../playwright.config.js";

type Build = (typeof BUILDS)[number];

const only = process.env.REL_ONLY?.split(",");

/** Every build in the default run, minus the development server and the base-path build; `extra` narrows or widens that. */
export function builds(options: { dev?: boolean; base?: boolean; where?: (b: Build) => boolean } = {}): Build[] {
  return BUILDS.filter((b) => (!only || only.includes(b.name)) && (options.dev ? b.dev : !b.dev) && (options.base ? true : !b.base) && (options.where?.(b) ?? true));
}

export const selected = (name: string): boolean => !only || only.includes(name);
export const origin = (b: Build): string => `http://127.0.0.1:${b.port}${b.base ?? ""}`;
