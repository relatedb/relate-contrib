// Finding an inline graph in the document (spec FR-018, FR-021; research D-4). A router that keeps a departed page hidden
// leaves that page's element in the document, so several elements may carry one name: the only one is taken, otherwise the
// first whose parent element is visible.
import type { IndexSpec } from "@relate/web/validate";

export interface InlineFound {
  element: Element;
  document: unknown;
  indexes: IndexSpec[];
}

const visible = (el: Element): boolean => {
  const parent = el.parentElement;
  if (!parent) return false;
  // `checkVisibility` reports a parent hidden by `display: none` (Chromium, Firefox and WebKit all implement it).
  return typeof parent.checkVisibility === "function" ? parent.checkVisibility() : true;
};

export function findInline(name: string, root: ParentNode = document): InlineFound | null {
  const matches = Array.from(root.querySelectorAll('script[type="application/json"][data-relate-graph]')).filter((el) => el.getAttribute("data-relate-graph") === name);
  const element = matches.length === 1 ? matches[0] : matches.find(visible);
  if (!element) return null;
  const payload = JSON.parse(element.textContent ?? "{}") as { document: unknown; config?: { indexes?: IndexSpec[] } };
  return { element, document: payload.document, indexes: payload.config?.indexes ?? [] };
}
