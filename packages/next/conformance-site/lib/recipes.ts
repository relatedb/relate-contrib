// Content entries whose pages build their own inline graph (one node per step).
export const recipes: Record<string, { title: string; steps: string[] }> = {
  soup: { title: "Soup", steps: ["chop", "boil", "season"] },
  bread: { title: "Bread", steps: ["mix", "knead", "rest", "bake"] },
};
