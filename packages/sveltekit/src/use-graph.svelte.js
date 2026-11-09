// The helpers (spec FR-017, FR-022, FR-023, FR-025). They are called while a component initializes and touch the instance only in the
// browser, after mount: an `$effect` runs only there, acquires the graph, and releases it in its cleanup, and runs again when the id it
// reads changes. On the server and in the first browser render they return the same empty values, so the markup matches.
import { getConfig, mountedConfig } from "./context.js";
import { hold, visitGraph } from "./registry.js";

/**
 * @typedef {import("@relate/web").Client} Client
 * @typedef {import("./registry.js").GraphOptions} GraphOptions
 * @template T @typedef {T | (() => T)} Reactive
 */

/** @template T @param {Reactive<T>} value @returns {T} */
const read = (value) => (typeof value === "function" ? /** @type {() => T} */ (value)() : value);

/**
 * @param {Reactive<string>} id
 * @param {GraphOptions} [options]
 * @returns {{ readonly client: Client | null }}
 */
export function useGraph(id, options) {
  const config = getConfig();
  const name = typeof id === "function" ? "(reactive id)" : id;
  if (!config) throw new Error(`@relate/sveltekit: useGraph("${name}") was used outside RelateProvider`);
  /** @type {Client | null} */
  let client = $state(null);
  $effect(() => {
    const held = hold(config, read(id), options);
    client = held.client;
    return () => {
      held.release();
      client = null;
    };
  });
  return {
    get client() {
      return client;
    },
  };
}

const IDLE = { status: /** @type {import("@relate/web").Status | "idle"} */ ("idle"), rows: /** @type {Array<Record<string, unknown>> | null} */ (null), error: /** @type {string | null} */ (null), generation: 0 };

/**
 * @param {Reactive<string>} id
 * @param {Reactive<string>} statement
 * @param {Reactive<object | null | undefined>} [params]
 * @param {GraphOptions} [options]
 * @returns {{ readonly status: import("@relate/web").Status | "idle", readonly rows: Array<Record<string, unknown>> | null, readonly error: string | null, readonly generation: number }}
 */
export function useQuery(id, statement, params, options) {
  const graph = useGraph(id, options);
  let result = $state(IDLE);
  $effect(() => {
    const client = graph.client;
    if (!client) return;
    const off = client.subscribe(read(statement), read(params) ?? null, (u) => {
      result = { status: u.status, rows: u.rows ?? null, error: u.error ?? null, generation: u.generation };
    });
    return () => {
      off();
      result = IDLE;
    };
  });
  return {
    get status() {
      return result.status;
    },
    get rows() {
      return result.rows;
    },
    get error() {
      return result.error;
    },
    get generation() {
      return result.generation;
    },
  };
}

/**
 * The client of a visit-lifetime registered graph, for code that lives across pages. Throws for a page-lifetime or inline graph and for an unknown id.
 * @param {string} id
 * @param {GraphOptions} [options]
 * @returns {Client}
 */
export function graph(id, options) {
  return visitGraph(mountedConfig(), id, options);
}
