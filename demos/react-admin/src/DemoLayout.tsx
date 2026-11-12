import { Layout, type LayoutProps } from "react-admin";
import { useClient } from "./ClientContext.js";
import { ResetControl } from "./ResetControl.js";
import { StatementPanel } from "./StatementPanel.js";
import { StorageNotice } from "./StorageNotice.js";

/** react-admin's layout with a storage notice and the reset control above the page and the statement panel below it. The shell renders before the client is ready. */
export function DemoLayout(props: LayoutProps) {
  const client = useClient();
  return (
    <Layout {...props}>
      <StorageNotice client={client} />
      <ResetControl />
      {props.children}
      <StatementPanel />
    </Layout>
  );
}
