import { logger } from "../../utils/logger";

type MimeAttachment = { filename: string; mime_type: string; data: Buffer };
type BuildMimeMessageParams = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  attachments?: MimeAttachment[];
  in_reply_to?: string;
  references?: string;
  extraHeaders?: Record<string, string>;
};

function encode_rfc2047(text: string): string {
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  const encoded = Buffer.from(text, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

function base64_encode_body(data: string): string {
  const encoded = Buffer.from(data, "utf-8").toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < encoded.length; i += 76) {
    lines.push(encoded.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

export function build_mime_message(params: BuildMimeMessageParams): string {
  const to = params.to.filter(Boolean);
  const boundary = `wb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const has_attachments = params.attachments && params.attachments.length > 0;
  const lines: string[] = [];

  const toHeader = `To: ${to.join(", ")}`;
  logger.file("gmail").info(`build_mime_message ${JSON.stringify(params)}`);
  lines.push(`From: ${params.from}`);
  lines.push(toHeader);
  if (params.cc?.length) lines.push(`Cc: ${params.cc.join(", ")}`);
  if (params.bcc?.length) lines.push(`Bcc: ${params.bcc.join(", ")}`);
  lines.push(`Date: ${new Date().toUTCString().replace("GMT", "+0000")}`);
  lines.push(`Message-ID: <${crypto.randomUUID()}@workbound>`);
  lines.push(`Subject: ${encode_rfc2047(params.subject)}`);
  if (params.in_reply_to) lines.push(`In-Reply-To: ${params.in_reply_to}`);
  if (params.references) lines.push(`References: ${params.references}`);
  if (params.extraHeaders) {
    for (const [key, value] of Object.entries(params.extraHeaders)) {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("MIME-Version: 1.0");

  if (has_attachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
  }

  const body_text = params.body_text || "";
  const body_html = params.body_html || "";
  const hasBothBodies = !!(body_text && body_html);

  if (hasBothBodies) {
    const altBoundary = `alt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    lines.push("Content-Type: multipart/alternative;");
    lines.push(`  boundary="${altBoundary}"`);
    lines.push("");
    lines.push(`--${altBoundary}`);
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(base64_encode_body(body_text));
    lines.push("");
    lines.push(`--${altBoundary}`);
    lines.push("Content-Type: text/html; charset=UTF-8");
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(base64_encode_body(body_html));
    lines.push("");
    lines.push(`--${altBoundary}--`);
  } else {
    const body = body_html || body_text;
    const isHtml = !!body_html;
    lines.push(`Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=UTF-8`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push("");
    lines.push(base64_encode_body(body));
  }
  lines.push("");

  if (has_attachments) {
    for (const att of params.attachments!) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.mime_type}; name="=?UTF-8?B?${Buffer.from(att.filename).toString("base64")}?="`);
      lines.push("Content-Disposition: attachment; filename=\"=?UTF-8?B?" + Buffer.from(att.filename).toString("base64") + "?=\"");
      lines.push("Content-Transfer-Encoding: base64");
      lines.push("");
      const b64 = att.data.toString("base64");
      for (let i = 0; i < b64.length; i += 76) {
        lines.push(b64.slice(i, i + 76));
      }
      lines.push("");
    }
    lines.push(`--${boundary}--`);
  }

  const raw = lines.join("\r\n");
  return Buffer.from(raw, "utf-8").toString("base64url");
}


