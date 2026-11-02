// Experiment settings kept for the tab: ?graph=/synthetic/graph-1000.json and ?vt=0
// (vt=0: the harness removes document.startViewTransition, see Survival.astro).
export function readConfig() {
  const config = {graph: "/synthetic/graph-1000.json"};
  try {
    const query = new URLSearchParams(location.search);
    for (const key of ["graph"]) {
      const value = query.get(key) ?? sessionStorage.getItem(`survival.${key}`);
      if (value != null) {
        config[key] = value;
        sessionStorage.setItem(`survival.${key}`, value);
      }
    }
  } catch {}
  return config;
}
