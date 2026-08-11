import { getDb } from "./client";
import { images } from "./schema/images";
import { eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";

export type ImageRow = InferSelectModel<typeof images>;

export function get_image(url: string): ImageRow | undefined {
  return getDb().select().from(images).where(eq(images.url, url)).get();
}

export function upsert_image(url: string, data: string, mime: string) {
  getDb()
    .insert(images)
    .values({ url, data, mime })
    .onConflictDoUpdate({
      target: images.url,
      set: { data, mime },
    })
    .run();
}