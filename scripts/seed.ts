/**
 * Demo data for local development. Runs automatically from `npm run dev` when the database is empty.
 * Logins (password for all: demo-password):
 *   owner@demo.test  — studio owner (Olivia)
 *   coach@demo.test  — coach (Carl)
 *   member@demo.test — member (Mia), with plans, history and upcoming bookings
 * Plus a handful of other members in different situations (low credits, expiring, no plan).
 * The public "Try the demo" button builds its own throwaway copy of the same data per visitor.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";

export const DEMO_PASSWORD = "demo-password";

export async function seedIfEmpty(): Promise<void> {
  const { db } = await import("../src/db/client");
  const [row] = await db.execute<{ count: number }>(sql`select count(*)::int as count from "user"`);
  if ((row?.count ?? 0) > 0) return;
  await seed();
}

export async function seed(): Promise<void> {
  const { buildSampleStudio } = await import("../src/server/sample-studio");
  await buildSampleStudio({
    slug: "demo",
    name: "Demo Studio",
    timezone: "Europe/Lisbon",
    password: DEMO_PASSWORD,
    email: (key) => `${key}@demo.test`,
  });
  console.log(
    `Seeded Demo Studio at /s/demo. Log in as owner@demo.test, coach@demo.test or member@demo.test (password: ${DEMO_PASSWORD}).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  process.exit(0);
}
