// Wrapper around the engine's browser build. It keeps the engine's result text unaltered, marks the instance
// dead at the first trap and answers every later call as a trap.
import init, { RelateDb } from "@relate/relate-wasm";
import { isWasmTrap } from "@relate/relate-wasm/trap.js";
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

/** Called with each statement an engine runs and the engine's reply text (see `Engine.setTap`). */
export type Tap = (statement: string, replyText: string) => void;

export class Engine {
  private dead = false;
  private static tap: Tap | null = null;
  /** The engine instance made most recently: the one a worker uses. */
  static current: Engine | null = null;

  private constructor(private readonly db: RelateDb) {
    Engine.current = this;
  }

  /** Observe every statement any engine runs, or stop (null). The worker turns it off around the page's own statements. */
  static setTap(tap: Tap | null): void {
    Engine.tap = tap;
  }

  /** The engine's version, asked of the engine itself (it has no version call); null when it does not say. Not tapped. */
  version(): string | null {
    try {
      const text = this.guard(() => this.db.execute("CALL dbms.components() YIELD name, versions RETURN name, versions", null));
      const rows = (JSON.parse(text) as { rows?: Array<{ name?: unknown; versions?: unknown }> }).rows ?? [];
      const row = rows.find((r) => r.name === "Relate");
      const version = Array.isArray(row?.versions) ? row.versions[0] : undefined;
      return typeof version === "string" ? version : null;
    } catch {
      return null;
    }
  }

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
    const text = this.guard(() => this.db.execute(statement, paramsJson));
    Engine.tap?.(statement, text);
    return text;
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
      if (isWasmTrap(e)) {
        this.dead = true;
        throw new TrapError(messageOf(e));
      }
      throw e;
    }
  }
}
