import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { computeAchievements } from "../domain/achievements";
import { localDateOf } from "../domain/dates";
import {
  auditLog,
  booking,
  calendar,
  classSession,
  classTemplate,
  creditEntry,
  member,
  memberNote,
  memberProfile,
  NOTE_CATEGORIES,
  organization,
  pack,
  payment,
  PAYMENT_METHODS,
  studioSettings,
  user,
} from "../db/schema";
import { auth } from "../lib/auth";
import { audit } from "./audit";
import { can, isRole, type Role } from "./authz";
import { badRequest, forbidden, notFound } from "./errors";
import { cleanHtml } from "./html";
import { LOCALES } from "../i18n/locales";
import { requireCapability, type StudioContext } from "./studio-context";
import { newJoinCode } from "./studios";
import { db } from "./tx";

/* ---------- Members list and profile ---------- */

export interface MemberRow {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  joinedAt: Date;
  available: number;
  activePacks: number;
  nextExpiry: string | null;
  lastClass: Date | null;
  upcoming: number;
}

/** Everyone in the studio with plan status at a glance. Call settleStudio first. */
export async function listMembers(ctx: StudioContext): Promise<MemberRow[]> {
  requireCapability(ctx, "members:view");
  const today = localDateOf(new Date(), ctx.timezone);
  // Raw SQL fragments need a string; postgres-js only serialises Dates in typed columns.
  const now = new Date().toISOString();
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      phone: memberProfile.phone,
      role: member.role,
      joinedAt: member.createdAt,
      available: sql<number>`coalesce((select sum(${creditEntry.delta}) from ${creditEntry}
        inner join ${pack} on ${pack.id} = ${creditEntry.packId}
        where ${creditEntry.memberId} = ${user.id} and ${creditEntry.studioId} = ${ctx.studioId}
          and ${pack.expiredAt} is null), 0)::int`,
      activePacks: sql<number>`(select count(*)::int from ${pack} where ${pack.memberId} = ${user.id}
        and ${pack.studioId} = ${ctx.studioId} and ${pack.expiredAt} is null
        and (${pack.expiresOn} is null or ${pack.expiresOn} >= ${today}))`,
      nextExpiry: sql<
        string | null
      >`(select min(${pack.expiresOn})::text from ${pack} where ${pack.memberId} = ${user.id}
        and ${pack.studioId} = ${ctx.studioId} and ${pack.expiredAt} is null and ${pack.expiresOn} >= ${today}
        and (select coalesce(sum(${creditEntry.delta}), 0) from ${creditEntry} where ${creditEntry.packId} = ${pack.id}) > 0)`,
      lastClass: sql<Date | null>`(select max(${classSession.startsAt}) from ${booking}
        inner join ${classSession} on ${classSession.id} = ${booking.sessionId}
        where ${booking.memberId} = ${user.id} and ${booking.studioId} = ${ctx.studioId}
          and ${booking.status} = 'booked' and ${classSession.startsAt} <= ${now}::timestamptz)`,
      upcoming: sql<number>`(select count(*)::int from ${booking}
        inner join ${classSession} on ${classSession.id} = ${booking.sessionId}
        where ${booking.memberId} = ${user.id} and ${booking.studioId} = ${ctx.studioId}
          and ${booking.status} = 'booked' and ${classSession.startsAt} > ${now}::timestamptz)`,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(memberProfile, and(eq(memberProfile.userId, user.id), eq(memberProfile.studioId, ctx.studioId)))
    .where(eq(member.organizationId, ctx.studioId))
    .orderBy(asc(user.name));
  return rows.map((r) => ({
    ...r,
    role: isRole(r.role) ? r.role : "member",
    lastClass: r.lastClass ? new Date(r.lastClass) : null,
  }));
}

export async function getMember(ctx: StudioContext, memberId: string) {
  if (memberId !== ctx.userId) requireCapability(ctx, "members:view");
  const [row] = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: member.role,
      joinedAt: member.createdAt,
      phone: memberProfile.phone,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .leftJoin(memberProfile, and(eq(memberProfile.userId, user.id), eq(memberProfile.studioId, ctx.studioId)))
    .where(and(eq(member.organizationId, ctx.studioId), eq(member.userId, memberId)));
  if (!row) throw notFound("Member not found");
  return { ...row, role: isRole(row.role) ? row.role : ("member" as Role) };
}

export const profileInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  phone: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v || null),
});

/** Members edit their own name and phone; staff can edit anyone's. */
export async function updateProfile(ctx: StudioContext, memberId: string, input: z.infer<typeof profileInput>) {
  if (memberId !== ctx.userId) requireCapability(ctx, "members:manage");
  await getMember(ctx, memberId);
  await db.update(user).set({ name: input.name, updatedAt: new Date() }).where(eq(user.id, memberId));
  await db
    .insert(memberProfile)
    .values({ studioId: ctx.studioId, userId: memberId, phone: input.phone })
    .onConflictDoUpdate({
      target: [memberProfile.studioId, memberProfile.userId],
      set: { phone: input.phone, updatedAt: new Date() },
    });
}

/** Owner promotes a member to coach or back. The last owner can't be demoted. */
export async function setRole(ctx: StudioContext, memberId: string, role: Role) {
  requireCapability(ctx, "staff:manage");
  const target = await getMember(ctx, memberId);
  if (target.role === role) return;
  if (target.role === "owner") {
    const [{ owners } = { owners: 0 }] = await db
      .select({ owners: sql<number>`count(*)::int` })
      .from(member)
      .where(and(eq(member.organizationId, ctx.studioId), eq(member.role, "owner")));
    if (owners <= 1) throw badRequest("A studio needs at least one owner.");
  }
  await db
    .update(member)
    .set({ role })
    .where(and(eq(member.organizationId, ctx.studioId), eq(member.userId, memberId)));
  await audit(db, ctx, "member.role_changed", memberId, { from: target.role, to: role });
}

/* ---------- Class history and achievements ---------- */

export interface HistoryItem {
  bookingId: string;
  sessionId: string;
  startsAt: Date;
  localDate: string;
  templateName: string;
  color: string;
  icon: string;
  calendarName: string;
  status: "booked" | "cancelled" | "late_cancelled";
  charged: boolean;
  noShow: boolean;
  settled: boolean;
  sessionCancelled: boolean;
  packName: string | null;
}

/** Every booking a member has made, newest first. */
export async function classHistory(ctx: StudioContext, memberId: string): Promise<HistoryItem[]> {
  if (memberId !== ctx.userId) requireCapability(ctx, "members:view");
  const rows = await db
    .select({
      bookingId: booking.id,
      sessionId: classSession.id,
      startsAt: classSession.startsAt,
      localDate: classSession.localDate,
      templateName: classTemplate.name,
      color: classTemplate.color,
      icon: classTemplate.icon,
      calendarName: calendar.name,
      status: booking.status,
      charged: booking.charged,
      noShow: booking.noShow,
      settledAt: booking.settledAt,
      sessionCancelledAt: classSession.cancelledAt,
      packName: pack.name,
    })
    .from(booking)
    .innerJoin(classSession, eq(classSession.id, booking.sessionId))
    .innerJoin(classTemplate, eq(classTemplate.id, classSession.templateId))
    .innerJoin(calendar, eq(calendar.id, classSession.calendarId))
    .leftJoin(pack, eq(pack.id, booking.packId))
    .where(and(eq(booking.studioId, ctx.studioId), eq(booking.memberId, memberId)))
    .orderBy(desc(classSession.startsAt), desc(booking.createdAt));
  return rows.map(({ settledAt, sessionCancelledAt, ...r }) => ({
    ...r,
    settled: settledAt !== null,
    sessionCancelled: sessionCancelledAt !== null,
  }));
}

/** Attended = the class happened, the member was booked and wasn't marked a no-show. */
export function attendedDates(history: readonly HistoryItem[]): string[] {
  return history.filter((h) => h.status === "booked" && h.settled && !h.noShow).map((h) => h.localDate);
}

export function memberAchievements(ctx: StudioContext, history: readonly HistoryItem[]) {
  return computeAchievements(attendedDates(history), localDateOf(new Date(), ctx.timezone));
}

/* ---------- Notes ---------- */

export const noteInput = z.object({
  body: z.string().max(50000),
  visibility: z.enum(["private", "shared"]),
  category: z.enum(NOTE_CATEGORIES).default("general"),
  pinned: z.boolean().default(false),
});

export type NoteInput = z.input<typeof noteInput>;

function cleanNote(raw: NoteInput) {
  const input = noteInput.parse(raw);
  const body = cleanHtml(input.body);
  if (!body) throw badRequest("Write something");
  return { ...input, body };
}

/** Staff see every note; members only see notes shared with them. */
export async function listNotes(ctx: StudioContext, memberId: string) {
  if (memberId !== ctx.userId) requireCapability(ctx, "members:view");
  const canSeePrivate = can(ctx.role, "notes:private");
  return db
    .select({
      id: memberNote.id,
      body: memberNote.body,
      visibility: memberNote.visibility,
      category: memberNote.category,
      pinned: memberNote.pinned,
      createdAt: memberNote.createdAt,
      updatedAt: memberNote.updatedAt,
      authorName: user.name,
    })
    .from(memberNote)
    .leftJoin(user, eq(user.id, memberNote.authorId))
    .where(
      and(
        eq(memberNote.studioId, ctx.studioId),
        eq(memberNote.memberId, memberId),
        canSeePrivate ? undefined : eq(memberNote.visibility, "shared"),
      ),
    )
    .orderBy(desc(memberNote.pinned), desc(memberNote.createdAt));
}

export async function addNote(ctx: StudioContext, memberId: string, input: NoteInput) {
  requireCapability(ctx, "notes:private");
  await getMember(ctx, memberId);
  await db.insert(memberNote).values({ ...cleanNote(input), studioId: ctx.studioId, memberId, authorId: ctx.userId });
}

export async function updateNote(ctx: StudioContext, noteId: string, input: NoteInput) {
  requireCapability(ctx, "notes:private");
  const [row] = await db
    .update(memberNote)
    .set({ ...cleanNote(input), updatedAt: new Date() })
    .where(and(eq(memberNote.id, noteId), eq(memberNote.studioId, ctx.studioId)))
    .returning({ id: memberNote.id });
  if (!row) throw notFound("Note not found");
}

export async function setNotePinned(ctx: StudioContext, noteId: string, pinned: boolean) {
  requireCapability(ctx, "notes:private");
  await db
    .update(memberNote)
    .set({ pinned })
    .where(and(eq(memberNote.id, noteId), eq(memberNote.studioId, ctx.studioId)));
}

export async function deleteNote(ctx: StudioContext, noteId: string) {
  requireCapability(ctx, "notes:private");
  await db.delete(memberNote).where(and(eq(memberNote.id, noteId), eq(memberNote.studioId, ctx.studioId)));
}

/* ---------- Payments ---------- */

export const paymentInput = z.object({
  amountCents: z.number().int().min(0),
  method: z.enum(PAYMENT_METHODS),
  paidOn: z.string(),
  note: z.string().trim().max(500).optional(),
  packId: z.uuid().nullable().optional(),
});

export async function recordPayment(ctx: StudioContext, memberId: string, input: z.infer<typeof paymentInput>) {
  requireCapability(ctx, "credits:manage");
  await getMember(ctx, memberId);
  const [row] = await db
    .insert(payment)
    .values({
      studioId: ctx.studioId,
      memberId,
      packId: input.packId ?? null,
      amountCents: input.amountCents,
      currency: ctx.currency,
      method: input.method,
      paidOn: input.paidOn,
      note: input.note || null,
      recordedBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "payment.recorded", memberId, { paymentId: row!.id, amountCents: input.amountCents });
  return row!;
}

export async function deletePayment(ctx: StudioContext, paymentId: string) {
  requireCapability(ctx, "credits:manage");
  const [row] = await db
    .delete(payment)
    .where(and(eq(payment.id, paymentId), eq(payment.studioId, ctx.studioId)))
    .returning();
  if (!row) throw notFound("Payment not found");
  await audit(db, ctx, "payment.deleted", row.memberId, {
    amountCents: row.amountCents,
    method: row.method,
    paidOn: row.paidOn,
  });
}

/** Payments for one member, or (staff) the whole studio in a date range. */
export async function listPayments(ctx: StudioContext, opts: { memberId?: string; from?: string; to?: string } = {}) {
  if (opts.memberId !== ctx.userId) requireCapability(ctx, "members:view");
  return db
    .select({
      id: payment.id,
      memberId: payment.memberId,
      memberName: user.name,
      amountCents: payment.amountCents,
      currency: payment.currency,
      method: payment.method,
      paidOn: payment.paidOn,
      note: payment.note,
      packName: pack.name,
      createdAt: payment.createdAt,
    })
    .from(payment)
    .innerJoin(user, eq(user.id, payment.memberId))
    .leftJoin(pack, eq(pack.id, payment.packId))
    .where(
      and(
        eq(payment.studioId, ctx.studioId),
        opts.memberId ? eq(payment.memberId, opts.memberId) : undefined,
        opts.from ? sql`${payment.paidOn} >= ${opts.from}` : undefined,
        opts.to ? sql`${payment.paidOn} <= ${opts.to}` : undefined,
      ),
    )
    .orderBy(desc(payment.paidOn), desc(payment.createdAt));
}

/* ---------- Audit ---------- */

export async function memberAudit(ctx: StudioContext, memberId: string, limit = 50) {
  requireCapability(ctx, "members:view");
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      details: auditLog.details,
      createdAt: auditLog.createdAt,
      actorName: user.name,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(eq(auditLog.studioId, ctx.studioId), eq(auditLog.memberId, memberId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/* ---------- Settings and invite link ---------- */

export const settingsInput = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like EUR"),
  locale: z.enum(LOCALES),
  bookingCutoffMinutes: z.number().int().min(0).max(10080),
  cancellationCutoffMinutes: z.number().int().min(0).max(10080),
});

export async function getSettings(ctx: StudioContext) {
  const [row] = await db.select().from(studioSettings).where(eq(studioSettings.studioId, ctx.studioId));
  return row!;
}

export async function updateSettings(ctx: StudioContext, input: z.infer<typeof settingsInput>) {
  requireCapability(ctx, "studio:settings");
  const { isValidTimezone } = await import("./studios");
  if (!isValidTimezone(input.timezone)) throw badRequest("Unknown timezone");
  await db.update(organization).set({ name: input.name }).where(eq(organization.id, ctx.studioId));
  await db
    .update(studioSettings)
    .set({
      timezone: input.timezone,
      currency: input.currency,
      locale: input.locale,
      bookingCutoffMinutes: input.bookingCutoffMinutes,
      cancellationCutoffMinutes: input.cancellationCutoffMinutes,
      updatedAt: new Date(),
    })
    .where(eq(studioSettings.studioId, ctx.studioId));
  await audit(db, ctx, "settings.updated", null, input);
}

export async function regenerateJoinCode(ctx: StudioContext) {
  requireCapability(ctx, "staff:manage");
  await db.update(studioSettings).set({ joinCode: newJoinCode() }).where(eq(studioSettings.studioId, ctx.studioId));
  await audit(db, ctx, "invite.regenerated", null);
}

/** Looks up a studio from its public invite link. */
export async function findStudioByInvite(slug: string, code: string) {
  const [row] = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      joinCode: studioSettings.joinCode,
    })
    .from(organization)
    .innerJoin(studioSettings, eq(studioSettings.studioId, organization.id))
    .where(eq(organization.slug, slug));
  if (!row || row.joinCode !== code) return null;
  return { id: row.id, name: row.name, slug: row.slug };
}

/** Adds the user to the studio as a member. Already in it: nothing changes. */
export async function joinStudio(userId: string, slug: string, code: string) {
  const studio = await findStudioByInvite(slug, code);
  if (!studio) throw forbidden("This invite link is no longer valid. Ask your coach for a new one.");
  const [existing] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, studio.id), eq(member.userId, userId)));
  if (!existing) await auth.api.addMember({ body: { organizationId: studio.id, userId, role: "member" } });
  return studio;
}

/** Packs that are about to matter: for the staff dashboard. */
export async function packsExpiringSoon(ctx: StudioContext, withinDays = 14) {
  requireCapability(ctx, "members:view");
  const today = localDateOf(new Date(), ctx.timezone);
  const { addDays } = await import("../domain/dates");
  const until = addDays(today, withinDays);
  return db
    .select({
      packId: pack.id,
      memberId: pack.memberId,
      memberName: user.name,
      name: pack.name,
      expiresOn: pack.expiresOn,
      available: sql<number>`coalesce((select sum(${creditEntry.delta}) from ${creditEntry} where ${creditEntry.packId} = ${pack.id}), 0)::int`,
    })
    .from(pack)
    .innerJoin(user, eq(user.id, pack.memberId))
    .where(
      and(
        eq(pack.studioId, ctx.studioId),
        isNull(pack.expiredAt),
        sql`${pack.expiresOn} between ${today} and ${until}`,
      ),
    )
    .orderBy(asc(pack.expiresOn));
}
