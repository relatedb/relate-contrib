// The release gate's proof that the whole test suite passed on the commit being released (ADR-013 2.6, amended 2026-11-19). The
// `full` workflow runs every package's browser, conformance and traceability checks on each push to the main branch; a release
// does not run them again but asks the repository host whether `full` finished with success on this exact commit. A run that is
// missing, still running, or not successful stops the release, and so does a failure to ask.
import { fileURLToPath } from "node:url";

export type FullVerdict =
  | { ok: true; runUrl: string }
  | { ok: false; reason: "not-run" | "in-progress" | "failed" | "unreachable"; detail: string };

interface Run { status: string; conclusion: string | null; html_url: string; head_sha: string }

export async function verifyFull(opts: { repository: string; sha: string; token?: string; workflow?: string; apiUrl?: string; fetchImpl?: typeof fetch }): Promise<FullVerdict> {
  const { repository, sha, token, workflow = "full.yml", apiUrl = "https://api.github.com", fetchImpl = fetch } = opts;
  const url = `${apiUrl}/repos/${repository}/actions/workflows/${workflow}/runs?head_sha=${sha}&per_page=50`;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch (err) {
    return { ok: false, reason: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) return { ok: false, reason: "unreachable", detail: `the repository host answered ${res.status}` };
  let runs: Run[];
  try {
    runs = ((await res.json()) as { workflow_runs?: Run[] }).workflow_runs ?? [];
  } catch (err) {
    return { ok: false, reason: "unreachable", detail: `the answer could not be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  runs = runs.filter((r) => r.head_sha === sha);
  const passed = runs.find((r) => r.status === "completed" && r.conclusion === "success");
  if (passed) return { ok: true, runUrl: passed.html_url };
  if (runs.length === 0) return { ok: false, reason: "not-run", detail: `no ${workflow} run on commit ${sha}; wait for the run on the main branch, or start it by hand` };
  if (runs.some((r) => r.status !== "completed")) return { ok: false, reason: "in-progress", detail: `${workflow} is still running on commit ${sha}` };
  return { ok: false, reason: "failed", detail: `${workflow} did not pass on commit ${sha}: ${runs.map((r) => `${r.conclusion} (${r.html_url})`).join(", ")}` };
}

async function main(): Promise<void> {
  const repository = process.env["GITHUB_REPOSITORY"];
  const sha = process.env["GITHUB_SHA"];
  if (!repository || !sha) {
    console.error("verify-full: GITHUB_REPOSITORY and GITHUB_SHA are required");
    process.exit(2);
  }
  const v = await verifyFull({ repository, sha, token: process.env["GITHUB_TOKEN"] });
  if (v.ok) console.log(`full passed on ${sha}: ${v.runUrl}`);
  else {
    console.error(`full has not passed on this commit (${v.reason}): ${v.detail}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
