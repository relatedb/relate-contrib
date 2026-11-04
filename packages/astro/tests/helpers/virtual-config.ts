// A stand-in for the integration's `virtual:related-web/config`, for unit tests of the client module.
export const navigation = "multi-page" as const;
export const graphs = {
  site: { descriptor: "/_related/site/descriptor.json", lifetime: "visit" as const },
  recipes: { descriptor: "/_related/recipes/descriptor.json", lifetime: "page" as const },
};
