// A server component using the core's validators at build/request time (what an adapter does for descriptors).
import { validateDescriptor } from "related-web-core/validate";
import descriptor from "../../public/descriptor.json";

export default function Page() {
  const result = validateDescriptor(descriptor);
  return <main><h1>server</h1><pre data-k="validated">{JSON.stringify(result).slice(0, 120)}</pre></main>;
}
