// Defaults and limits fixed by ADR-001 and ADR-003; see specs/001-core-package/research.md.

/** Consecutive attempts that fail to reach `ready` before the status becomes `failed` (ADR-001). */
export const FAILURE_LIMIT = 3;

/** Retry schedule for a store another holder has locked (ADR-001): first wait, longest wait, total budget. */
export const STORE_RETRY = { initialMs: 100, maxMs: 500, totalMs: 5000 } as const;

/** Rows per loader statement (the engine's own bulk batch size, ADR-0155 in its repository). */
export const BATCH_SIZE = 1000;

/** Timeout applied to a visitor-supplied statement when none is given. */
export const VISITOR_TIMEOUT_MS = 10_000;

/** Prefix of a store's name; the descriptor `id` follows it (ADR-003). */
export const STORE_PREFIX = "gw-";

/** Directory at the origin-private root that holds the stored copy of each descriptor. */
export const STORED_COPY_DIR = "graph-web";

/** The descriptor `id`: 1 to 48 characters from A-Z a-z 0-9 _ - (so the store name stays within 64). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
