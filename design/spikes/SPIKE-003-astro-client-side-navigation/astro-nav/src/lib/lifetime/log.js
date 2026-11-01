// Experiment log: one entry per arrival at a page. Kept in sessionStorage so it
// survives full page loads, and mirrored on window for the measuring script.
export function record(entry) {
  const full = {t: Math.round(performance.now()), ...entry};
  try {
    const log = JSON.parse(sessionStorage.getItem("lifetime.log") ?? "[]");
    log.push(full);
    sessionStorage.setItem("lifetime.log", JSON.stringify(log));
  } catch {
    // storage blocked: the entry only lives on window
  }
  (window.__lifetimeLog ??= []).push(full);
}

export const readLog = () => JSON.parse(sessionStorage.getItem("lifetime.log") ?? "[]");
export const clearLog = () => sessionStorage.removeItem("lifetime.log");
