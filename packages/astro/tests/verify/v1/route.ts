import source from "virtual:v1/sources";
export const prerender = true;
export async function getStaticPaths() {
  const doc = await source();
  return [{ params: { id: "x", file: "graph.json" }, props: { doc } }];
}
export function GET({ props }: any) {
  return new Response(JSON.stringify(props.doc), { headers: { "content-type": "application/json" } });
}
