// The public types of the client (specs contracts/client-api.md).
import type { Descriptor, Envelope, GraphDocument, IndexSpec } from "../data/types.js";
import type { ApplicationOptions, ExportEnvelope, LossReport, StorageStatus } from "../application/types.js";
import type { Reason } from "../errors.js";
import type { Events } from "./events.js";
import type { Status } from "./status.js";
import type { Unsubscribe, Update } from "./subscriptions.js";

export type GraphSource =
  /** A descriptor (ADR-003), as data or as a URL; its `data.url` locates the data. Allows a store. */
  | { descriptor: Descriptor | string }
  /** A data document alone, as data or as a URL. No revision, no store; indexes come from the caller. */
  | { document: GraphDocument | string; indexes?: IndexSpec[] };

export interface ClientOptions {
  /** URL of the engine binary, handed to the engine's init (FR-007). */
  engineUrl: string | URL;
  /** The graph to load. Exactly one of `graph` and `application` is given. */
  graph?: GraphSource;
  /** Application mode (ADR-009): one named, durable, versioned graph written by the visitor. */
  application?: ApplicationOptions;
  /** Profile. "client-routing" is `persistent`; "multi-page" is `per-page` (FR-028). */
  navigation: "client-routing" | "multi-page";
  /** Use the store (needs a descriptor, FR-023). Default: false for client-routing, true for multi-page. */
  store?: boolean;
  /** Timeout applied to run() when none is given. Default 10000. */
  visitorTimeoutMs?: number;
  /** Target of the issue link in failure wording (FR-034). */
  issueUrl?: string;
  /** Replace the worker constructor (tests, adapters that must place the worker). */
  workerFactory?: () => Worker;
}

export interface Diagnostic {
  reason:
    | Reason
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
  failures: number;
  engineError: string | null;
}

export interface Run {
  result: Promise<Envelope>;
  stop(): void;
}

export interface Client {
  readonly generation: number;
  readonly status: Status;
  /** Present when status is "failed". */
  readonly diagnostic: Diagnostic | null;
  query(statement: string, params?: object | null, opts?: { timeoutMs?: number }): Promise<Envelope>;
  run(statement: string, params?: object | null, opts?: { timeoutMs?: number }): Run;
  subscribe(statement: string, params: object | null, listener: (update: Update) => void): Unsubscribe;
  onGeneration(listener: (generation: number) => void | Promise<void>): Unsubscribe;
  addScoped(document: GraphDocument, scope: string): Promise<void>;
  dropScope(scope: string): Promise<void>;
  /** Drop every scope this client added (a page leaving). */
  dropAllScopes(): Promise<void>;
  on<E extends keyof Events>(event: E, listener: (payload: Events[E]) => void): Unsubscribe;
  /** What the page can say about whether its data is stored (application mode; otherwise memory-only values). */
  readonly storage: StorageStatus;
  /** Reset the store and seed it again: the only call that discards stored data (application mode). */
  resetApplication(): Promise<void>;
  exportApplication(opts?: { allowLoss?: boolean }): Promise<{ envelope: ExportEnvelope; losses: LossReport }>;
  importApplication(envelope: ExportEnvelope): Promise<void>;
  /** Ask the browser for persistent storage, from a user action. Never called by the core itself. */
  requestPersistence(): Promise<boolean>;
  storageEstimate(): Promise<{ usage: number | null; quota: number | null }>;
  retry(): void;
  failureMessage(): string;
  destroy(): void;
}
