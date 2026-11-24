---
"@relate/contrib-nextjs": patch
---

A graph file the build did not publish is answered 404 without evaluating the graph; under `cacheComponents` it could answer 500 (relatedb/relate-contrib#12).
