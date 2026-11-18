/**
 * Public demo: every visitor who opens the demo gets their own copy of a sample studio, so nothing
 * one visitor does shows up for another. Inside their copy they can switch between the owner's view
 * and a member's (Mia's), and see what one did from the other side. The copy and its people are
 * deleted when the visitor logs out, or after DEMO_LIFETIME_MS at the latest.
 */
import { createHmac, randomBytes } from "node:crypto";
import { eq, like, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { demoSandbox, organization, studioSettings, user } from "../db/schema";
import { t } from "../i18n";
import { auth } from "../lib/auth";
import { env } from "../lib/env";
import { asDemoBuilder, DEMO_EMAIL_DOMAIN } from "./demo-guard";
import { buildSampleStudio } from "./sample-studio";

export const DEMO_LIFETIME_MS = 3 * 60 * 60 * 1000;
/** Most demos alive at once; protects the database from someone pressing the button in a loop. */
const MAX_LIVE_DEMOS = 200;
const DOMAIN = DEMO_EMAIL_DOMAIN;
const EMAIL = new RegExp(`\\.([a-f0-9]{12})@${DOMAIN.replace(/\./g, "\\.")}$`);

export type DemoRole = "coach" | "member";

/** The sandbox token if this address belongs to a demo person, otherwise null. */
export function demoToken(email: string | null | undefined): string | null {
  return (email && EMAIL.exec(email)?.[1]) || null;
}

export const demoSlug = (token: string) => `demo-${token}`;

export class DemoUnavailable extends Error {}

/**
 * Every person in a demo shares one password, derived from the sandbox token and the server secret.
 * Nothing needs storing, and switching between the coach and member views is just another sign-in.
 */
function demoPassword(token: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(`demo:${token}`).digest("base64url").slice(0, 32);
}

const demoEmail = (key: string, token: string) => `${key}.${token}@${DOMAIN}`;

/** Builds a fresh sample studio and returns its token. */
export async function createDemo(): Promise<string> {
  await removeExpiredDemos();
  const [live] = await db.select({ n: sql<number>`count(*)::int` }).from(demoSandbox);
  if ((live?.n ?? 0) >= MAX_LIVE_DEMOS) throw new DemoUnavailable();

  const token = randomBytes(6).toString("hex");
  try {
    const { studioId } = await asDemoBuilder(() =>
      buildSampleStudio({
        slug: demoSlug(token),
        name: t("demo.studioName"),
        timezone: "Europe/Lisbon",
        password: demoPassword(token),
        email: (key) => demoEmail(key, token),
      }),
    );
    await db.insert(demoSandbox).values({ studioId, token, expiresAt: new Date(Date.now() + DEMO_LIFETIME_MS) });
  } catch (e) {
    await removeDemo(token);
    throw e;
  }
  return token;
}

/**
 * Signs in as the owner (coach view) or Mia (member view) of an existing demo. Returns the Better Auth
 * response, whose Set-Cookie headers log the visitor in, and where that view starts: the coach on
 * their dashboard, the member on the studio's invite page, the way a real member first arrives.
 */
export async function enterDemo(token: string, role: DemoRole): Promise<{ signIn: Response; landing: string }> {
  const slug = demoSlug(token);
  const signIn = await auth.api.signInEmail({
    body: { email: demoEmail(role === "coach" ? "owner" : "member", token), password: demoPassword(token) },
    asResponse: true,
  });
  if (role === "coach") return { signIn, landing: `/s/${slug}` };
  const [row] = await db
    .select({ code: studioSettings.joinCode })
    .from(studioSettings)
    .innerJoin(organization, eq(organization.id, studioSettings.studioId))
    .where(eq(organization.slug, slug));
  return { signIn, landing: row ? `/join/${slug}/${row.code}` : `/s/${slug}/me` };
}

/** A fresh demo, signed in as the chosen person. */
export async function startDemo(role: DemoRole): Promise<{ slug: string; signIn: Response; landing: string }> {
  const token = await createDemo();
  return { slug: demoSlug(token), ...(await enterDemo(token, role)) };
}

/** Deletes a demo studio, everything in it and its people. Safe to call more than once. */
export async function removeDemo(token: string): Promise<void> {
  if (!/^[a-f0-9]{12}$/.test(token)) return;
  await db.delete(organization).where(eq(organization.slug, demoSlug(token)));
  await db.delete(user).where(like(user.email, `%.${token}@${DOMAIN}`));
}

export async function removeExpiredDemos(): Promise<number> {
  const expired = await db
    .select({ token: demoSandbox.token })
    .from(demoSandbox)
    .where(lt(demoSandbox.expiresAt, new Date()));
  for (const { token } of expired) await removeDemo(token);
  return expired.length;
}

export async function demoExpiry(token: string): Promise<Date | null> {
  const [row] = await db
    .select({ expiresAt: demoSandbox.expiresAt })
    .from(demoSandbox)
    .where(eq(demoSandbox.token, token));
  return row?.expiresAt ?? null;
}
