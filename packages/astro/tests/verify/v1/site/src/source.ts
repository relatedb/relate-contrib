import { getCollection } from "astro:content";
export default async function () {
  const notes = await getCollection("notes");
  return { version: 1, nodes: notes.map((n) => ({ id: n.id })), links: [] };
}
