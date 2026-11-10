import { Layout, type LayoutProps } from "react-admin";
import { useClient } from "./ClientContext.js";
import { StatementPanel } from "./StatementPanel.js";
import { StorageNotice } from "./StorageNotice.js";

/** react-admin's layout with a storage notice above the page and the statement panel below it. The shell renders before the client is ready. */
export function DemoLayout(props: LayoutProps) {
  const client = useClient();
  return (
    <Layout {...props}>
      <StorageNotice client={client} />
      {props.children}
      <StatementPanel />
    </Layout>
  );
}
