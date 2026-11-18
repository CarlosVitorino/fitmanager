import { aliasedTable, and, asc, eq, gte, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm";
import { z } from "zod";
import { msg, t } from "../i18n";
import { addDays, isLocalDate, isLocalTime, localDateOf, zonedToUtc, type LocalDate } from "../domain/dates";
import { occurrences } from "../domain/schedule";
import { booking, calendar, classSession, classTemplate, member, slot, user } from "../db/schema";
import { audit } from "./audit";
import { badRequest, notFound } from "./errors";
import { requireCapability, type StudioContext } from "./studio-context";
import { db } from "./tx";

/** How far ahead recurring slots are turned into bookable classes. */
export const SCHEDULE_HORIZON_DAYS = 56;

/* ---------- Recurring slots ---------- */

export const slotInput = z
  .object({
    calendarId: z.uuid(),
    templateId: z.uuid(),
    weekday: z.number().int().min(1).max(7),
    startTime: z.string().refine(isLocalTime, msg("errors.timeFormat")),
    durationMinutes: z.number().int().min(5).max(600),
    capacity: z.number().int().min(1, msg("errors.atLeastOneSpot")).max(500),
    coachId: z.string().nullable(),
    startsOn: z.string().refine(isLocalDate, msg("errors.validStartDate")),
    endsOn: z.string().refine(isLocalDate, msg("errors.pickDate")).nullable(),
  })
  .refine((v) => !v.endsOn || v.endsOn >= v.startsOn, msg("errors.endBeforeStart"));
export type SlotInput = z.infer<typeof slotInput>;

export function listSlots(ctx: StudioContext, calendarId: string) {
  const today = localDateOf(new Date(), ctx.timezone);
  return db
    .select({ slot, template: classTemplate, coachName: user.name })
    .from(slot)
    .innerJoin(classTemplate, eq(classTemplate.id, slot.templateId))
    .leftJoin(user, eq(user.id, slot.coachId))
    .where(
      and(
        eq(slot.studioId, ctx.studioId),
        eq(slot.calendarId, calendarId),
        or(isNull(slot.endsOn), gte(slot.endsOn, today)),
      ),
    )
    .orderBy(asc(slot.weekday), asc(slot.startTime));
}

async function assertOwnedRefs(ctx: StudioContext, input: SlotInput) {
  const [cal] = await db
    .select({ id: calendar.id })
    .from(calendar)
    .where(and(eq(calendar.id, input.calendarId), eq(calendar.studioId, ctx.studioId)));
  const [tpl] = await db
    .select({ id: classTemplate.id })
    .from(classTemplate)
    .where(and(eq(classTemplate.id, input.templateId), eq(classTemplate.studioId, ctx.studioId)));
  if (!cal || !tpl) throw notFound(t("errors.calendarOrTypeNotFound"));
  if (input.coachId) {
    const [c] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, ctx.studioId), eq(member.userId, input.coachId)));
    if (!c || c.role === "member") throw badRequest(t("errors.pickCoach"));
  }
}

/** Future classes from a slot that nobody has booked yet; safe to regenerate. */
function unbookedFutureSessions(ctx: StudioContext, slotId: string) {
  return and(
    eq(classSession.studioId, ctx.studioId),
    eq(classSession.slotId, slotId),
    gte(classSession.startsAt, new Date()),
    notExists(db.select({ id: booking.id }).from(booking).where(eq(booking.sessionId, classSession.id))),
  );
}

/**
 * Creates or changes a recurring slot. Changing one regenerates its future classes that have no
 * bookings; classes people already booked keep their time until a coach moves or cancels them.
 */
export async function saveSlot(ctx: StudioContext, input: SlotInput, id?: string) {
  requireCapability(ctx, "calendar:manage");
  await assertOwnedRefs(ctx, input);
  let row;
  if (!id) {
    [row] = await db
      .insert(slot)
      .values({ ...input, studioId: ctx.studioId })
      .returning();
  } else {
    await db.delete(classSession).where(unbookedFutureSessions(ctx, id));
    [row] = await db
      .update(slot)
      .set(input)
      .where(and(eq(slot.id, id), eq(slot.studioId, ctx.studioId)))
      .returning();
    if (!row) throw notFound(t("errors.slotNotFound"));
  }
  await ensureSessions(ctx);
  return row!;
}

/** Stops a slot from today: no new classes, and its unbooked future classes disappear. */
export async function endSlot(ctx: StudioContext, id: string) {
  requireCapability(ctx, "calendar:manage");
  const yesterday = addDays(localDateOf(new Date(), ctx.timezone), -1);
  await db.delete(classSession).where(unbookedFutureSessions(ctx, id));
  await db
    .update(slot)
    .set({ endsOn: yesterday })
    .where(and(eq(slot.id, id), eq(slot.studioId, ctx.studioId)));
}

/** Turns recurring slots into dated classes up to the horizon. Idempotent. */
export async function ensureSessions(
  ctx: Pick<StudioContext, "studioId" | "timezone">,
  from = localDateOf(new Date(), ctx.timezone),
  days = SCHEDULE_HORIZON_DAYS,
) {
  const to = addDays(from, days);
  const slots = await db
    .select()
    .from(slot)
    .where(
      and(eq(slot.studioId, ctx.studioId), lte(slot.startsOn, to), or(isNull(slot.endsOn), gte(slot.endsOn, from))),
    );
  const rows = slots.flatMap((s) =>
    occurrences(s, from, to, ctx.timezone).map((o) => ({
      studioId: ctx.studioId,
      calendarId: s.calendarId,
      templateId: s.templateId,
      slotId: s.id,
      localDate: o.localDate,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      capacity: s.capacity,
      coachId: s.coachId,
    })),
  );
  if (rows.length) await db.insert(classSession).values(rows).onConflictDoNothing();
}

/* ---------- One-off classes and edits ---------- */

export const oneOffInput = z.object({
  calendarId: z.uuid(),
  templateId: z.uuid(),
  date: z.string().refine(isLocalDate, msg("errors.pickDate")),
  startTime: z.string().refine(isLocalTime, msg("errors.timeFormat")),
  durationMinutes: z.number().int().min(5).max(600),
  capacity: z.number().int().min(1).max(500),
  coachId: z.string().nullable(),
});

export async function createOneOffSession(ctx: StudioContext, input: z.infer<typeof oneOffInput>) {
  requireCapability(ctx, "calendar:manage");
  await assertOwnedRefs(ctx, { ...input, weekday: 1, startsOn: input.date, endsOn: null });
  const startsAt = zonedToUtc(input.date, input.startTime, ctx.timezone);
  const [row] = await db
    .insert(classSession)
    .values({
      studioId: ctx.studioId,
      calendarId: input.calendarId,
      templateId: input.templateId,
      localDate: input.date,
      startsAt,
      endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000),
      capacity: input.capacity,
      coachId: input.coachId,
    })
    .returning();
  return row!;
}

export const sessionEditInput = z.object({
  capacity: z.number().int().min(1).max(500),
  coachId: z.string().nullable(),
  templateId: z.uuid(),
});

/** Change one class only (capacity, coach, type). Lowering capacity never removes anyone already booked. */
export async function updateSession(ctx: StudioContext, id: string, input: z.infer<typeof sessionEditInput>) {
  requireCapability(ctx, "calendar:manage");
  const [tpl] = await db
    .select({ id: classTemplate.id })
    .from(classTemplate)
    .where(and(eq(classTemplate.id, input.templateId), eq(classTemplate.studioId, ctx.studioId)));
  if (!tpl) throw notFound(t("errors.classTypeNotFound"));
  const [row] = await db
    .update(classSession)
    .set(input)
    .where(and(eq(classSession.id, id), eq(classSession.studioId, ctx.studioId)))
    .returning();
  if (!row) throw notFound(t("errors.classNotFound"));
  await audit(db, ctx, "session.updated", null, { sessionId: id, ...input });
  return row;
}

/* ---------- Reading the schedule ---------- */

export interface SessionListItem {
  id: string;
  localDate: LocalDate;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  booked: number;
  cancelled: boolean;
  calendarId: string;
  calendarName: string;
  templateId: string;
  templateName: string;
  templateDescription: string | null;
  color: string;
  icon: string;
  coachName: string | null;
  /** Only when asked for a member: their active booking in this class. */
  myBookingId: string | null;
}

const coach = aliasedTable(user, "coach");

/** Classes between two local dates (inclusive), with how many spots are taken. */
export async function listSessions(
  ctx: StudioContext,
  from: LocalDate,
  to: LocalDate,
  opts: { calendarId?: string | undefined; forMemberId?: string | undefined; includeCancelled?: boolean } = {},
): Promise<SessionListItem[]> {
  const mine = opts.forMemberId
    ? sql<string | null>`(select ${booking.id} from ${booking} where ${booking.sessionId} = ${classSession.id}
        and ${booking.memberId} = ${opts.forMemberId} and ${booking.status} = 'booked' limit 1)`
    : sql<null>`null`;
  return db
    .select({
      id: classSession.id,
      localDate: classSession.localDate,
      startsAt: classSession.startsAt,
      endsAt: classSession.endsAt,
      capacity: classSession.capacity,
      booked: sql<number>`(select count(*)::int from ${booking} where ${booking.sessionId} = ${classSession.id} and ${booking.status} = 'booked')`,
      cancelled: sql<boolean>`${classSession.cancelledAt} is not null`,
      calendarId: calendar.id,
      calendarName: calendar.name,
      templateId: classTemplate.id,
      templateName: classTemplate.name,
      templateDescription: classTemplate.description,
      color: classTemplate.color,
      icon: classTemplate.icon,
      coachName: coach.name,
      myBookingId: mine,
    })
    .from(classSession)
    .innerJoin(calendar, eq(calendar.id, classSession.calendarId))
    .innerJoin(classTemplate, eq(classTemplate.id, classSession.templateId))
    .leftJoin(coach, eq(coach.id, classSession.coachId))
    .where(
      and(
        eq(classSession.studioId, ctx.studioId),
        gte(classSession.localDate, from),
        lte(classSession.localDate, to),
        isNull(calendar.archivedAt),
        opts.calendarId ? eq(classSession.calendarId, opts.calendarId) : undefined,
        opts.includeCancelled ? undefined : isNull(classSession.cancelledAt),
      ),
    )
    .orderBy(asc(classSession.startsAt));
}

/** One class with its roster, for staff. */
export async function getSessionDetail(ctx: StudioContext, id: string) {
  requireCapability(ctx, "members:view");
  const [s] = await listSessionsById(ctx, [id]);
  if (!s) throw notFound(t("errors.classNotFound"));
  const roster = await db
    .select({
      bookingId: booking.id,
      memberId: booking.memberId,
      name: user.name,
      email: user.email,
      status: booking.status,
      charged: booking.charged,
      noShow: booking.noShow,
      settledAt: booking.settledAt,
      createdAt: booking.createdAt,
    })
    .from(booking)
    .innerJoin(user, eq(user.id, booking.memberId))
    .where(and(eq(booking.sessionId, id), eq(booking.studioId, ctx.studioId), ne(booking.status, "cancelled")))
    .orderBy(asc(booking.createdAt));
  const [raw] = await db
    .select({ templateId: classSession.templateId, coachId: classSession.coachId, slotId: classSession.slotId })
    .from(classSession)
    .where(eq(classSession.id, id));
  return { ...s, coachId: raw!.coachId, slotId: raw!.slotId, roster };
}

async function listSessionsById(ctx: StudioContext, ids: string[]) {
  const [first] = await db
    .select({ d: classSession.localDate })
    .from(classSession)
    .where(and(eq(classSession.studioId, ctx.studioId), inArray(classSession.id, ids)));
  if (!first) return [];
  const all = await listSessions(ctx, first.d, first.d, { includeCancelled: true });
  return all.filter((s) => ids.includes(s.id));
}

/** Upcoming classes a booking can be moved to. */
export function upcomingSessions(ctx: StudioContext, days = 21) {
  const today = localDateOf(new Date(), ctx.timezone);
  return listSessions(ctx, today, addDays(today, days)).then((list) => list.filter((s) => s.startsAt > new Date()));
}

/** Studio staff who can be assigned to classes. */
export function listCoaches(ctx: StudioContext) {
  return db
    .select({ id: user.id, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, ctx.studioId), inArray(member.role, ["owner", "coach"])))
    .orderBy(asc(user.name));
}

/** Sessions shaped for the calendar island (plain JSON). */
export function toCalendarSessions(list: SessionListItem[]) {
  return list.map((s) => ({
    id: s.id,
    start: s.startsAt.toISOString(),
    end: s.endsAt.toISOString(),
    title: s.templateName,
    icon: s.icon,
    color: s.color,
    templateId: s.templateId,
    calendarName: s.calendarName,
    coachName: s.coachName,
    description: s.templateDescription,
    booked: s.booked,
    capacity: s.capacity,
    cancelled: s.cancelled,
    myBookingId: s.myBookingId,
  }));
}
