import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { member, organization, studioSettings } from "../db/schema";
import { assertCan, isRole, type Capability, type Role } from "./authz";

/**
 * Everything server code needs to act inside one studio on behalf of one user.
 * Every studio-owned query takes this as its first argument and filters by `studioId`.
 */
export interface StudioContext {
  studioId: string;
  slug: string;
  name: string;
  userId: string;
  role: Role;
  timezone: string;
  currency: string;
  bookingCutoffMinutes: number;
  cancellationCutoffMinutes: number;
}

/** Resolves the studio by slug for a user. Returns null when the studio doesn't exist or the user isn't in it. */
export async function resolveStudioContext(db: Db, slug: string, userId: string): Promise<StudioContext | null> {
  const [row] = await db
    .select({
      studioId: organization.id,
      slug: organization.slug,
      name: organization.name,
      role: member.role,
      timezone: studioSettings.timezone,
      currency: studioSettings.currency,
      bookingCutoffMinutes: studioSettings.bookingCutoffMinutes,
      cancellationCutoffMinutes: studioSettings.cancellationCutoffMinutes,
    })
    .from(organization)
    .innerJoin(member, and(eq(member.organizationId, organization.id), eq(member.userId, userId)))
    .innerJoin(studioSettings, eq(studioSettings.studioId, organization.id))
    .where(eq(organization.slug, slug))
    .limit(1);

  if (!row || !isRole(row.role)) return null;
  return { ...row, role: row.role, userId };
}

export function requireCapability(ctx: StudioContext, capability: Capability): void {
  assertCan(ctx.role, capability);
}

/** Studios a user belongs to, for the home page switcher. */
export async function listUserStudios(db: Db, userId: string) {
  return db
    .select({ slug: organization.slug, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(organization.name);
}
