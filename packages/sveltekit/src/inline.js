// Finding an inline graph in the document (spec FR-018, FR-021): the only element for an id, else the first whose parent element is visible.

/**
 * @param {Element} el
 * @returns {boolean}
 */
const visible = (el) => {
  const parent = el.parentElement;
  if (!parent) return false;
  // `checkVisibility` reports a parent hidden by `display: none` (Chromium, Firefox and WebKit implement it).
  return typeof parent.checkVisibility === "function" ? parent.checkVisibility() : true;
};

/**
 * @param {string} id
 * @param {ParentNode} [root]
 * @returns {{ element: Element, document: unknown, indexes: Array<{ label: string, property: string }> } | null}
 */
export function findInline(id, root = document) {
  const matches = Array.from(root.querySelectorAll('script[type="application/json"][data-relate-graph]')).filter((el) => el.getAttribute("data-relate-graph") === id);
  const element = matches.length === 1 ? matches[0] : matches.find(visible);
  if (!element) return null;
  const payload = /** @type {{ document: unknown, config?: { indexes?: Array<{ label: string, property: string }> } }} */ (JSON.parse(element.textContent ?? "{}"));
  return { element, document: payload.document, indexes: payload.config?.indexes ?? [] };
}
