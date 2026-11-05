import Link from "next/link";
import type { ReactNode } from "react";

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">home</Link> · <Link href="/a">a</Link> · <Link href="/b">b</Link> · <Link href="/c">c</Link> · <a href="/plain.html">plain (document load)</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
