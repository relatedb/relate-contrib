# DRAFT issue for relatedb/relate: opening a store fails when the newest WAL segment is empty

(Draft only; not filed. Engine commit examined: `31269e3`.)

## Summary

If a process stops after a new WAL segment's file has been created but before its 8-byte magic has been written, the next `Wal::open` fails with `storage error: truncated WAL magic: wal/<n>.log`, even though the segment before it is complete and valid. The repair that tolerates a torn new segment accepts a header of 1 to 7 bytes, but not 0 bytes. On the browser's OPFS store the window is wide, because the file is created and published to the store's catalog before the magic is written. An open tab or worker stopped at the wrong moment leaves the store unopenable.

## Impact

A browser application whose worker is stopped (tab closed, `worker.terminate()`, crash) during a snapshot rotation or a store reset can no longer open its store. `@relate/relate-wasm` reports `storage error: truncated WAL magic: wal/00000002.log` and the application has no way to recover short of deleting the store.

In CI (Linux, Playwright Firefox and WebKit) a test that stops the worker mid-reset reproduces it about 1 run in 3 to 1 in 6. It passes most of the time on a developer machine.

## Reproduction (engine only, no browser)

A new test in `relate/relate-storage/src/wal/tests.rs`:

```rust
#[test]
fn empty_highest_segment_after_valid_predecessor_opens() {
    let vfs = Arc::new(MemoryVfs::new());
    let mut wal = Wal::open(Arc::clone(&vfs) as Arc<dyn Vfs>, "wal", 0).unwrap();
    wal.append_commit(1, &[]).unwrap();
    drop(wal);
    // a rotate that stopped after the new segment's file was created, before its magic was written
    vfs.open("wal/00000002.log", VfsOpen::create_truncate()).unwrap();
    Wal::open(Arc::clone(&vfs) as Arc<dyn Vfs>, "wal", 0).unwrap(); // fails
}
```

Result (run against `31269e3`):

```
storage error: truncated WAL magic: wal/00000002.log
```

The existing tests `every_short_highest_magic_prefix_recovers_on_memory_and_native` (sizes `1..MAGIC.len()`) and `short_magic_repair_requires_valid_predecessor_and_exact_prefix` (which lists `b""` among the cases that must fail) show that the repair of a short highest magic was designed for torn prefixes, and that the empty file falls outside it.

## Reproduction (browser)

Observed in the `relate-contrib` repository (`packages/web`, the test "an application stopped during resetApplication continues the reset on the next open"). After the failure, the OPFS store `relate/app-<name>/` holds:

- `catalog` (the slot pool's virtual directory), listing `wal/00000001.log` and `wal/00000002.log`;
- one non-empty slot of 12.9 MB (`wal/00000001.log`);
- every other slot at 0 bytes, including the one `wal/00000002.log` maps to.

So the newest segment exists in the catalog, is zero bytes long, and follows a valid segment. The reopened client reports `{"reason":"store-unreadable","engineError":"storage error: truncated WAL magic: wal/00000002.log"}`.

Failure counts over repeated runs of the two interruption tests (3 runs each, GitHub-hosted Ubuntu, Playwright 1.64):

| Browser | failures / 6 |
|---|---|
| Firefox | 3 (one run), 1 (another) |
| WebKit | 1 |

Chromium has not failed. All three browsers expose `createWritable`, `move` and `createSyncAccessHandle` on this runner, so this is not a missing-API fallback.

## Cause

In the OPFS virtual file system (`surfaces/relate-wasm/src/opfs/catalog.rs`, `Inner::alloc`), creating a file truncates a slot, then calls `commit`, which writes and flushes the catalog entry for the new path. The WAL's `write_magic` (`relate/relate-storage/src/wal/scan.rs`) then calls `vfs.open(path, create_truncate())` followed by `write_all(magic)` and `sync_all()`. A stop between the catalog commit and the magic write leaves a catalog entry for a zero-length segment. `scan_seg` rejects any file shorter than the magic with `truncated WAL magic`, and the repair for a short highest segment does not cover length 0.

## Suggested directions (for the maintainers to weigh)

1. Treat a zero-length highest segment, with a valid predecessor, the same as a 1 to 7 byte prefix: remove it or rewrite its magic. The existing rule that a sole short segment cannot be repaired stays, since without a predecessor an empty file may hide lost data. A zero-length newest segment after a valid predecessor holds no committed frame, so nothing is lost.
2. Change the order on stores without an atomic create: write the magic before the catalog publishes the new path, or create the segment under a temporary name and rename it.
3. Both.

Direction 1 also covers other stores and crashes at the same step on native file systems (a file created but not yet written).

## Not the cause

The browser application's own catalog file (`relate-web/catalog.json`) was checked: it was whole at the time of every failure (224 bytes). Writing it through a temporary file and `move()`, or through a staged copy, made no difference to the failure rate.
