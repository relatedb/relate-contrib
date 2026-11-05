import { Nav } from "../rel-shell";
import { LifetimeProbe } from "../lifetime-probe";

export default function Page() {
  return (
    <main>
      <h1 data-rel-title>Lifetime A</h1>
      <Nav />
      <div data-lifetime-page>
        <p>Status: <span data-life-status>loading</span> · items <span data-life-count>…</span> · restored <span data-life-restored>unknown</span></p>
        <LifetimeProbe />
      </div>
    </main>
  );
}
