/** Studio setup: plans (pack types), class templates and calendars. */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { calendar, classTemplate, packType } from "../db/schema";
import { msg, t } from "../i18n";
import { notFound } from "./errors";
import { requireCapability, type StudioContext } from "./studio-context";
import { db } from "./tx";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

/* ---------- Plans ---------- */

export const packTypeInput = z
  .object({
    name: z.string().trim().min(2, msg("errors.namePlan")).max(60),
    description: optionalText(300),
    entries: z.number().int().min(1, msg("errors.atLeastOneClass")).max(500),
    validityUnit: z.enum(["days", "weeks", "months"]).nullable(),
    validityAmount: z.number().int().min(1).max(1000).nullable(),
    priceCents: z.number().int().min(0).nullable(),
  })
  .refine((v) => (v.validityUnit === null) === (v.validityAmount === null), msg("errors.validityPair"));
export type PackTypeInput = z.infer<typeof packTypeInput>;

export function listPackTypes(ctx: StudioContext, opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(packType)
    .where(and(eq(packType.studioId, ctx.studioId), opts.includeArchived ? undefined : isNull(packType.archivedAt)))
    .orderBy(asc(packType.sortOrder), asc(packType.createdAt));
}

export async function savePackType(ctx: StudioContext, input: PackTypeInput, id?: string) {
  requireCapability(ctx, "studio:settings");
  if (!id)
    return (
      await db
        .insert(packType)
        .values({ ...input, studioId: ctx.studioId })
        .returning()
    )[0]!;
  const [row] = await db
    .update(packType)
    .set(input)
    .where(and(eq(packType.id, id), eq(packType.studioId, ctx.studioId)))
    .returning();
  if (!row) throw notFound(t("errors.planNotFound"));
  return row;
}

export async function archivePackType(ctx: StudioContext, id: string, archived = true) {
  requireCapability(ctx, "studio:settings");
  await db
    .update(packType)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(packType.id, id), eq(packType.studioId, ctx.studioId)));
}

/** The three standard plans a new studio starts with. Prices left empty for the owner to fill in. */
export function defaultPackTypes(): PackTypeInput[] {
  return [
    {
      name: t("setup.defaults.singleName"),
      description: t("setup.defaults.singleDesc"),
      entries: 1,
      validityUnit: "days",
      validityAmount: 30,
      priceCents: null,
    },
    {
      name: t("setup.defaults.trimesterName"),
      description: t("setup.defaults.trimesterDesc"),
      entries: 10,
      validityUnit: "months",
      validityAmount: 3,
      priceCents: null,
    },
    {
      name: t("setup.defaults.tenName"),
      description: t("setup.defaults.tenDesc"),
      entries: 10,
      validityUnit: "weeks",
      validityAmount: 14,
      priceCents: null,
    },
  ];
}

/* ---------- Class templates ---------- */

export const TEMPLATE_ICONS = ["🏋️", "💪", "🦵", "🧘", "🏃", "🥊", "🚴", "🤸", "🔥", "❤️", "⚡", "🌿"] as const;
export const TEMPLATE_COLORS = [
  "#57534e",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
] as const;

export const templateInput = z.object({
  name: z.string().trim().min(2, msg("errors.nameClass")).max(60),
  description: optionalText(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, msg("errors.pickColour")),
  icon: z.string().min(1).max(8),
});
export type TemplateInput = z.infer<typeof templateInput>;

export function listTemplates(ctx: StudioContext, opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(classTemplate)
    .where(
      and(
        eq(classTemplate.studioId, ctx.studioId),
        opts.includeArchived ? undefined : isNull(classTemplate.archivedAt),
      ),
    )
    .orderBy(sql`${classTemplate.isDefault} desc`, asc(classTemplate.name));
}

export async function saveTemplate(ctx: StudioContext, input: TemplateInput, id?: string) {
  requireCapability(ctx, "calendar:manage");
  if (!id)
    return (
      await db
        .insert(classTemplate)
        .values({ ...input, studioId: ctx.studioId })
        .returning()
    )[0]!;
  const [row] = await db
    .update(classTemplate)
    .set(input)
    .where(and(eq(classTemplate.id, id), eq(classTemplate.studioId, ctx.studioId)))
    .returning();
  if (!row) throw notFound(t("errors.classTypeNotFound"));
  return row;
}

/** The default "General class" can't be archived; every studio keeps one. */
export async function archiveTemplate(ctx: StudioContext, id: string, archived = true) {
  requireCapability(ctx, "calendar:manage");
  await db
    .update(classTemplate)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(classTemplate.id, id), eq(classTemplate.studioId, ctx.studioId), eq(classTemplate.isDefault, false)));
}

/* ---------- Calendars ---------- */

export const calendarInput = z.object({
  name: z.string().trim().min(2, msg("errors.nameCalendar")).max(60),
  description: optionalText(300),
});

export function listCalendars(ctx: StudioContext) {
  return db
    .select()
    .from(calendar)
    .where(and(eq(calendar.studioId, ctx.studioId), isNull(calendar.archivedAt)))
    .orderBy(asc(calendar.sortOrder), asc(calendar.createdAt));
}

export async function getCalendar(ctx: StudioContext, id: string) {
  const [row] = await db
    .select()
    .from(calendar)
    .where(and(eq(calendar.id, id), eq(calendar.studioId, ctx.studioId), isNull(calendar.archivedAt)));
  if (!row) throw notFound(t("errors.calendarNotFound"));
  return row;
}

export async function saveCalendar(ctx: StudioContext, input: z.infer<typeof calendarInput>, id?: string) {
  requireCapability(ctx, "calendar:manage");
  if (!id)
    return (
      await db
        .insert(calendar)
        .values({ ...input, studioId: ctx.studioId })
        .returning()
    )[0]!;
  const [row] = await db
    .update(calendar)
    .set(input)
    .where(and(eq(calendar.id, id), eq(calendar.studioId, ctx.studioId)))
    .returning();
  if (!row) throw notFound(t("errors.calendarNotFound"));
  return row;
}

export async function archiveCalendar(ctx: StudioContext, id: string) {
  requireCapability(ctx, "calendar:manage");
  await db
    .update(calendar)
    .set({ archivedAt: new Date() })
    .where(and(eq(calendar.id, id), eq(calendar.studioId, ctx.studioId)));
}

/** What a new studio starts with: a General class, two calendars and the three standard plans. */
export async function seedStudioDefaults(studioId: string) {
  // Written in the language of the person creating the studio; they can rename everything later.
  await db
    .insert(classTemplate)
    .values({ studioId, name: t("setup.types.defaultName"), isDefault: true, icon: "🏋️", color: "#57534e" });
  await db.insert(calendar).values([
    { studioId, name: t("setup.calendars.defaultGroup"), sortOrder: 0 },
    { studioId, name: t("setup.calendars.defaultPrivate"), sortOrder: 1 },
  ]);
  await db.insert(packType).values(defaultPackTypes().map((p, i) => ({ ...p, studioId, sortOrder: i })));
}
