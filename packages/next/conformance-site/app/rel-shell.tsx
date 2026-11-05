// The markup the core's conformance scenarios drive (see packages/core/conformance/example-site/rel-page.ts): every
// observable thing is a `data-rel-*` element. The markup is static; `RelController` updates its text after hydration.
import type { ReactNode } from "react";
import { RelController } from "./rel-controller";
import { NavLink } from "./nav-link";

export interface ShellProps {
  title: string;
  notesPage?: boolean;
  bare?: boolean;
  /** The graph the page queries, and the label it counts. */
  graph?: string;
  label?: string;
  /** The descriptor variant the page uses unless the query string names one. */
  variant?: string;
  children?: ReactNode;
}

export function Nav() {
  return (
    <nav>
      <NavLink href="/index.html">Home</NavLink>
      <NavLink href="/page-1.html">Page 1</NavLink>
      <NavLink href="/page-2.html">Page 2</NavLink>
      <NavLink href="/notes.html">Notes</NavLink>
      <NavLink href="/broken.html">Broken</NavLink>
      <NavLink href="/inline.html">Inline</NavLink>
      <NavLink href="/lifetime-a.html">Lifetime A</NavLink>
      <NavLink href="/lifetime-b.html">Lifetime B</NavLink>
      <NavLink href="/lifetime-c.html">Lifetime C</NavLink>
    </nav>
  );
}

export function RelShell({ title, notesPage = false, bare = false, graph = "example", label = "Page", variant, children }: ShellProps) {
  return (
    <main>
      <h1 data-rel-title>{title}</h1>
      <Nav />
      {children}
      {!bare && (
        <section>
          <p>Status: <span data-rel-status>loading</span> · generation <span data-rel-generation>0</span> · profile <span data-rel-profile></span> · instance <span data-rel-instance></span> · restored <span data-rel-restored>unknown</span></p>
          <p>Pages in the graph: <span data-rel-count>…</span> · updates <span data-rel-updates>0</span> · last error <span data-rel-last-error></span></p>
          <p data-rel-failure></p>
          <p data-rel-notes-row hidden={!notesPage}>Notes: <span data-rel-notes>…</span></p>
          <p>
            <button type="button" data-rel-action="trap">Run a statement that crashes the engine</button>
            <button type="button" data-rel-action="timeout">Run a statement that never ends (0.4 s timeout)</button>
          </p>
          <RelController graph={graph} label={label} notesPage={notesPage} variant={variant} />
        </section>
      )}
    </main>
  );
}
