import crypto from "node:crypto";
export const make_auto_label_id = (prefix: string): string => `${prefix}_${crypto.randomUUID()}`;

export const make_email_alias_id = (email: string): string => crypto.createHash("sha256").update(email).digest("hex");
export const hash_content = (parts: string[]): string => crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex");
export const prompt_content_hash = (prompt: string, label_ids: string[]): string => {
  return hash_content([prompt.trim(), ...label_ids.slice().sort()]);
};
export const template_content_hash = (entries: AutoLabelTemplateEntryInputWire[]): string => {
  const content = entries
    .map((e) => [e.prompt.trim(), ...e.labels.slice().sort()].join("\u0001"))
    .sort()
    .join("\u0002");
  return hash_content([content]);
};
