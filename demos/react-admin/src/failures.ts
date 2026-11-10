// What the demo says for each reason the core's client can fail an application graph with (FR-025), and what it offers.
// The only choice is a confirmed reset. An export is not offered: the core's exportApplication() rejects once a client
// has failed, so there is no way to copy the data out from here (the reset control offers one while the data is open).

export const FAILURE_REASONS = ["store-newer", "store-lost", "store-unmarked", "store-unreadable", "import-interrupted", "migration-failed"] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export type Choice = "reset";

export interface FailureInfo {
  title: string;
  explanation: string;
  /** What the one choice does to the stored data. */
  consequence: string;
  choices: readonly Choice[];
}

const RESET = "Resetting discards the stored data and loads the demo data again.";

const TABLE: Record<FailureReason, { title: string; explanation: string; consequence?: string }> = {
  "store-newer": {
    title: "This data was written by a newer version",
    explanation: "The records stored in this browser were written by a newer version of the demo than the one running now. It has not opened them, so that it cannot damage them.",
  },
  "store-lost": {
    title: "The stored data is gone",
    explanation: "This browser recorded that your records were stored, but the data is no longer there. Clearing site data or the browser freeing space can do this.",
  },
  "store-unmarked": {
    title: "Data this demo did not record",
    explanation: "This browser holds data under the demo's name that the demo has no record of creating, or whose record was removed. It has not opened it.",
  },
  "store-unreadable": {
    title: "The stored data could not be read",
    explanation: "The stored records, or the browser's record of what is stored, could not be read. Resetting also clears this origin's record of stored graphs.",
  },
  "import-interrupted": {
    title: "An import did not finish",
    explanation: "An import of records was interrupted, so the stored data may be incomplete. It has not been opened.",
  },
  "migration-failed": {
    title: "Moving the data to this version failed",
    explanation: "Bringing the stored records up to this version stopped part-way. They are left at the last version that completed.",
  },
};

export function failureInfo(reason: string): FailureInfo {
  const known = (TABLE as Record<string, { title: string; explanation: string; consequence?: string }>)[reason];
  if (known) return { title: known.title, explanation: known.explanation, consequence: known.consequence ?? RESET, choices: ["reset"] };
  return {
    title: "The stored data could not be opened",
    explanation: `The demo could not open the records stored in this browser (reason: ${reason}).`,
    consequence: RESET,
    choices: ["reset"],
  };
}
