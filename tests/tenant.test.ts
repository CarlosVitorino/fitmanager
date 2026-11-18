/** Tenant isolation: a user only resolves studios they belong to, with the role they hold there. */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrate";

const { db } = await import("../src/db/client");
const { auth } = await import("../src/lib/auth");
const { createStudio } = await import("../src/server/studios");
const { resolveStudioContext, listUserStudios } = await import("../src/server/studio-context");

let ownerA: string;
let ownerB: string;
let memberA: string;

beforeAll(async () => {
  await runMigrations(process.env.DATABASE_URL);
  await db.execute(sql`truncate "user", organization cascade`);
  const signUp = async (email: string) =>
    (await auth.api.signUpEmail({ body: { name: email, email, password: "password123" } })).user.id;
  ownerA = await signUp("a@test.test");
  ownerB = await signUp("b@test.test");
  memberA = await signUp("m@test.test");
  const a = await createStudio(ownerA, { name: "Studio A", slug: "studio-a", timezone: "UTC" });
  await createStudio(ownerB, { name: "Studio B", slug: "studio-b", timezone: "Asia/Tokyo" });
  await auth.api.addMember({ body: { organizationId: a.id, userId: memberA, role: "member" } });
});

afterAll(async () => {
  await db.execute(sql`truncate "user", organization cascade`);
});

describe("resolveStudioContext", () => {
  it("resolves the owner's own studio with role and settings", async () => {
    const ctx = await resolveStudioContext(db, "studio-b", ownerB);
    expect(ctx).toMatchObject({ slug: "studio-b", role: "owner", timezone: "Asia/Tokyo", bookingCutoffMinutes: 120 });
  });

  it("returns null for another studio's owner", async () => {
    expect(await resolveStudioContext(db, "studio-a", ownerB)).toBeNull();
  });

  it("gives members the member role only in their studio", async () => {
    expect((await resolveStudioContext(db, "studio-a", memberA))?.role).toBe("member");
    expect(await resolveStudioContext(db, "studio-b", memberA)).toBeNull();
  });

  it("returns null for a studio that doesn't exist", async () => {
    expect(await resolveStudioContext(db, "nope", ownerA)).toBeNull();
  });

  it("lists only the user's studios", async () => {
    expect((await listUserStudios(db, memberA)).map((s) => s.slug)).toEqual(["studio-a"]);
  });
});

describe("createStudio", () => {
  it("rejects a taken address", async () => {
    await expect(createStudio(ownerB, { name: "Again", slug: "studio-a", timezone: "UTC" })).rejects.toThrow(/taken/);
  });
});
