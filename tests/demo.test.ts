/** The public demo and the public studio page, against Postgres. */
import { eq, like } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, makeStudio, resetDb, schema } from "./fixtures";

const demo = await import("../src/server/demo");
const { auth } = await import("../src/lib/auth");
const page = await import("../src/server/studio-page");

beforeAll(resetDb);

const tokenOf = (slug: string) => slug.replace("demo-", "");
const usersOf = (token: string) =>
  db
    .select()
    .from(schema.user)
    .where(like(schema.user.email, `%.${token}@demo.fitmanager.invalid`));

describe("public demo", () => {
  it("gives every visitor their own sample studio and deletes it on removal", async () => {
    const a = await demo.startDemo("coach");
    const b = await demo.startDemo("member");
    expect(a.slug).not.toBe(b.slug);
    expect(a.signIn.ok).toBe(true);
    expect(a.signIn.headers.getSetCookie().length).toBeGreaterThan(0);

    const [studioA] = await db.select().from(schema.organization).where(eq(schema.organization.slug, a.slug));
    const packsA = await db.select().from(schema.pack).where(eq(schema.pack.studioId, studioA!.id));
    expect(packsA.length).toBeGreaterThan(3);
    expect(await usersOf(tokenOf(a.slug))).toHaveLength(9);

    await demo.removeDemo(tokenOf(a.slug));
    expect(await db.select().from(schema.organization).where(eq(schema.organization.slug, a.slug))).toHaveLength(0);
    expect(await db.select().from(schema.pack).where(eq(schema.pack.studioId, studioA!.id))).toHaveLength(0);
    expect(await usersOf(tokenOf(a.slug))).toHaveLength(0);
    // The other visitor's demo is untouched.
    expect(await usersOf(tokenOf(b.slug))).toHaveLength(9);
    await demo.removeDemo(tokenOf(b.slug));
  }, 60_000);

  it("lands members on the invite page and switches sides inside the same demo", async () => {
    const m = await demo.startDemo("member");
    const token = tokenOf(m.slug);
    const [settings] = await db
      .select({ code: schema.studioSettings.joinCode })
      .from(schema.studioSettings)
      .innerJoin(schema.organization, eq(schema.organization.id, schema.studioSettings.studioId))
      .where(eq(schema.organization.slug, m.slug));
    expect(m.landing).toBe(`/join/${m.slug}/${settings!.code}`);
    expect(m.signIn.ok).toBe(true);

    const coach = await demo.enterDemo(token, "coach");
    expect(coach.signIn.ok).toBe(true);
    expect(coach.landing).toBe(`/s/${m.slug}`);
    const session = (await coach.signIn.json()) as { user: { email: string } };
    expect(session.user.email).toBe(`owner.${token}@demo.fitmanager.invalid`);
    await demo.removeDemo(token);
  }, 60_000);

  it("removes expired demos", async () => {
    const a = await demo.startDemo("coach");
    await db
      .update(schema.demoSandbox)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.demoSandbox.token, tokenOf(a.slug)));
    expect(await demo.removeExpiredDemos()).toBe(1);
    expect(await usersOf(tokenOf(a.slug))).toHaveLength(0);
  }, 60_000);

  it("recognises demo addresses", () => {
    expect(demo.demoToken("owner.0123456789ab@demo.fitmanager.invalid")).toBe("0123456789ab");
    expect(demo.demoToken("owner@demo.test")).toBeNull();
    expect(demo.demoToken("owner.0123456789ab@demo.fitmanager.invalid.evil.com")).toBeNull();
  });

  it("refuses sign-ups with a demo address", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { name: "Sneaky", email: "x.0123456789ab@demo.fitmanager.invalid", password: "password-123" },
      }),
    ).rejects.toThrow();
  });
});

describe("studio page", () => {
  it("normalises links and only shows what the owner chose", async () => {
    const s = await makeStudio();
    const input = page.studioPageInput.parse({
      tagline: " Strong together ",
      about: "<p>Hi</p><script>alert(1)</script>",
      address: "",
      phone: "",
      email: "",
      website: "example.com",
      instagram: "@harbour.strength",
      showSchedule: false,
      showPlans: true,
    });
    await page.saveStudioPage(s.owner, input);
    const info = (await page.publicStudioInfo(s.owner.studioId))!;
    expect(info.page.tagline).toBe("Strong together");
    expect(info.page.about).toBe("<p>Hi</p>");
    expect(info.page.website).toBe("https://example.com");
    expect(info.page.instagram).toBe("harbour.strength");
    expect(info.classes).toEqual([]);
    expect(info.plans).toHaveLength(3);
  });

  it("only lets the owner edit it", async () => {
    const s = await makeStudio();
    const input = page.studioPageInput.parse({
      tagline: null,
      about: null,
      address: null,
      phone: null,
      email: null,
      website: null,
      instagram: null,
      showSchedule: true,
      showPlans: true,
    });
    await expect(page.saveStudioPage({ ...s.owner, role: "coach" }, input)).rejects.toThrow();
    await expect(page.saveStudioPage(s.member, input)).rejects.toThrow();
  });

  it("rejects bad links", () => {
    const base = { tagline: null, about: null, address: null, phone: null, showSchedule: true, showPlans: true };
    expect(page.studioPageInput.safeParse({ ...base, email: "nope", website: null, instagram: null }).success).toBe(
      false,
    );
    expect(page.studioPageInput.safeParse({ ...base, email: null, website: null, instagram: "a b" }).success).toBe(
      false,
    );
  });
});
