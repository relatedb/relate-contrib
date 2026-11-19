// Ask a package registry for the versions of a package (ADR-013 2.2). The address is a parameter so that a test can use a
// stand-in; `unreachable` is told apart from `absent`, so that a failure to ask is never taken for an answer.
export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

export type Versions =
  | { status: "ok"; versions: string[]; deprecated: string[] }
  | { status: "absent" }
  | { status: "unreachable"; detail: string };

export async function fetchVersions(name: string, registry: string = DEFAULT_REGISTRY, fetchImpl: typeof fetch = fetch): Promise<Versions> {
  const url = `${registry.replace(/\/$/, "")}/${name.replace("/", "%2F")}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: "application/vnd.npm.install-v1+json, application/json" } });
  } catch (err) {
    return { status: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  }
  if (res.status === 404) return { status: "absent" };
  if (!res.ok) return { status: "unreachable", detail: `the registry answered ${res.status}` };
  try {
    const body = (await res.json()) as { versions?: Record<string, { deprecated?: string }> };
    const all = body.versions ?? {};
    return { status: "ok", versions: Object.keys(all), deprecated: Object.entries(all).filter(([, v]) => v.deprecated).map(([k]) => k) };
  } catch (err) {
    return { status: "unreachable", detail: `the registry's answer could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
}
