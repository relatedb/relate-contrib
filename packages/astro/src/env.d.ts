// The part of `import.meta.env` the package reads; the bundler provides it.
interface ImportMeta {
  readonly env: { readonly BASE_URL: string; readonly DEV: boolean; readonly PROD: boolean };
}
