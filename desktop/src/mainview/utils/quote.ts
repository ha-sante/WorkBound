import { format_date_full } from "@/shared/datetime";
import { convert } from "html-to-text";

const escape_html = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function strip_quote_pill(html: string): string {
  if (!html || !html.includes('data-role="quote-pill"')) return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll('[data-role="quote-pill"]').forEach((el) => {
    const wrapper = el.closest('[contenteditable="false"]');
    if (wrapper) wrapper.remove();
    else el.remove();
  });
  return div.innerHTML;
}

const html_to_text = (html: string): string => {
  let text = convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "style", format: "skip" },
      { selector: "script", format: "skip" },
      { selector: "head", format: "skip" },
      { selector: "noscript", format: "skip" },
      { selector: "svg", format: "skip" },
      { selector: "canvas", format: "skip" },
      { selector: "input", format: "skip" },
      { selector: "button", format: "skip" },
    ],
  });
  text = text.replace(/\n{3,}/g, "\n\n"); // collapse 3+ newlines to a single blank line
  text = text.replace(/[ \t]+\n/g, "\n"); // drop trailing spaces/tabs before each newline
  return text.trim();
};

export function build_quote(email: EmailPreviewWire, fullEmail: EmailRowWire | null | undefined): string {
  // replicating the quoting style/setup of gmail
  if (!fullEmail) return "";
  const body_text = fullEmail.body_text?.trim() ? fullEmail.body_text : fullEmail.body_html ? html_to_text(fullEmail.body_html) : "";
  if (!body_text) return "";
  const date = fullEmail.sent_at || fullEmail.received_at || "";
  const from = email.from_name || email.from_address || "";
  const dateStr = format_date_full(date || null);
  const quoted = body_text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  return `\n\nOn ${dateStr}, ${from} wrote:\n${quoted}`;
}

export function quote_text_to_html(quote_text: string): string {
  if (!quote_text) return "";
  const lines = quote_text.split("\n");
  const headerIdx = lines.findIndex((l) => l.includes("wrote:"));
  if (headerIdx === -1) {
    const body = lines.filter((l) => l.trim()).map((l) => escape_html(l.replace(/\r/g, ""))).join("<br>");
    return `<blockquote>${body}</blockquote>`;
  }
  const header = escape_html(lines[headerIdx].trim());
  const body = lines
    .slice(headerIdx + 1)
    .map((l) => l.replace(/^\s*>\s?/, "").replace(/\r/g, ""))
    .map(escape_html)
    .join("<br>");
  return `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">${header}<br></div><div dir="ltr">${body}</div></div>`;
}

export function build_pill_html(quote_text: string): string {
  if (!quote_text) return "";
  return `
    <div contenteditable="false">
      <div
        data-role="quote-pill"
        contenteditable="false"
        draggable="true"
        class="inline-flex items-center gap-1 px-1 py-1 rounded-full border bg-slate-100 cursor-grab active:cursor-grabbing select-none">
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
      </div>
    </div>
  `;
}
