import { sql } from "drizzle-orm";
import { runMigrations } from "../scripts/migrate";

const { db } = await import("../src/db/client");
const { auth } = await import("../src/lib/auth");
const { createStudio } = await import("../src/server/studios");
const { resolveStudioContext } = await import("../src/server/studio-context");
const schema = await import("../src/db/schema");

export { db, schema };

export async function resetDb() {
  await runMigrations(process.env.DATABASE_URL);
  await db.execute(sql`truncate "user", organization cascade`);
}

let n = 0;
export async function makeUser(name = "User") {
  n++;
  const email = `${name.toLowerCase().replace(/\W/g, "")}${n}@test.test`;
  return (await auth.api.signUpEmail({ body: { name, email, password: "password123" } })).user.id;
}

/** A studio with an owner, a member, a default template, a calendar and the three standard plans. */
export async function makeStudio(opts: { timezone?: string; slug?: string } = {}) {
  const ownerId = await makeUser("Owner");
  const memberId = await makeUser("Member");
  const slug = opts.slug ?? `studio-${++n}`;
  const org = await createStudio(ownerId, { name: `Studio ${n}`, slug, timezone: opts.timezone ?? "Europe/Lisbon" });
  await auth.api.addMember({ body: { organizationId: org.id, userId: memberId, role: "member" } });
  const owner = (await resolveStudioContext(db, slug, ownerId))!;
  const memberCtx = (await resolveStudioContext(db, slug, memberId))!;

  const { and, eq } = await import("drizzle-orm");
  const [template] = await db
    .select()
    .from(schema.classTemplate)
    .where(and(eq(schema.classTemplate.studioId, org.id), eq(schema.classTemplate.isDefault, true)));
  const [cal] = await db.select().from(schema.calendar).where(eq(schema.calendar.studioId, org.id));
  const types = await db
    .select()
    .from(schema.packType)
    .where(eq(schema.packType.studioId, org.id))
    .orderBy(schema.packType.sortOrder);
  return {
    studioId: org.id,
    owner,
    member: memberCtx,
    memberId,
    templateId: template!.id,
    calendarId: cal!.id,
    single: types[0]!,
    trimester: types[1]!,
    tenPack: types[2]!,
  };
}

export type Studio = Awaited<ReturnType<typeof makeStudio>>;

/** A class starting `hoursFromNow` hours from now. */
export async function makeSession(s: Studio, hoursFromNow: number, capacity = 10) {
  const startsAt = new Date(Date.now() + hoursFromNow * 3_600_000);
  const { localDateOf } = await import("../src/domain/dates");
  const [row] = await db
    .insert(schema.classSession)
    .values({
      studioId: s.studioId,
      calendarId: s.calendarId,
      templateId: s.templateId,
      localDate: localDateOf(startsAt, s.owner.timezone),
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      capacity,
    })
    .returning();
  return row!;
}

/** Moves a class into the past (as if time passed), keeping its date consistent. */
export async function moveSessionTo(s: Studio, sessionId: string, hoursFromNow: number) {
  const { localDateOf } = await import("../src/domain/dates");
  const { eq } = await import("drizzle-orm");
  const startsAt = new Date(Date.now() + hoursFromNow * 3_600_000);
  await db
    .update(schema.classSession)
    .set({
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      localDate: localDateOf(startsAt, s.owner.timezone),
    })
    .where(eq(schema.classSession.id, sessionId));
}

export function today(tz = "Europe/Lisbon") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}
