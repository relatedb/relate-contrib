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
export const STORE_PREFIX = "rel-";

/** Prefix of an application graph's store name; the application's name follows it (ADR-009). */
export const APP_STORE_PREFIX = "app-";

/** An application's name: 1 to 60 characters, so that `app-<name>` stays within the engine's 64 (ADR-009). */
export const APP_NAME_PATTERN = /^[A-Za-z0-9_-]{1,60}$/;

/** The label of the one node that records an application store's format, version and state (ADR-009 2.2). */
export const MARKER_LABEL = "_RelateApplication";

/** The marker format this code writes and understands. */
export const MARKER_FORMAT = 1;

/** Wait between attempts at a store another holder has locked, after the bounded retry (ADR-009 2.4). */
export const WAIT_RETRY_MS = 1000;

/** Directory at the origin-private root that holds the catalog (and, before it, the stored copies of descriptors). */
export const CATALOG_DIR = "relate-web";

/** The catalog file inside {@link CATALOG_DIR} (ADR-010 2.1). */
export const CATALOG_FILE = "catalog.json";

/** The Web Lock that orders every read and write of the catalog: exclusive to write, shared to read (ADR-010 2.2). */
export const CATALOG_LOCK = "relate-web:catalog";

/** The catalog file format this code writes and understands. */
export const CATALOG_FORMAT = 1;

/** The descriptor `id`: 1 to 48 characters from A-Z a-z 0-9 _ - (so the store name stays within 64). */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,48}$/;
