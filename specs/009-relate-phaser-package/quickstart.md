# Quickstart: running the checks

Prerequisites: the repository's usual setup (`pnpm run build:wasm`, `pnpm install`).

```sh
pnpm test:phaser            # queue, cache, throwaway client and watcher against the real engine (Node), and a fake client for generations
pnpm test:phaser-package    # packs the package, installs it with the core and Phaser in a clean project, builds, runs an action
pnpm test:phaser-trace      # every requirement and success criterion has a passing, tagged test (tags are `covers-ph:`)
pnpm test:phaser-browsers   # the path explorer in Chromium, Firefox and WebKit: a trapped engine is replaced and the board rebuilt
pnpm --filter phaser-path-explorer test   # the demo's 202 unit tests, on the package
```

## Scenarios

1. **Order** (US1, SC-001): push 1,000 statements without awaiting; the engine's final state matches the order pushed.
2. **Rollback** (US2): start an action with an optimistic change and a statement the engine refuses; the state returns to its earlier value and the version has moved.
3. **Recovery** (US2, US3, SC-002): in the browser run, send the nested-parentheses statement; wait for `status` to return to `ready`; the board matches the graph and no action ran twice.
4. **Redraw count** (US5, SC-005): 600 scene updates with 5 commits give 5 redraws.
5. **Throwaway** (US4, SC-006): start a throwaway client beside an application client, change both, reload; only the application data remains.
6. **Install** (US6): the package check installs the packed tarball in a clean project and runs a first action in under fifteen minutes of reading the README (SC-004 is a reader check, recorded in the task that writes the README).
