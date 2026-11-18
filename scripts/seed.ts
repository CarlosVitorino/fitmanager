/**
 * Demo data for local development. Runs automatically from `npm run dev` when the database is empty.
 * Logins (password for all: demo-password):
 *   owner@demo.test  — studio owner
 *   coach@demo.test  — coach
 *   member@demo.test — member
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
  const { auth } = await import("../src/lib/auth");
  const { createStudio } = await import("../src/server/studios");

  const signUp = async (name: string, email: string) =>
    (await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } })).user;

  const owner = await signUp("Olivia Owner", "owner@demo.test");
  const coach = await signUp("Carl Coach", "coach@demo.test");
  const memberUser = await signUp("Mia Member", "member@demo.test");

  const studio = await createStudio(owner.id, { name: "Demo Studio", slug: "demo", timezone: "Europe/Lisbon" });
  await auth.api.addMember({ body: { organizationId: studio.id, userId: coach.id, role: "coach" } });
  await auth.api.addMember({ body: { organizationId: studio.id, userId: memberUser.id, role: "member" } });

  console.log(
    `Seeded Demo Studio at /s/demo. Log in as owner@demo.test, coach@demo.test or member@demo.test (password: ${DEMO_PASSWORD}).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  process.exit(0);
}
