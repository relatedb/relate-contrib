// Wrapper around the engine's browser build. It keeps the engine's result text unaltered, marks the instance
// dead at the first trap (the engine's own classifier misses the second error a dead instance throws), and
// answers every later call as a trap.
import init, { RelateDb } from "@relate/relate-wasm";
import { isWasmTrap } from "@relate/relate-wasm/trap.js";
import { STORE_PREFIX } from "../config.js";

/**
 * Whether an error thrown by a call into the engine means the instance can no longer be used. The engine's own `isWasmTrap`
 * knows a WebAssembly trap and the stack-exhaustion wording of Chromium and WebKit; it misses Firefox's ("too much
 * recursion") and the "recursive use of an object" an instance throws once an earlier call overflowed the stack (the
 * borrow was never released). Both mean the same: replace the instance.
 */
export function isEngineTrap(err: unknown): boolean {
  if (isWasmTrap(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /too much recursion|recursive use of an object/i.test(message);
}

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

  private constructor(private readonly db: RelateDb) {}

  /** Initialise the engine's WebAssembly module from its binary's URL. Call once per worker. */
  static async load(engineUrl: string): Promise<void> {
    await init({ module_or_path: engineUrl });
  }

  static memory(): Engine {
    return new Engine(new RelateDb());
  }

  /** Wrap an engine instance that is already initialised (a seam for tests; not part of the package interface). */
  static fromDb(db: RelateDb): Engine {
    return new Engine(db);
  }

  /** Open the durable store `<prefix><id>` (`rel-` for a content cache, `app-` for an application). Works only in a dedicated worker. */
  static async store(id: string, prefix: string = STORE_PREFIX): Promise<Engine> {
    try {
      return new Engine(await RelateDb.open(`opfs://${prefix}${id}`));
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

  /** Let the database go (it releases a store's lock) and refuse every later call. */
  release(): void {
    if (this.dead) return;
    this.dead = true;
    try {
      this.db.free();
    } catch {
      /* the instance was already unusable */
    }
  }

  private guard<T>(call: () => T): T {
    if (this.dead) throw new TrapError();
    try {
      return call();
    } catch (e) {
      if (isEngineTrap(e)) {
        this.dead = true;
        throw new TrapError(messageOf(e));
      }
      throw e;
    }
  }
}
