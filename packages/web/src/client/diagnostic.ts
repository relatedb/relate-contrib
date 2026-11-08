// The wording for a `failed` status (FR-034): what failed, how often, the engine's text, and a suggestion to
// report it as an issue. It only builds text; nothing is sent anywhere.
export interface DiagnosticLike {
  reason: string;
  failures: number;
  engineError: string | null;
}

export function diagnosticMessage(diagnostic: DiagnosticLike | null, issueUrl?: string): string {
  if (!diagnostic) return "";
  if (diagnostic.reason === "unsupported") {
    return `This browser cannot run the graph (${diagnostic.engineError ?? "unsupported"}).`;
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
