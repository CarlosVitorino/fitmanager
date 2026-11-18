import { randomBytes } from "node:crypto";
import { z } from "zod";
import { msg, t } from "../i18n";
import { db } from "../db/client";
import { studioSettings } from "../db/schema";
import { auth } from "../lib/auth";
import { seedStudioDefaults } from "./catalog";
import { badRequest } from "./errors";

export const RESERVED_SLUGS = new Set(["api", "admin", "login", "logout", "signup", "studios", "s", "new", "settings"]);

export const createStudioInput = z.object({
  name: z.string().trim().min(2, msg("errors.nameTooShort")).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, msg("errors.slugLength"))
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, msg("errors.slugChars"))
    .refine((s) => !RESERVED_SLUGS.has(s), msg("errors.slugReserved")),
  timezone: z.string().refine(isValidTimezone, msg("errors.unknownTimezone")),
});

export type CreateStudioInput = z.infer<typeof createStudioInput>;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Creates a studio with `userId` as owner, plus its default settings. */
export async function createStudio(userId: string, input: CreateStudioInput) {
  const taken = await auth.api.checkOrganizationSlug({ body: { slug: input.slug } }).catch(() => null);
  if (!taken?.status) throw badRequest(t("errors.slugTaken"));

  const org = await auth.api.createOrganization({ body: { name: input.name, slug: input.slug, userId } });
  if (!org) throw new Error("Studio creation failed");
  await db.insert(studioSettings).values({ studioId: org.id, timezone: input.timezone, joinCode: newJoinCode() });
  await seedStudioDefaults(org.id);
  return org;
}

/** Secret for the member invite link. */
export function newJoinCode(): string {
  return randomBytes(9).toString("base64url");
}
