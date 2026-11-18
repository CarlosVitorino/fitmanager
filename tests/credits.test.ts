/** The credit lifecycle end to end against Postgres: assign, book, cancel, settle, expire, override. */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/domain/dates";
import { db, makeSession, makeStudio, makeUser, moveSessionTo, resetDb, schema, today, type Studio } from "./fixtures";

const { assignPlan, adjustCredits, memberPacks } = await import("../src/server/packs");
const bookings = await import("../src/server/bookings");
const { settleStudio } = await import("../src/server/settlement");
const { auth } = await import("../src/lib/auth");

let s: Studio;

beforeAll(resetDb);
beforeEach(async () => {
  s = await makeStudio();
});

const packsOf = async (studio = s) => {
  await settleStudio(studio.studioId, studio.owner.timezone);
  return memberPacks(studio.owner, studio.memberId);
};
const assign = (type: { id: string }, startsOn = today(), studio = s) =>
  assignPlan(studio.owner, { memberId: studio.memberId, packTypeId: type.id, startsOn });

describe("assigning plans", () => {
  it("gives the member the plan's credits and expiry", async () => {
    await assign(s.tenPack, "2026-01-05");
    const [p] = await memberPacks(s.owner, s.memberId);
    expect(p).toMatchObject({ name: "10-class pack", available: 10, total: 10, expiresOn: "2026-04-12" });
  });

  it("records the payment when given", async () => {
    const created = await assignPlan(s.owner, {
      memberId: s.memberId,
      packTypeId: s.trimester.id,
      startsOn: today(),
      payment: { amountCents: 9000, method: "cash", paidOn: today() },
    });
    const pays = await db.select().from(schema.payment).where(eq(schema.payment.packId, created.id));
    expect(pays).toMatchObject([{ amountCents: 9000, method: "cash", currency: "EUR" }]);
  });

  it("can't be done by a member, or for someone outside the studio", async () => {
    await expect(assign(s.tenPack, today(), { ...s, owner: s.member })).rejects.toThrow(/permission/);
    const stranger = await makeUser("Stranger");
    await expect(
      assignPlan(s.owner, { memberId: stranger, packTypeId: s.tenPack.id, startsOn: today() }),
    ).rejects.toThrow(/not found/i);
  });

  it("can't use another studio's plan", async () => {
    const other = await makeStudio();
    await expect(assign(other.tenPack)).rejects.toThrow(/not found/i);
  });

  it("writes an audit entry", async () => {
    await assign(s.single);
    const log = await db.select().from(schema.auditLog).where(eq(schema.auditLog.studioId, s.studioId));
    expect(log).toMatchObject([{ action: "plan.assigned", memberId: s.memberId, actorId: s.owner.userId }]);
  });
});

describe("booking", () => {
  it("reserves a credit from the pack closest to expiry", async () => {
    await assign(s.trimester); // expires in 3 months
    await assign(s.single); // expires in 30 days
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    const packs = await packsOf();
    const single = packs.find((p) => p.name === "Single class")!;
    expect(booking.packId).toBe(single.id);
    expect(single).toMatchObject({ available: 0, reserved: 1, used: 0 });
  });

  it("refuses without credits, when full, when closed, and twice", async () => {
    const cls = await makeSession(s, 48, 1);
    await expect(bookings.bookSelf(s.member, cls.id)).rejects.toThrow(/credits/);
    await assign(s.tenPack);
    await bookings.bookSelf(s.member, cls.id);
    await expect(bookings.bookSelf(s.member, cls.id)).rejects.toThrow(/already booked/);

    const other = await makeUser("Other");
    await auth.api.addMember({ body: { organizationId: s.studioId, userId: other, role: "member" } });
    await assignPlan(s.owner, { memberId: other, packTypeId: s.tenPack.id, startsOn: today() });
    const { resolveStudioContext } = await import("../src/server/studio-context");
    const otherCtx = (await resolveStudioContext(db, s.owner.slug, other))!;
    await expect(bookings.bookSelf(otherCtx, cls.id)).rejects.toThrow(/full/);

    const soon = await makeSession(s, 1); // inside the 2h cutoff
    await expect(bookings.bookSelf(s.member, soon.id)).rejects.toThrow(/closed/);
  });

  it("gives the last spot to exactly one of two members booking at once", async () => {
    const cls = await makeSession(s, 48, 1);
    const ids = [s.memberId, await makeUser("Second")];
    await auth.api.addMember({ body: { organizationId: s.studioId, userId: ids[1]!, role: "member" } });
    const { resolveStudioContext } = await import("../src/server/studio-context");
    const ctxs = await Promise.all(ids.map((id) => resolveStudioContext(db, s.owner.slug, id)));
    for (const id of ids) await assignPlan(s.owner, { memberId: id, packTypeId: s.tenPack.id, startsOn: today() });
    const results = await Promise.allSettled(ctxs.map((c) => bookings.bookSelf(c!, cls.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("doesn't let one credit pay for two classes booked at once", async () => {
    await assign(s.single);
    const [a, b] = [await makeSession(s, 48), await makeSession(s, 72)];
    const results = await Promise.allSettled([bookings.bookSelf(s.member, a.id), bookings.bookSelf(s.member, b.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await packsOf())[0]).toMatchObject({ available: 0, reserved: 1 });
  });

  it("won't spend a pack that expires before the class", async () => {
    await assign(s.single, addDays(today(), -29)); // last valid day is today
    const cls = await makeSession(s, 48);
    await expect(bookings.bookSelf(s.member, cls.id)).rejects.toThrow(/credits/);
  });

  it("lets staff add a member to a full class", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 1, 1);
    const filler = await makeUser("Filler");
    await auth.api.addMember({ body: { organizationId: s.studioId, userId: filler, role: "member" } });
    await assignPlan(s.owner, { memberId: filler, packTypeId: s.tenPack.id, startsOn: today() });
    await bookings.addMemberToSession(s.owner, cls.id, filler);
    await expect(bookings.addMemberToSession(s.owner, cls.id, s.memberId)).resolves.toBeTruthy();
  });
});

describe("cancelling", () => {
  it("returns the credit when cancelled in time", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    expect(await bookings.cancelOwnBooking(s.member, booking.id)).toBe("released");
    expect((await packsOf())[0]).toMatchObject({ available: 10, reserved: 0, used: 0 });
  });

  it("keeps the credit spent inside the window, and frees the spot", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, 5); // now 5h away: inside 24h
    expect(await bookings.cancelOwnBooking(s.member, booking.id)).toBe("late");
    let [p] = await packsOf();
    expect(p).toMatchObject({ available: 9, used: 1, reserved: 0 });
    await moveSessionTo(s, cls.id, -1); // class happens
    [p] = await packsOf();
    expect(p).toMatchObject({ available: 9, used: 1 });
  });

  it("can't cancel someone else's booking", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    const other = await makeStudio();
    await expect(bookings.cancelOwnBooking(other.member, booking.id)).rejects.toThrow(/not found/i);
  });

  it("returns every credit when staff cancel the class", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    await bookings.bookSelf(s.member, cls.id);
    expect(await bookings.cancelSession(s.owner, cls.id)).toBe(1);
    expect((await packsOf())[0]).toMatchObject({ available: 10, reserved: 0 });
  });
});

describe("settlement", () => {
  it("uses the credit when the class happens, booked or no-show, once", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, -1);
    await bookings.setNoShow(s.owner, booking.id, true);
    await settleStudio(s.studioId, s.owner.timezone);
    await settleStudio(s.studioId, s.owner.timezone);
    expect((await packsOf())[0]).toMatchObject({ available: 9, reserved: 0, used: 1 });
    const consumes = await db.select().from(schema.creditEntry).where(eq(schema.creditEntry.kind, "consume"));
    expect(consumes.filter((c) => c.bookingId === booking.id)).toHaveLength(1);
  });

  it("is safe when two settlements run at once", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, -1);
    await Promise.all([1, 2, 3].map(() => settleStudio(s.studioId, s.owner.timezone)));
    const consumes = await db.select().from(schema.creditEntry).where(eq(schema.creditEntry.bookingId, booking.id));
    expect(consumes.filter((c) => c.kind === "consume")).toHaveLength(1);
  });

  it("expires unused credits with a visible entry, and leaves used ones alone", async () => {
    await assign(s.single, addDays(today(), -40));
    await assign(s.tenPack, addDays(today(), -100)); // 14 weeks = 98 days: expired
    const packs = await packsOf();
    expect(packs.map((p) => [p.name, p.status, p.available, p.expired])).toEqual([
      ["Single class", "expired", 0, 1],
      ["10-class pack", "expired", 0, 10],
    ]);
    const expires = await db.select().from(schema.creditEntry).where(eq(schema.creditEntry.kind, "expire"));
    expect(expires.map((e) => e.delta).sort()).toEqual([-1, -10]);
  });
});

describe("coach overrides", () => {
  it("can waive a no-show's credit and charge it again", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, -1);
    await settleStudio(s.studioId, s.owner.timezone);
    await bookings.setBookingCharged(s.owner, booking.id, false);
    expect((await packsOf())[0]).toMatchObject({ available: 10, used: 0 });
    await bookings.setBookingCharged(s.owner, booking.id, false); // no-op
    await bookings.setBookingCharged(s.owner, booking.id, true);
    expect((await packsOf())[0]).toMatchObject({ available: 9, used: 1 });
  });

  it("can waive a late cancellation", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 5);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await bookings.cancelOwnBooking(s.member, booking.id);
    await bookings.setBookingCharged(s.owner, booking.id, false);
    expect((await packsOf())[0]).toMatchObject({ available: 10, used: 0 });
  });

  it("doesn't refund twice when a waived booking is then removed", async () => {
    await assign(s.tenPack);
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await bookings.setBookingCharged(s.owner, booking.id, false);
    await bookings.removeBooking(s.owner, booking.id);
    expect((await packsOf())[0]).toMatchObject({ available: 10, total: 10 });
  });

  it("moves a booking and its credit to another class", async () => {
    await assign(s.tenPack);
    const [a, b] = [await makeSession(s, 48), await makeSession(s, 72)];
    const { booking } = await bookings.bookSelf(s.member, a.id);
    const moved = await bookings.moveBooking(s.owner, booking.id, b.id);
    expect(moved.session.id).toBe(b.id);
    expect((await packsOf())[0]).toMatchObject({ available: 9, reserved: 1 });
  });

  it("adjusts credits with a reason, never below zero", async () => {
    const p = await assign(s.tenPack);
    await adjustCredits(s.owner, { packId: p.id, delta: 2, reason: "Migrated from spreadsheet" });
    expect((await packsOf())[0]).toMatchObject({ available: 12, total: 12 });
    await expect(adjustCredits(s.owner, { packId: p.id, delta: -13, reason: "Too many" })).rejects.toThrow(/Only 12/);
    await expect(adjustCredits(s.member, { packId: p.id, delta: 1, reason: "Myself" })).rejects.toThrow(/permission/);
  });
});
