// The version watcher and the scene helper (ADR-012, 2.4). A scene redraws only when the cache has changed.

/** A function that returns true once for each change of `cache.version` since its last call. */
export function versionWatch(cache: { readonly version: number }): () => boolean {
  let seen = cache.version;
  return () => {
    if (cache.version === seen) return false;
    seen = cache.version;
    return true;
  };
}

/** What `watchCache` needs of a Phaser scene: its event emitter. */
export interface SceneEvents {
  events: {
    on(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
  };
}

/**
 * Call `redraw` from the scene's `update` event only when the cache's version has changed since the last call. Stops on
 * the scene's `shutdown` event, or when the returned function is called.
 */
export function watchCache(scene: SceneEvents, cache: { readonly version: number }, redraw: () => void): () => void {
  const changed = versionWatch(cache);
  const onUpdate = () => {
    if (changed()) redraw();
  };
  const release = () => {
    scene.events.off("update", onUpdate);
    scene.events.off("shutdown", release);
  };
  scene.events.on("update", onUpdate);
  scene.events.on("shutdown", release);
  return release;
}
