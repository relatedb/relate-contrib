import Link from "next/link";
import type { ReactNode } from "react";

// Under client-routing the site navigates with the router; under multi-page every page is a document of its own.
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  if (process.env.RELATE_WEB_NAVIGATION === "multi-page") return <a data-rel-link href={href}>{children}</a>;
  return <Link data-rel-link href={href} prefetch={false}>{children}</Link>;
}
