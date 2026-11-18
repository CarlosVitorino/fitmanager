/**
 * The public studio page: what someone sees when they open the coach's invite link, before they
 * have an account. Shows only what the owner chose to publish: never members, bookings or credits.
 */
import { and, asc, eq, gte, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { msg } from "../i18n";
import { calendar, classTemplate, packType, slot, studioPage, studioSettings, user } from "../db/schema";
import { localDateOf } from "../domain/dates";
import { audit } from "./audit";
import { cleanHtml } from "./html";
import { requireCapability, type StudioContext } from "./studio-context";
import { db } from "./tx";

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

export const studioPageInput = z.object({
  tagline: opt(140),
  about: z.string().max(20_000).nullable(),
  address: opt(200),
  phone: opt(40),
  email: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null)
    .nullable()
    .refine((v) => v === null || z.email().safeParse(v).success, msg("site.errors.validEmail")),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (!v ? null : /^https?:\/\//i.test(v) ? v : `https://${v}`))
    .nullable()
    .refine((v) => v === null || URL.canParse(v), msg("site.errors.validWebsite")),
  instagram: z
    .string()
    .trim()
    .max(60)
    .transform((v) =>
      v
        .replace(/^@/, "")
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
        .replace(/\/$/, ""),
    )
    .transform((v) => v || null)
    .nullable()
    .refine((v) => v === null || /^[A-Za-z0-9._]{1,30}$/.test(v), msg("site.errors.validInstagram")),
  showSchedule: z.boolean(),
  showPlans: z.boolean(),
});
export type StudioPageInput = z.infer<typeof studioPageInput>;

export type StudioPage = StudioPageInput;

const EMPTY: StudioPage = {
  tagline: null,
  about: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  instagram: null,
  showSchedule: true,
  showPlans: true,
};

export async function getStudioPage(studioId: string): Promise<StudioPage> {
  const [row] = await db.select().from(studioPage).where(eq(studioPage.studioId, studioId));
  if (!row) return { ...EMPTY };
  return {
    tagline: row.tagline,
    about: row.about,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    instagram: row.instagram,
    showSchedule: row.showSchedule,
    showPlans: row.showPlans,
  };
}

export async function saveStudioPage(ctx: StudioContext, input: StudioPageInput) {
  requireCapability(ctx, "studio:settings");
  const values = { ...input, about: cleanHtml(input.about), updatedAt: new Date(), updatedBy: ctx.userId };
  await db
    .insert(studioPage)
    .values({ studioId: ctx.studioId, ...values })
    .onConflictDoUpdate({ target: studioPage.studioId, set: values });
  await audit(db, ctx, "studio_page.updated", null);
}

export interface PublicClass {
  weekday: number;
  startTime: string;
  durationMinutes: number;
  name: string;
  color: string;
  icon: string;
  coachName: string | null;
  capacity: number;
}

/** What the public page shows: the page text, the regular weekly classes and the plans on sale. */
export async function publicStudioInfo(studioId: string) {
  const [settings] = await db.select().from(studioSettings).where(eq(studioSettings.studioId, studioId));
  if (!settings) return null;
  const today = localDateOf(new Date(), settings.timezone);
  const page = await getStudioPage(studioId);
  const classes: PublicClass[] = page.showSchedule
    ? await db
        .select({
          weekday: slot.weekday,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          name: classTemplate.name,
          color: classTemplate.color,
          icon: classTemplate.icon,
          coachName: user.name,
          capacity: slot.capacity,
        })
        .from(slot)
        .innerJoin(classTemplate, eq(classTemplate.id, slot.templateId))
        .innerJoin(calendar, and(eq(calendar.id, slot.calendarId), isNull(calendar.archivedAt)))
        .leftJoin(user, eq(user.id, slot.coachId))
        .where(and(eq(slot.studioId, studioId), or(isNull(slot.endsOn), gte(slot.endsOn, today))))
        .orderBy(asc(slot.weekday), asc(slot.startTime))
    : [];
  const plans = page.showPlans
    ? await db
        .select()
        .from(packType)
        .where(and(eq(packType.studioId, studioId), isNull(packType.archivedAt)))
        .orderBy(asc(packType.sortOrder), asc(packType.createdAt))
    : [];
  return { page, classes, plans, currency: settings.currency, timezone: settings.timezone };
}
