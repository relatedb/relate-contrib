import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

export const collections = {
  recipes: defineCollection({
    loader: glob({ pattern: "*.md", base: "./src/content/recipes" }),
    schema: z.object({ title: z.string(), steps: z.array(z.string()) }),
  }),
};
