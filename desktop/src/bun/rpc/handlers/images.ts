import { messages } from "../../../shared/rpc_messages";
import { logger } from "../../utils/logger";
import { get_image, upsert_image } from "../../db/images";

const in_flight = new Map<string, Promise<string | null>>();

function image_content_type(header: string | null): string | null {
  if (!header) return null;
  const mime = header.split(";")[0].trim();
  return mime.startsWith("image/") ? mime : null;
}

async function fetch_and_cache(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn("images", `get ${url} http ${res.status}`);
      return null;
    }
    const mime = image_content_type(res.headers.get("content-type"));
    if (!mime) {
      logger.warn("images", `get ${url} non-image content-type`);
      return null;
    }
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    upsert_image(url, data, mime);
    return `data:${mime};base64,${data}`;
  } catch (e) {
    logger.warn("images", `get ${url} failed: ${e}`);
    return null;
  }
}

function resolve_image(url: string): Promise<string | null> {
  const row = get_image(url);
  if (row) return Promise.resolve(`data:${row.mime};base64,${row.data}`);

  const existing = in_flight.get(url);
  if (existing) return existing;

  const promise = fetch_and_cache(url);
  in_flight.set(url, promise);
  promise.finally(() => in_flight.delete(url));
  return promise;
}

export default {
  [messages.images_get]: async (params: { url: string }) => {
    try {
      if (new URL(params.url).protocol !== "https:") return { data_uri: null };
    } catch {
      return { data_uri: null };
    }
    const data_uri = await resolve_image(params.url);
    return { data_uri };
  },
};