// Checks the `application` option when the client is created (ADR-009 2.1). Throws an Error naming the field and
// the rule, before anything is started.
import { APP_NAME_PATTERN } from "../config.js";
import { inRanges } from "./ranges.js";
import type { ApplicationOptions, MigrationStep } from "./types.js";

export interface NormalisedApplication extends Required<Pick<ApplicationOptions, "name" | "version" | "seed">> {
  indexes: NonNullable<ApplicationOptions["indexes"]>;
  migrations: Record<string, MigrationStep[]>;
  onUnavailable: "memory" | "fail";
  onError: "fail" | "memory";
  whenLocked: "wait" | "memory";
}

const oneOf = <T extends string>(field: string, value: unknown, allowed: readonly T[], fallback: T): T => {
  if (value === undefined) return fallback;
  if (!allowed.includes(value as T)) throw new Error(`application.${field} must be ${allowed.map((a) => `"${a}"`).join(" or ")}`);
  return value as T;
};

export function validateApplication(options: ApplicationOptions): NormalisedApplication {
  if (options === null || typeof options !== "object") throw new Error("application must be an object");
  const { name, version, seed } = options;
  if (typeof name !== "string" || !APP_NAME_PATTERN.test(name)) {
    throw new Error(`application.name must match ${APP_NAME_PATTERN.source} (1 to 60 letters, digits, dash or underscore)`);
  }
  if (!Number.isInteger(version) || version < 1) throw new Error("application.version must be a positive integer");
  if (seed === undefined || seed === null || seed === "") throw new Error("application.seed is required: a graph data document, a descriptor or a URL");

  const migrations: Record<string, MigrationStep[]> = {};
  const given = options.migrations ?? {};
  const keys = Object.keys(given).map((k) => {
    if (!/^\d+$/.test(k)) throw new Error(`application.migrations key "${k}" must be a version number`);
    return Number(k);
  });
  for (const key of keys) {
    if (key < 2) throw new Error(`application.migrations has an entry for version ${key}; the first version is the seed, so entries start at 2`);
    if (key > version) throw new Error(`application.migrations has an entry for version ${key}, above the application's version ${version}`);
  }
  keys.sort((a, b) => a - b);
  keys.forEach((key, i) => {
    if (key !== i + 2) throw new Error(`application.migrations must be consecutive from 2; version ${i + 2} is missing before ${key}`);
  });
  for (const key of keys) {
    const steps = given[key];
    if (!Array.isArray(steps) || steps.length === 0) throw new Error(`application.migrations[${key}] must be a non-empty list of statements`);
    migrations[String(key)] = steps.map((step, i) => {
      if (typeof step === "string") return step;
      if (step && typeof step === "object" && step.kind === "ranges") return inRanges(step); // re-checks a step built by hand
      throw new Error(`application.migrations[${key}][${i}] must be a statement or a step made by inRanges`);
    });
  }

  return {
    name,
    version,
    seed,
    indexes: options.indexes ?? [],
    migrations,
    onUnavailable: oneOf("onUnavailable", options.onUnavailable, ["memory", "fail"], "memory"),
    onError: oneOf("onError", options.onError, ["fail", "memory"], "fail"),
    whenLocked: oneOf("whenLocked", options.whenLocked, ["wait", "memory"], "wait"),
  };
}
