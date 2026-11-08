// A stand-in for the integration's `virtual:relate/config`, for unit tests of the client module.
export const navigation = "multi-page" as const;
export const graphs = {
  site: { descriptor: "/_relate/site/descriptor.json", lifetime: "visit" as const },
  recipes: { descriptor: "/_relate/recipes/descriptor.json", lifetime: "page" as const },
};
