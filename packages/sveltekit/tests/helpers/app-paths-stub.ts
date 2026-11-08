// Stands in for SvelteKit's `$app/paths` in unit tests: `resolve` returns the path with a recorded prefix.
export const state = { base: "" };
export const resolve = (path: string): string => `${state.base}${path}`;
