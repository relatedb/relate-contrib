// A minimal client-side router for the harness site and the example site: the history API, link interception
// and programmatic navigation, with arrival and departure hooks (ADR-001 2.3).
export interface Router {
  navigate(href: string): void;
  readonly current: URL;
}

export function startRouter(hooks: { onArrive(url: URL): void; onDepart(url: URL): void }): Router {
  let current = new URL(location.href);
  const go = (next: URL, push: boolean): void => {
    hooks.onDepart(current);
    if (push) history.pushState({}, "", next);
    current = new URL(location.href);
    hooks.onArrive(current);
  };
  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.("a[data-route]") as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    go(new URL(a.href, location.href), true);
  });
  window.addEventListener("popstate", () => go(new URL(location.href), false));
  hooks.onArrive(current);
  return {
    navigate: (href) => go(new URL(href, location.href), true),
    get current() {
      return current;
    },
  };
}
