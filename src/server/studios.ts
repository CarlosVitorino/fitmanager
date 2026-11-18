import { z } from "zod";
import { db } from "../db/client";
import { studioSettings } from "../db/schema";
import { auth } from "../lib/auth";
import { badRequest } from "./errors";

export const RESERVED_SLUGS = new Set(["api", "admin", "login", "logout", "signup", "studios", "s", "new", "settings"]);

export const createStudioInput = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Address must be at least 3 characters")
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes")
    .refine((s) => !RESERVED_SLUGS.has(s), "That address is reserved"),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone"),
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
  if (!taken?.status) throw badRequest("That address is already taken");

  const org = await auth.api.createOrganization({ body: { name: input.name, slug: input.slug, userId } });
  if (!org) throw new Error("Studio creation failed");
  await db.insert(studioSettings).values({ studioId: org.id, timezone: input.timezone });
  return org;
}
