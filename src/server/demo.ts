/**
 * Public demo: every visitor who presses "Try the demo" gets their own copy of a sample studio,
 * so nothing one visitor does shows up for another (the coach demo and the member demo are separate
 * copies too). The copy and its people are deleted when the visitor logs out, or after
 * DEMO_LIFETIME_MS at the latest.
 */
import { randomBytes } from "node:crypto";
import { eq, like, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { demoSandbox, organization, user } from "../db/schema";
import { t } from "../i18n";
import { auth } from "../lib/auth";
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
 * Builds a fresh sample studio and returns the Better Auth sign-in response for the chosen person
 * (the owner for the coach demo, Mia for the member demo). Its Set-Cookie headers log the visitor in.
 */
export async function startDemo(role: DemoRole): Promise<{ slug: string; signIn: Response }> {
  await removeExpiredDemos();
  const [live] = await db.select({ n: sql<number>`count(*)::int` }).from(demoSandbox);
  if ((live?.n ?? 0) >= MAX_LIVE_DEMOS) throw new DemoUnavailable();

  const token = randomBytes(6).toString("hex");
  const password = randomBytes(18).toString("base64url");
  const slug = demoSlug(token);
  const email = (key: string) => `${key}.${token}@${DOMAIN}`;
  try {
    const { studioId } = await asDemoBuilder(() =>
      buildSampleStudio({ slug, name: t("demo.studioName"), timezone: "Europe/Lisbon", password, email }),
    );
    await db.insert(demoSandbox).values({ studioId, token, expiresAt: new Date(Date.now() + DEMO_LIFETIME_MS) });
  } catch (e) {
    await removeDemo(token);
    throw e;
  }
  const signIn = await auth.api.signInEmail({
    body: { email: email(role === "coach" ? "owner" : "member"), password },
    asResponse: true,
  });
  return { slug, signIn };
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
