/**
 * One command for local development:
 *   1. make sure Postgres answers (starts the Docker Compose db if it doesn't)
 *   2. apply migrations
 *   3. seed a demo studio if the database is empty
 *   4. run `astro dev`
 */
import "dotenv/config";
import { execSync, spawn } from "node:child_process";
import postgres from "postgres";
import { runMigrations } from "./migrate";
import { seedIfEmpty } from "./seed";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

async function canConnect(): Promise<boolean> {
  const sql = postgres(url!, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

if (!(await canConnect())) {
  console.log("Postgres not reachable, starting it with Docker Compose…");
  try {
    execSync("docker compose up -d --wait db", { stdio: "inherit" });
  } catch {
    console.error("Could not start Postgres. Install Docker, or point DATABASE_URL at a running Postgres.");
    process.exit(1);
  }
}

await runMigrations(url);
await seedIfEmpty();

const child = spawn("npx", ["astro", "dev", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
