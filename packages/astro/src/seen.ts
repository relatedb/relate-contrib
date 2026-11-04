// The inline graph names used so far on each page being rendered, keyed by the page's request.
const names = new WeakMap<object, Set<string>>();

export const seenOn = (request: object): Set<string> => {
  let set = names.get(request);
  if (!set) names.set(request, (set = new Set()));
  return set;
};
