// The client's status and generation (data-model.md). The generation is 0 until the first instance is ready, and
// increases each time an instance becomes ready, so a replacement is counted only when it can answer queries.
export type Status = "loading" | "ready" | "recovering" | "failed";

export class StatusMachine {
  private current: Status = "loading";
  private count = 0;

  constructor(private readonly onChange?: (status: Status, generation: number) => void) {}

  get status(): Status {
    return this.current;
  }

  get generation(): number {
    return this.count;
  }

  markReady(): void {
    this.count++;
    this.set("ready");
  }

  markRecovering(): void {
    this.set("recovering");
  }

  markFailed(): void {
    this.set("failed");
  }

  markLoading(): void {
    this.set("loading");
  }

  private set(next: Status): void {
    if (next === this.current) return;
    this.current = next;
    this.onChange?.(next, this.count);
  }
}
