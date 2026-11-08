// A loader that cannot produce its file writes the message to standard error and exits non-zero; Framework then stops the build.

/** Stop the build with `message`, which names the graph or file and the first problem. */
export function fail(message: string): never {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
  process.exit(1);
}
