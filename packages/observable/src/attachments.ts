// A file attachment is what a cell gets from `FileAttachment("data/x")`. The package takes attachments, not locations, because
// Framework finds a page's files by reading literal `FileAttachment(...)` calls in cells (ADR-006 §2.3).

export interface Attachment {
  url(): Promise<string>;
  json(): Promise<unknown>;
}

/** Framework returns the same object for one file on one page, so identity keys what is resolved: once per page (research D-3). */
const locations = new WeakMap<object, Promise<string>>();
const contents = new WeakMap<object, Promise<unknown>>();

export const isAttachment = (v: unknown): v is Attachment => !!v && typeof v === "object" && typeof (v as Attachment).url === "function" && typeof (v as Attachment).json === "function";

/** The published location of an attachment, asked for once. */
export function locationOf(attachment: Attachment): Promise<string> {
  let pending = locations.get(attachment);
  if (!pending) locations.set(attachment, (pending = attachment.url()));
  return pending;
}

/** The parsed JSON content of an attachment, read once. */
export function contentOf(attachment: Attachment): Promise<unknown> {
  let pending = contents.get(attachment);
  if (!pending) contents.set(attachment, (pending = attachment.json()));
  return pending;
}
