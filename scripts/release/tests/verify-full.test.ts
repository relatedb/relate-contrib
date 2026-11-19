// covers-rel: FR-014
import { describe, expect, it } from "vitest";
import { verifyFull } from "../verify-full.js";

const SHA = "a".repeat(40);
const answer = (runs: unknown[], status = 200): typeof fetch => (async () => new Response(JSON.stringify({ workflow_runs: runs }), { status })) as typeof fetch;
const run = (status: string, conclusion: string | null, sha = SHA) => ({ status, conclusion, html_url: `https://example.test/run/${status}-${conclusion}`, head_sha: sha });
const ask = (fetchImpl: typeof fetch) => verifyFull({ repository: "relatedb/relate-contrib", sha: SHA, fetchImpl });

describe("the proof that the full suite passed on the commit being released", () => {
  it("accepts a completed, successful run on this commit, even beside a failed one", async () => {
    expect(await ask(answer([run("completed", "failure"), run("completed", "success")]))).toMatchObject({ ok: true });
  });
  it("refuses when there is no run on this commit, naming how to get one", async () => {
    expect(await ask(answer([]))).toMatchObject({ ok: false, reason: "not-run" });
    expect(await ask(answer([run("completed", "success", "b".repeat(40))]))).toMatchObject({ ok: false, reason: "not-run" });
  });
  it("refuses a run that is still going, and one that failed or was cancelled", async () => {
    expect(await ask(answer([run("in_progress", null)]))).toMatchObject({ ok: false, reason: "in-progress" });
    expect(await ask(answer([run("completed", "failure")]))).toMatchObject({ ok: false, reason: "failed" });
    expect(await ask(answer([run("completed", "cancelled")]))).toMatchObject({ ok: false, reason: "failed" });
  });
  it("never takes a failure to ask for an answer", async () => {
    expect(await ask(answer([], 500))).toMatchObject({ ok: false, reason: "unreachable" });
    expect(await ask((async () => { throw new Error("offline"); }) as typeof fetch)).toMatchObject({ ok: false, reason: "unreachable" });
  });
  it("asks for the run of this commit only", async () => {
    let asked = "";
    await ask((async (u: string) => { asked = u; return new Response("{}"); }) as unknown as typeof fetch);
    expect(asked).toContain(`head_sha=${SHA}`);
    expect(asked).toContain("/workflows/full.yml/runs");
  });
});
