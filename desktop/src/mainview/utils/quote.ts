import { format_date_full } from "@/shared/datetime";

export function build_quote(email: EmailPreviewWire, fullEmail: EmailRowWire | null | undefined): string {
  if (!fullEmail || !fullEmail.body_text) return "";
  const date = fullEmail.sent_at || fullEmail.received_at || "";
  const from = email.from_name || email.from_address || "";
  const dateStr = format_date_full(date || null);
  const quoted = fullEmail.body_text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `\n\nOn ${dateStr}, ${from} wrote:\n${quoted}`;
}
