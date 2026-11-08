// The conformance site: pages are written by cells; the loaders in docs/data place the engine and the worker and publish the graphs.
// preserveExtension keeps a page at `/page-1.html`, the address the core's conformance runner uses.
export default {
  root: "docs",
  pages: [],
  toc: false,
  footer: "",
  sidebar: false,
  header: `<nav><a data-rel-link href="/index.html">Home</a> <a data-rel-link href="/page-1.html">Page 1</a> <a data-rel-link href="/page-2.html">Page 2</a> <a data-rel-link href="/notes.html">Notes</a> <a data-rel-link href="/broken.html">Broken</a> <a data-rel-link href="/document.html">Document</a> <a data-rel-link href="/two-graphs.html">Two graphs</a></nav>`,
  preserveExtension: true,
  telemetry: false
};
