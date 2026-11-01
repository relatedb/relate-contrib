// Per-tab experiment settings. They come from the query string on first use and
// are kept in sessionStorage so client-side navigation (which drops the query)
// and multi-page navigation both see the same values.
const KEYS = ["graph", "fail", "variant", "workerName"];
const DEFAULTS = {graph: "/graph.json", fail: "0", variant: "safe", workerName: "graph"};

export function readConfig() {
  const config = {...DEFAULTS};
  try {
    const query = new URLSearchParams(location.search);
    for (const key of KEYS) {
      const value = query.get(key) ?? sessionStorage.getItem(`lifetime.${key}`);
      if (value != null) {
        config[key] = value;
        sessionStorage.setItem(`lifetime.${key}`, value);
      }
    }
  } catch {
    // storage blocked: defaults apply
  }
  return config;
}
