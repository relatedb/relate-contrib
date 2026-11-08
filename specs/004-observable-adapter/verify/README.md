# Planning checks (fixtures)

A throwaway Observable Framework 1.13.4 project that exercises the whole adapter path with hand-written stand-ins: two loaders place the engine's binary and a worker bundle, a third publishes a 20-node document, and one cell creates the core's client from them. Results are in [research.md](../research.md) (V-1 to V-8).

To repeat it, make a directory with these files, a real `node_modules` holding copies of `@relate/web` (its `dist` and `package.json`) and `@relate/relate-wasm` (the built package), plus links to `@observablehq/framework` and `esbuild`; then:

```sh
node node_modules/@observablehq/framework/dist/bin/observable.js build
cd dist && python3 -m http.server 5392 &       # any static server
node ../probe.mjs                               # loads the page in Chromium, Firefox and WebKit
```

`probe.mjs` expects the page at `http://127.0.0.1:5392/index.html` and prints the text of `#out` for each browser. The files are single-run fixtures, not the adapter.
