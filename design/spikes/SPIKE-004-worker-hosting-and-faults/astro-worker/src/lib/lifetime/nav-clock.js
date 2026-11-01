// Milliseconds (performance.now clock) at which the current navigation began.
// Full page loads start at 0; client-side navigations start at the router's
// before-preparation event.
let start = 0;
if (typeof document !== "undefined") {
  document.addEventListener("astro:before-preparation", () => {
    start = performance.now();
  });
}
export const navStart = () => start;
