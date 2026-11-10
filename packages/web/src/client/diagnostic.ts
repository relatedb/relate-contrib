// The wording for a `failed` status (FR-034): what failed, how often, the engine's text, and a suggestion to
// report it as an issue. It only builds text; nothing is sent anywhere.
export interface DiagnosticLike {
  reason: string;
  failures: number;
  engineError: string | null;
}

const UNCHANGED = "The stored data was not changed.";
const RESET = "Calling resetApplication() discards it and starts again from the seed.";

/** What each application failure means for the visitor's data (ADR-010 2.3, ADR-009 2.4). */
const LIFECYCLE: Record<string, string> = {
  "store-unmarked": `The browser holds data for this application that the page cannot identify (the catalog has no entry for it). ${UNCHANGED} ${RESET}`,
  "store-lost": `The browser's record says this application's stored data was filled, and it is now empty: the data is gone. ${UNCHANGED} ${RESET}`,
  "store-newer": `The browser holds data written by a newer version of this application than this page. ${UNCHANGED} ${RESET}`,
  "import-interrupted": `An import into this application did not finish. ${UNCHANGED} ${RESET}`,
  "store-unreadable": `The browser's stored data for this application could not be opened. ${UNCHANGED} ${RESET}`,
  unavailable: "This browser offers no storage for the application's data, and the application does not run without it.",
  "migration-failed": "Updating the stored data to this version of the application failed. The data is at the last version completed.",
};

export function diagnosticMessage(diagnostic: DiagnosticLike | null, issueUrl?: string): string {
  if (!diagnostic) return "";
  if (diagnostic.reason === "unsupported") {
    return `This browser cannot run the graph (${diagnostic.engineError ?? "unsupported"}).`;
  }
  const lifecycle = LIFECYCLE[diagnostic.reason];
  if (lifecycle) {
    const lines = [lifecycle];
    if (diagnostic.engineError) lines.push(`Details: ${diagnostic.engineError}`);
    return lines.join("\n");
  }
  const attempts = diagnostic.failures === 1 ? "1 attempt" : `${diagnostic.failures} attempts`;
  const lines = [`The graph could not be loaded after ${attempts} (${diagnostic.reason}).`];
  if (diagnostic.engineError) lines.push(`Details: ${diagnostic.engineError}`);
  lines.push(
    issueUrl
      ? `Please report this as an issue at ${issueUrl} and include the details above.`
      : "Please report this as an issue and include the details above.",
  );
  return lines.join("\n");
}
