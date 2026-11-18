/** The engine refused a statement: its message, from the result envelope. A client fault is a `GraphError` instead. */
export class StatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementError";
  }
}
