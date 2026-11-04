import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
export const collections = { notes: defineCollection({ loader: glob({ pattern: "*.md", base: "./src/content/notes" }), schema: z.object({}) }) };
