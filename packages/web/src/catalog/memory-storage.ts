// An in-memory catalog file with a shared/exclusive lock, for tests that run the lifecycle in Node.
import type { CatalogStorage, LockMode } from "./storage.js";

interface Waiter {
  mode: LockMode;
  grant: () => void;
}

export class MemoryCatalogStorage implements CatalogStorage {
  private text: string | null;
  private readers = 0;
  private writer = false;
  private queue: Waiter[] = [];
  /** How many times the file was replaced, for tests. */
  replaced = 0;

  constructor(initial: string | null = null) {
    this.text = initial;
  }

  async read(): Promise<string | null> {
    return this.text;
  }

  async replace(text: string): Promise<void> {
    this.text = text;
    this.replaced++;
  }

  async remove(): Promise<void> {
    this.text = null;
  }

  async withLock<T>(mode: LockMode, fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((grant) => {
      this.queue.push({ mode, grant });
      this.pump();
    });
    try {
      return await fn();
    } finally {
      if (mode === "exclusive") this.writer = false;
      else this.readers--;
      this.pump();
    }
  }

  /** Grant waiters in arrival order: any number of readers together, a writer alone. */
  private pump(): void {
    while (this.queue.length > 0) {
      const next = this.queue[0]!;
      if (this.writer) return;
      if (next.mode === "exclusive") {
        if (this.readers > 0) return;
        this.writer = true;
      } else {
        this.readers++;
      }
      this.queue.shift();
      next.grant();
    }
  }
}
