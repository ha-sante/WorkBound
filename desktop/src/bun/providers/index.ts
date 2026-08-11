import type { ProviderAdapter } from "./types";
import { GmailAdapter } from "./gmail/adapter";

export function get_adapter(provider: string): ProviderAdapter {
  switch (provider) {
    case "gmail":
      return new GmailAdapter();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
