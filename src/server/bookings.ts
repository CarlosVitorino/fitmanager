import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { chargeChange, decideBooking, decideCancellation, REFUSAL_MESSAGES } from "../domain/booking";
import { makeEntry } from "../domain/ledger";
import { booking, classSession, creditEntry, member, pack } from "../db/schema";
import { audit } from "./audit";
import { HttpError, badRequest, forbidden, notFound } from "./errors";
import { requireCapability, type StudioContext } from "./studio-context";
import { db, type Tx } from "./tx";

/*
 * Booking changes run in a transaction that locks the class first, then the member's packs, so two
 * people can't take the last spot and one member can't spend the same credit twice.
 */

async function lockSession(tx: Tx, ctx: StudioContext, sessionId: string) {
  const [s] = await tx
    .select()
    .from(classSession)
    .where(and(eq(classSession.id, sessionId), eq(classSession.studioId, ctx.studioId)))
    .for("update");
  if (!s) throw notFound("Class not found");
  return s;
}

async function availablePacks(tx: Tx, ctx: StudioContext, memberId: string) {
  const packs = await tx
    .select({ id: pack.id, startsOn: pack.startsOn, expiresOn: pack.expiresOn, createdAt: pack.createdAt })
    .from(pack)
    .where(and(eq(pack.studioId, ctx.studioId), eq(pack.memberId, memberId), isNull(pack.expiredAt)))
    .for("update");
  if (!packs.length) return [];
  const sums = await tx
    .select({ packId: creditEntry.packId, available: sql<number>`coalesce(sum(${creditEntry.delta}), 0)::int` })
    .from(creditEntry)
    .where(
      inArray(
        creditEntry.packId,
        packs.map((p) => p.id),
      ),
    )
    .groupBy(creditEntry.packId);
  const byPack = new Map(sums.map((s) => [s.packId, s.available]));
  return packs.map((p) => ({ ...p, available: byPack.get(p.id) ?? 0 }));
}

async function insertBooking(tx: Tx, ctx: StudioContext, sessionId: string, memberId: string, byStaff: boolean) {
  const s = await lockSession(tx, ctx, sessionId);
  const [m] = await tx
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, ctx.studioId), eq(member.userId, memberId)));
  if (!m) throw notFound("Member not found");

  const [counts] = await tx
    .select({
      booked: sql<number>`count(*)::int`,
      mine: sql<number>`count(*) filter (where ${booking.memberId} = ${memberId})::int`,
    })
    .from(booking)
    .where(and(eq(booking.sessionId, s.id), eq(booking.status, "booked")));

  const decision = decideBooking({
    now: new Date(),
    startsAt: s.startsAt,
    classDate: s.localDate,
    cancelled: s.cancelledAt !== null,
    capacity: s.capacity,
    bookedCount: counts?.booked ?? 0,
    alreadyBooked: (counts?.mine ?? 0) > 0,
    bookingCutoffMinutes: ctx.bookingCutoffMinutes,
    packs: await availablePacks(tx, ctx, memberId),
    byStaff,
  });
  if (!decision.ok) throw new HttpError(409, REFUSAL_MESSAGES[decision.reason]);

  const [b] = await tx
    .insert(booking)
    .values({ studioId: ctx.studioId, sessionId: s.id, memberId, packId: decision.pack.id, createdBy: ctx.userId })
    .returning();
  await tx.insert(creditEntry).values({
    studioId: ctx.studioId,
    packId: decision.pack.id,
    memberId,
    bookingId: b!.id,
    actorId: ctx.userId,
    ...makeEntry("reserve"),
  });
  return { booking: b!, session: s };
}

/** A member books themselves into a class. */
export async function bookSelf(ctx: StudioContext, sessionId: string) {
  requireCapability(ctx, "bookings:self");
  return db.transaction((tx) => insertBooking(tx, ctx, sessionId, ctx.userId, false));
}

/** Staff book a member in, ignoring the booking window and capacity. */
export async function addMemberToSession(ctx: StudioContext, sessionId: string, memberId: string) {
  requireCapability(ctx, "members:manage");
  return db.transaction(async (tx) => {
    const r = await insertBooking(tx, ctx, sessionId, memberId, true);
    await audit(tx, ctx, "booking.added", memberId, {
      bookingId: r.booking.id,
      sessionId,
      startsAt: r.session.startsAt,
    });
    return r;
  });
}

async function lockBooking(tx: Tx, ctx: StudioContext, bookingId: string) {
  const [b] = await tx
    .select({ booking, startsAt: classSession.startsAt })
    .from(booking)
    .innerJoin(classSession, eq(classSession.id, booking.sessionId))
    .where(and(eq(booking.id, bookingId), eq(booking.studioId, ctx.studioId)))
    .for("update", { of: booking });
  if (!b) throw notFound("Booking not found");
  return b;
}

async function release(tx: Tx, ctx: StudioContext, b: typeof booking.$inferSelect, status: "cancelled") {
  await tx
    .update(booking)
    .set({ status, charged: false, cancelledAt: new Date(), cancelledBy: ctx.userId })
    .where(eq(booking.id, b.id));
  // A booking whose credit was already refunded has nothing left to give back.
  if (b.packId && b.charged) {
    await tx.insert(creditEntry).values({
      studioId: ctx.studioId,
      packId: b.packId,
      memberId: b.memberId,
      bookingId: b.id,
      actorId: ctx.userId,
      ...makeEntry("release"),
    });
  }
}

export type CancelResult = "released" | "late";

/** A member cancels their own booking. Inside the cancellation window the credit stays spent. */
export async function cancelOwnBooking(ctx: StudioContext, bookingId: string): Promise<CancelResult> {
  requireCapability(ctx, "bookings:self");
  return db.transaction(async (tx) => {
    const { booking: b, startsAt } = await lockBooking(tx, ctx, bookingId);
    if (b.memberId !== ctx.userId) throw forbidden();
    if (b.status !== "booked") throw badRequest("This booking is already cancelled.");
    const outcome = decideCancellation(startsAt, new Date(), ctx.cancellationCutoffMinutes);
    if (outcome === "too_late") throw badRequest("This class has already started.");
    if (outcome === "release") {
      await release(tx, ctx, b, "cancelled");
      return "released";
    }
    await tx
      .update(booking)
      .set({ status: "late_cancelled", cancelledAt: new Date(), cancelledBy: ctx.userId })
      .where(eq(booking.id, b.id));
    return "late";
  });
}

/** Staff remove a booking at any time; the credit always goes back. */
export async function removeBooking(ctx: StudioContext, bookingId: string, reason?: string) {
  requireCapability(ctx, "members:manage");
  return db.transaction(async (tx) => {
    const { booking: b, startsAt } = await lockBooking(tx, ctx, bookingId);
    if (b.status === "cancelled") throw badRequest("This booking is already cancelled.");
    await release(tx, ctx, b, "cancelled");
    await audit(tx, ctx, "booking.removed", b.memberId, { bookingId: b.id, sessionId: b.sessionId, startsAt, reason });
  });
}

/** Staff move a booking to another class: the old credit goes back, the new class reserves one. */
export async function moveBooking(ctx: StudioContext, bookingId: string, toSessionId: string) {
  requireCapability(ctx, "members:manage");
  return db.transaction(async (tx) => {
    const { booking: b, startsAt } = await lockBooking(tx, ctx, bookingId);
    if (b.status !== "booked") throw badRequest("Only active bookings can be moved.");
    if (b.sessionId === toSessionId) throw badRequest("Pick a different class.");
    await release(tx, ctx, b, "cancelled");
    const r = await insertBooking(tx, ctx, toSessionId, b.memberId, true);
    await audit(tx, ctx, "booking.moved", b.memberId, {
      fromBookingId: b.id,
      toBookingId: r.booking.id,
      from: startsAt,
      to: r.session.startsAt,
    });
    return r;
  });
}

/** Coach decides whether a booking's credit is spent (default yes, e.g. for a no-show). */
export async function setBookingCharged(ctx: StudioContext, bookingId: string, charged: boolean) {
  requireCapability(ctx, "credits:manage");
  return db.transaction(async (tx) => {
    const { booking: b } = await lockBooking(tx, ctx, bookingId);
    if (b.status === "cancelled") throw badRequest("Cancelled bookings don't use a credit.");
    if (!b.packId) throw badRequest("This booking isn't linked to a pack.");
    const kind = chargeChange(b.charged, charged);
    if (!kind) return;
    await tx.update(booking).set({ charged }).where(eq(booking.id, b.id));
    await tx.insert(creditEntry).values({
      studioId: ctx.studioId,
      packId: b.packId,
      memberId: b.memberId,
      bookingId: b.id,
      actorId: ctx.userId,
      ...makeEntry(kind),
    });
    await audit(tx, ctx, "booking.charge_changed", b.memberId, { bookingId: b.id, charged });
  });
}

/** Coach marks whether the member showed up. Doesn't touch credits. */
export async function setNoShow(ctx: StudioContext, bookingId: string, noShow: boolean) {
  requireCapability(ctx, "members:manage");
  return db.transaction(async (tx) => {
    const { booking: b } = await lockBooking(tx, ctx, bookingId);
    if (b.status !== "booked") throw badRequest("Only bookings that weren't cancelled can be marked.");
    if (b.noShow === noShow) return;
    await tx.update(booking).set({ noShow }).where(eq(booking.id, b.id));
    await audit(tx, ctx, "booking.no_show_changed", b.memberId, { bookingId: b.id, noShow });
  });
}

/** Staff cancel a whole class: every booking is cancelled and its credit returned. */
export async function cancelSession(ctx: StudioContext, sessionId: string) {
  requireCapability(ctx, "calendar:manage");
  return db.transaction(async (tx) => {
    const s = await lockSession(tx, ctx, sessionId);
    if (s.cancelledAt) throw badRequest("This class is already cancelled.");
    await tx.update(classSession).set({ cancelledAt: new Date() }).where(eq(classSession.id, s.id));
    const active = await tx
      .select()
      .from(booking)
      .where(and(eq(booking.sessionId, s.id), ne(booking.status, "cancelled")))
      .for("update");
    for (const b of active) await release(tx, ctx, b, "cancelled");
    await audit(tx, ctx, "session.cancelled", null, { sessionId: s.id, startsAt: s.startsAt, bookings: active.length });
    return active.length;
  });
}
