import type {APIRoute} from "astro";
import {getCollection} from "astro:content";

// The build-time step: turn the content collection into pages and links.
// Static endpoint, so it is written to dist/graph.json at build time and served
// by the dev server from the same code.
const INTERNAL_LINK = /\]\(\/pages\/([a-z0-9-]+)\/?(?:#[^)]*)?\)/g;

export const GET: APIRoute = async () => {
  const entries = (await getCollection("pages")).sort((a, b) => a.id.localeCompare(b.id));
  const idBySlug = new Map(entries.map((entry, id) => [entry.id, id]));
  const pages = entries.map((entry, id) => ({id, slug: entry.id, title: entry.data.title, section: entry.data.section}));
  const seen = new Set<string>();
  const links: {from: number; to: number}[] = [];
  for (const entry of entries) {
    const from = idBySlug.get(entry.id)!;
    for (const match of (entry.body ?? "").matchAll(INTERNAL_LINK)) {
      const to = idBySlug.get(match[1]);
      const key = `${from}>${to}`;
      if (to === undefined || to === from || seen.has(key)) continue;
      seen.add(key);
      links.push({from, to});
    }
  }
  return new Response(JSON.stringify({pages, links}), {headers: {"content-type": "application/json"}});
};
