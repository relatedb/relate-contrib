// Wrapper around the engine's browser build. It keeps the engine's result text unaltered, marks the instance
// dead at the first trap (the engine's own classifier misses the second error a dead instance throws), and
// answers every later call as a trap.
import init, { CypherliteDb } from "@neo4j-labs/cypherlite-wasm";
import { isWasmTrap } from "@neo4j-labs/cypherlite-wasm/trap.js";
import { STORE_PREFIX } from "../config.js";

export class TrapError extends Error {
  constructor(message = "the instance is unusable after a trap") {
    super(message);
    this.name = "TrapError";
  }
}

/** The store is held by another worker or tab (the engine reports `storage locked`). */
export class StorageLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLockedError";
  }
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class Engine {
  private dead = false;

  private constructor(private readonly db: CypherliteDb) {}

  /** Initialise the engine's WebAssembly module from its binary's URL. Call once per worker. */
  static async load(engineUrl: string): Promise<void> {
    await init({ module_or_path: engineUrl });
  }

  static memory(): Engine {
    return new Engine(new CypherliteDb());
  }

  /** Open the durable store `rel-<id>`. Works only in a dedicated worker. */
  static async store(id: string): Promise<Engine> {
    try {
      return new Engine(await CypherliteDb.open(`opfs://${STORE_PREFIX}${id}`));
    } catch (e) {
      if (/storage locked/i.test(messageOf(e))) throw new StorageLockedError(messageOf(e));
      throw e;
    }
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Run one statement. Returns the envelope text unaltered. Throws TrapError once the instance has trapped. */
  execute(statement: string, paramsJson: string | null = null): string {
    return this.guard(() => this.db.execute(statement, paramsJson));
  }

  /** Drop the database; for a store this wipes it and reopens it. */
  reset(): void {
    this.guard(() => this.db.reset());
  }

  private guard<T>(call: () => T): T {
    if (this.dead) throw new TrapError();
    try {
      return call();
    } catch (e) {
      if (isWasmTrap(e)) {
        this.dead = true;
        throw new TrapError(messageOf(e));
      }
      throw e;
    }
  }
}
