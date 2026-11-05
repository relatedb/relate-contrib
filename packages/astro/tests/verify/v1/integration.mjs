// V-1 throwaway: an integration whose injected route entrypoint imports a user source that uses astro:content.
import { fileURLToPath } from "node:url";
export default function v1() {
  return {
    name: "v1",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig, config }) => {
        const sourcePath = fileURLToPath(new URL("./site/src/source.ts", import.meta.url));
        updateConfig({
          vite: {
            plugins: [{
              name: "v1-sources",
              resolveId: (id) => (id === "virtual:v1/sources" ? "\0v1" : null),
              load: (id) => (id === "\0v1" ? `import source from ${JSON.stringify(sourcePath)}; export default source;` : null),
            }],
          },
        });
        injectRoute({ pattern: "/_relate/[id]/[file]", entrypoint: fileURLToPath(new URL("./route.ts", import.meta.url)), prerender: true });
      },
    },
  };
}
