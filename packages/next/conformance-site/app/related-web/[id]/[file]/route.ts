import { createGraphRoute } from "@relate/web-next/server";
import { graphs } from "../../../../lib/graphs";

export const dynamic = "force-static";
export const dynamicParams = false;
export const { GET, generateStaticParams } = createGraphRoute(graphs);
