// a rune module shipped as source in a package
export function counter() {
  let n = $state(0);
  return { get n() { return n; }, inc() { n++; } };
}
