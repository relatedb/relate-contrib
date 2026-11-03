// The Node-only entry (`related-web-core/validate`): validators for build steps. No browser APIs.
export { validate } from "./data/validate.js";
export type { ValidationResult } from "./data/validate.js";
export { validateDescriptor, checkAgreement } from "./data/descriptor.js";
export type { DescriptorValidationResult, AgreementResult } from "./data/descriptor.js";
export type { Descriptor, GraphDocument, GraphLink, GraphNode, IndexSpec, Properties, PropertyValue } from "./data/types.js";
