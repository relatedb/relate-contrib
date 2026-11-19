import { catalog } from "@relate/contrib-nextjs/server";
import type { ReactNode } from "react";
import { graphs } from "../lib/graphs";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers catalog={catalog(graphs)}>{children}</Providers>
      </body>
    </html>
  );
}
