// Under `cacheComponents` the router keeps a departed page in the document, hidden, so a selector may match elements of
// more than one page. The probes write to the one the visitor can see.
export function visible(selector: string): Element | null {
  const all = Array.from(document.querySelectorAll(selector));
  return all.find((el) => el.checkVisibility()) ?? all[0] ?? null;
}
