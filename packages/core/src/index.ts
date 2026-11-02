export { createClient } from "./client/client.js";
export type { Client, ClientOptions, Diagnostic, GraphSource, Run } from "./client/types.js";
export type { Events } from "./client/events.js";
export type { Status } from "./client/status.js";
export type { Unsubscribe, Update } from "./client/subscriptions.js";
export { GraphError } from "./errors.js";
export type { Reason } from "./errors.js";
export { validate, validateDescriptor, checkAgreement } from "./validate.js";
export type {
  AgreementResult,
  Descriptor,
  DescriptorValidationResult,
  GraphDocument,
  GraphLink,
  GraphNode,
  IndexSpec,
  Properties,
  PropertyValue,
  ValidationResult,
} from "./validate.js";
