/** Studio setup: plans (pack types), class templates and calendars. */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { calendar, classTemplate, packType } from "../db/schema";
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
    name: z.string().trim().min(2, "Give the plan a name").max(60),
    description: optionalText(300),
    entries: z.number().int().min(1, "At least one class").max(500),
    validityUnit: z.enum(["days", "weeks", "months"]).nullable(),
    validityAmount: z.number().int().min(1).max(1000).nullable(),
    priceCents: z.number().int().min(0).nullable(),
  })
  .refine((v) => (v.validityUnit === null) === (v.validityAmount === null), {
    message: "Set both how long the plan lasts and the unit, or neither",
  });
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
  if (!row) throw notFound("Plan not found");
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
export const DEFAULT_PACK_TYPES: PackTypeInput[] = [
  {
    name: "Single class",
    description: "One class.",
    entries: 1,
    validityUnit: "days",
    validityAmount: 30,
    priceCents: null,
  },
  {
    name: "Trimester pack",
    description: "10 classes over three months.",
    entries: 10,
    validityUnit: "months",
    validityAmount: 3,
    priceCents: null,
  },
  {
    name: "10-class pack",
    description: "10 classes, valid for 14 weeks.",
    entries: 10,
    validityUnit: "weeks",
    validityAmount: 14,
    priceCents: null,
  },
];

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
  name: z.string().trim().min(2, "Give the class a name").max(60),
  description: optionalText(300),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
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
  if (!row) throw notFound("Class type not found");
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
  name: z.string().trim().min(2, "Give the calendar a name").max(60),
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
  if (!row) throw notFound("Calendar not found");
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
  if (!row) throw notFound("Calendar not found");
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
  await db
    .insert(classTemplate)
    .values({ studioId, name: "General class", isDefault: true, icon: "🏋️", color: "#57534e" });
  await db.insert(calendar).values([
    { studioId, name: "Group classes", sortOrder: 0 },
    { studioId, name: "Private classes", sortOrder: 1 },
  ]);
  await db.insert(packType).values(DEFAULT_PACK_TYPES.map((t, i) => ({ ...t, studioId, sortOrder: i })));
}
