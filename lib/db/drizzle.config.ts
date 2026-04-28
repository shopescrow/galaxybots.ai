import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Legacy table from a prior manual-migrations approach we no longer use.
  // Filtering it out prevents drizzle-kit push from prompting "Is X created
  // or renamed from _migrations?" — a prompt that hangs in non-TTY deploys.
  tablesFilter: ["!_migrations"],
});
