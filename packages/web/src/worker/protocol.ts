// Messages between a client and its worker. Not public API. See specs/001-core-package/contracts/worker-protocol.md.
import type { Descriptor, GraphDocument, IndexSpec } from "../data/types.js";

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

export type ClientMessage = InitMessage | QueryMessage | ScopedAddMessage | ScopedDropMessage;

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
  | "store";

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
  reason: "trap" | "invalid-document";
  message: string;
}

export type WorkerMessage =
  | ReadyMessage
  | InitFailedMessage
  | StoreRetryMessage
  | ResultMessage
  | DoneMessage
  | ErrorMessage;
