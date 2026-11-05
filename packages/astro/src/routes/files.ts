// The injected route (spec FR-006 to FR-011): `/_relate/<name>/descriptor.json` and `/_relate/<name>/graph.<revision>.json`
// for every registered graph. `getStaticPaths` evaluates each source once and hands the result to both files as props.
import graphs, { base, dev } from "virtual:relate-web/sources";
import { descriptorOf, evaluate } from "../sources.js";

export const prerender = true;

interface Props {
  body?: string;
  error?: string;
}

export async function getStaticPaths() {
  const paths: Array<{ params: { id: string; file: string }; props: Props }> = [];
  for (const graph of graphs) {
    try {
      const evaluated = await evaluate(graph.name, graph.load);
      paths.push({ params: { id: graph.name, file: "descriptor.json" }, props: { body: JSON.stringify(descriptorOf(graph.name, evaluated, graph.indexes, base)) + "\n" } });
      paths.push({ params: { id: graph.name, file: `graph.${evaluated.revision}.json` }, props: { body: evaluated.text + "\n" } });
    } catch (e) {
      // A build stops at the first problem. The development server keeps running and answers this graph's file with an error.
      if (!dev) throw e;
      const message = e instanceof Error ? e.message : String(e);
      console.error(message);
      paths.push({ params: { id: graph.name, file: "descriptor.json" }, props: { error: message } });
    }
  }
  return paths;
}

export function GET({ props }: { props: Props }): Response {
  if (props.error !== undefined) return new Response(props.error, { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new Response(props.body, { headers: { "content-type": "application/json; charset=utf-8" } });
}
