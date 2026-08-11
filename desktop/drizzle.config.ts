import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/bun/db/schema",
  dialect: "sqlite",
});
