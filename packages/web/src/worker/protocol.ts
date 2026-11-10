// Messages between a client and its worker. Not public API. See specs/001-core-package/contracts/worker-protocol.md.
import type { ExportEnvelope, LossReport, MigrationStep } from "../application/types.js";
import type { Descriptor, GraphDocument, IndexSpec } from "../data/types.js";

/** The application half of an init message (ADR-009); everything in it is plain data. */
export interface ApplicationInit {
  name: string;
  version: number;
  /** `reset` is `resetApplication()`: open the store, reset it and seed it. */
  intent: "open" | "reset";
  /**
   * The seed. `document`: inline data. `descriptor` with `dataUrl`: an inline descriptor whose data the worker fetches when
   * needed. `url`: an absolute URL of a document or a descriptor, fetched by the worker only when the store needs a seed.
   */
  seed: { document: GraphDocument | null; dataUrl: string | null; descriptor: Descriptor | null; url: string | null };
  indexes: IndexSpec[];
  migrations: Record<string, MigrationStep[]>;
  onUnavailable: "memory" | "fail";
  onError: "fail" | "memory";
  whenLocked: "wait" | "memory";
}

export interface InitMessage {
  type: "init";
  engineUrl: string;
  descriptor: Descriptor | null;
  /** Absolute URL of the data document when the graph has a descriptor or was given as a URL. */
  dataUrl: string | null;
  /** An inline data document, when the graph was given as data. */
  document: GraphDocument | null;
  /** Used only when there is no descriptor. */
  indexes: IndexSpec[];
  useStore: boolean;
  /** Present in application mode, where the descriptor, dataUrl, document and useStore fields are unused. */
  application?: ApplicationInit;
  attempt: number;
}

export interface QueryMessage {
  type: "query";
  id: number;
  statement: string;
  paramsJson: string | null;
}

export interface ScopedAddMessage {
  type: "scoped-add";
  id: number;
  scope: string;
  document: GraphDocument;
}

export interface ScopedDropMessage {
  type: "scoped-drop";
  id: number;
  scope: string;
}

export interface ExportApplicationMessage {
  type: "export-application";
  id: number;
  allowLoss: boolean;
}

export interface ImportApplicationMessage {
  type: "import-application";
  id: number;
  envelope: ExportEnvelope;
}

export type ClientMessage =
  | InitMessage
  | QueryMessage
  | ScopedAddMessage
  | ScopedDropMessage
  | ExportApplicationMessage
  | ImportApplicationMessage;

export interface Timings {
  init?: number;
  open?: number;
  load?: number;
  restore?: number;
  total: number;
}

export interface ReadyMessage {
  type: "ready";
  restored: boolean;
  timings: Timings;
}

export type InitFailReason =
  | "trap"
  | "unsupported"
  | "worker-error"
  | "invalid-document"
  | "invalid-descriptor"
  | "mismatch"
  | "store"
  | "store-unmarked"
  | "store-newer"
  | "import-interrupted"
  | "store-lost"
  | "store-unreadable"
  | "unavailable"
  | "migration-failed";

export interface InitFailedMessage {
  type: "init-failed";
  reason: InitFailReason;
  message: string;
}

export interface StoreRetryMessage {
  type: "store-retry";
  attempt: number;
  waitMs: number;
}

/** The worker's storage state changed (application mode). `persisted` is added by the page. */
export interface StorageMessage {
  type: "storage";
  kind: "durable" | "memory" | "waiting";
  reason?: "unavailable" | "locked" | "error";
}

/** Answers an export-application: the envelope is null when losses exist and they were not allowed. */
export interface ApplicationExportedMessage {
  type: "application-exported";
  id: number;
  envelope: ExportEnvelope | null;
  losses: LossReport;
}

export interface ResultMessage {
  type: "result";
  id: number;
  /** The engine's envelope as text; the client parses it and changes nothing. */
  envelopeText: string;
}

/** Acknowledges a scoped-add or scoped-drop. */
export interface DoneMessage {
  type: "done";
  id: number;
}

export interface ErrorMessage {
  type: "error";
  id: number;
  reason: "trap" | "invalid-document" | "rejected" | "migration-failed";
  message: string;
}

export type WorkerMessage =
  | ReadyMessage
  | InitFailedMessage
  | StoreRetryMessage
  | StorageMessage
  | ApplicationExportedMessage
  | ResultMessage
  | DoneMessage
  | ErrorMessage;
