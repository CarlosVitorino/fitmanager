/** Members, notes, payments, invite links and the schedule against Postgres. */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/domain/dates";
import { db, makeSession, makeStudio, makeUser, moveSessionTo, resetDb, schema, today, type Studio } from "./fixtures";

const members = await import("../src/server/members");
const schedule = await import("../src/server/schedule");
const { assignPlan } = await import("../src/server/packs");
const bookings = await import("../src/server/bookings");
const { settleStudio } = await import("../src/server/settlement");
const { resolveStudioContext } = await import("../src/server/studio-context");

let s: Studio;
beforeAll(resetDb);
beforeEach(async () => {
  s = await makeStudio();
});

describe("new studio defaults", () => {
  it("starts with a General class, two calendars and the three plans", async () => {
    const { listTemplates, listCalendars, listPackTypes } = await import("../src/server/catalog");
    expect((await listTemplates(s.owner)).map((t) => t.name)).toEqual(["General class"]);
    expect((await listCalendars(s.owner)).map((c) => c.name)).toEqual(["Group classes", "Private classes"]);
    expect((await listPackTypes(s.owner)).map((p) => [p.name, p.entries, p.validityAmount, p.validityUnit])).toEqual([
      ["Single class", 1, 30, "days"],
      ["Trimester pack", 10, 3, "months"],
      ["10-class pack", 10, 14, "weeks"],
    ]);
  });
});

describe("notes", () => {
  it("hides private notes from the member", async () => {
    await members.addNote(s.owner, s.memberId, { body: "Knee injury, avoid jumps", visibility: "private" });
    await members.addNote(s.owner, s.memberId, { body: "Great progress on squats!", visibility: "shared" });
    expect((await members.listNotes(s.owner, s.memberId)).map((n) => n.visibility).sort()).toEqual([
      "private",
      "shared",
    ]);
    expect((await members.listNotes(s.member, s.memberId)).map((n) => n.body)).toEqual(["Great progress on squats!"]);
  });

  it("can't be written by members or read across members", async () => {
    await expect(members.addNote(s.member, s.memberId, { body: "x", visibility: "shared" })).rejects.toThrow(
      /permission/,
    );
    const other = await makeUser("Other");
    const { auth } = await import("../src/lib/auth");
    await auth.api.addMember({ body: { organizationId: s.studioId, userId: other, role: "member" } });
    await expect(members.listNotes(s.member, other)).rejects.toThrow(/permission/);
  });
});

describe("invite link", () => {
  it("adds a new user as a member, once", async () => {
    const settings = await members.getSettings(s.owner);
    const newcomer = await makeUser("Newcomer");
    await members.joinStudio(newcomer, s.owner.slug, settings.joinCode);
    await members.joinStudio(newcomer, s.owner.slug, settings.joinCode);
    expect((await resolveStudioContext(db, s.owner.slug, newcomer))?.role).toBe("member");
  });

  it("stops working when regenerated", async () => {
    const old = (await members.getSettings(s.owner)).joinCode;
    await members.regenerateJoinCode(s.owner);
    await expect(members.joinStudio(await makeUser("Late"), s.owner.slug, old)).rejects.toThrow(/no longer valid/);
  });

  it("doesn't let an owner become a member of their own studio", async () => {
    const settings = await members.getSettings(s.owner);
    await members.joinStudio(s.owner.userId, s.owner.slug, settings.joinCode);
    expect((await resolveStudioContext(db, s.owner.slug, s.owner.userId))?.role).toBe("owner");
  });
});

describe("roles", () => {
  it("lets the owner make a member a coach, but not demote the last owner", async () => {
    await members.setRole(s.owner, s.memberId, "coach");
    expect((await resolveStudioContext(db, s.owner.slug, s.memberId))?.role).toBe("coach");
    await expect(members.setRole(s.owner, s.owner.userId, "member")).rejects.toThrow(/at least one owner/);
  });
  it("doesn't let coaches change roles", async () => {
    await members.setRole(s.owner, s.memberId, "coach");
    const coach = (await resolveStudioContext(db, s.owner.slug, s.memberId))!;
    await expect(members.setRole(coach, s.owner.userId, "member")).rejects.toThrow(/permission/);
  });
});

describe("members list and history", () => {
  it("shows credits, next expiry and last class", async () => {
    await assignPlan(s.owner, { memberId: s.memberId, packTypeId: s.tenPack.id, startsOn: today() });
    const cls = await makeSession(s, 48);
    await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, -2);
    await settleStudio(s.studioId, s.owner.timezone);
    const row = (await members.listMembers(s.owner)).find((m) => m.userId === s.memberId)!;
    expect(row).toMatchObject({ available: 9, activePacks: 1, nextExpiry: addDays(today(), 97), upcoming: 0 });
    expect(row.lastClass).toBeInstanceOf(Date);

    const history = await members.classHistory(s.member, s.memberId);
    expect(history).toMatchObject([{ status: "booked", settled: true, noShow: false, packName: "10-class pack" }]);
    expect(members.memberAchievements(s.member, history)).toMatchObject({ totalClasses: 1, currentStreakWeeks: 1 });
  });

  it("doesn't count no-shows as attended", async () => {
    await assignPlan(s.owner, { memberId: s.memberId, packTypeId: s.tenPack.id, startsOn: today() });
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    await moveSessionTo(s, cls.id, -2);
    await bookings.setNoShow(s.owner, booking.id, true);
    await settleStudio(s.studioId, s.owner.timezone);
    const history = await members.classHistory(s.owner, s.memberId);
    expect(members.memberAchievements(s.owner, history).totalClasses).toBe(0);
  });

  it("keeps members out of the members list", async () => {
    await expect(members.listMembers(s.member)).rejects.toThrow(/permission/);
  });
});

describe("payments", () => {
  it("records and lists payments, newest first", async () => {
    await members.recordPayment(s.owner, s.memberId, { amountCents: 1500, method: "card", paidOn: "2026-11-01" });
    await members.recordPayment(s.owner, s.memberId, { amountCents: 9000, method: "cash", paidOn: "2026-11-10" });
    expect((await members.listPayments(s.member, { memberId: s.memberId })).map((p) => p.amountCents)).toEqual([
      9000, 1500,
    ]);
    expect(await members.listPayments(s.owner, { from: "2026-11-05", to: "2026-11-30" })).toHaveLength(1);
  });
});

describe("schedule", () => {
  it("turns a weekly slot into classes, idempotently", async () => {
    await schedule.saveSlot(s.owner, {
      calendarId: s.calendarId,
      templateId: s.templateId,
      weekday: 2,
      startTime: "18:00",
      durationMinutes: 60,
      capacity: 12,
      coachId: s.owner.userId,
      startsOn: today(),
      endsOn: null,
    });
    await schedule.ensureSessions(s.owner);
    const list = await schedule.listSessions(s.owner, today(), addDays(today(), 27));
    expect(list.length).toBe(4);
    expect(list.every((x) => x.capacity === 12 && x.booked === 0)).toBe(true);
  });

  it("keeps booked classes when the slot changes, and regenerates the rest", async () => {
    const created = await schedule.saveSlot(s.owner, {
      calendarId: s.calendarId,
      templateId: s.templateId,
      weekday: 3,
      startTime: "07:00",
      durationMinutes: 45,
      capacity: 8,
      coachId: null,
      startsOn: addDays(today(), 1),
      endsOn: null,
    });
    const [first] = await schedule.listSessions(s.owner, today(), addDays(today(), 8));
    await assignPlan(s.owner, { memberId: s.memberId, packTypeId: s.tenPack.id, startsOn: today() });
    await bookings.bookSelf(s.member, first!.id);
    await schedule.saveSlot(s.owner, { ...created, capacity: 20, coachId: null, endsOn: null }, created.id);
    const after = await schedule.listSessions(s.owner, today(), addDays(today(), 27));
    expect(after.find((x) => x.id === first!.id)?.capacity).toBe(8);
    expect(after.filter((x) => x.id !== first!.id).every((x) => x.capacity === 20)).toBe(true);
  });

  it("shows the member their own booking only", async () => {
    await assignPlan(s.owner, { memberId: s.memberId, packTypeId: s.tenPack.id, startsOn: today() });
    const cls = await makeSession(s, 48);
    const { booking } = await bookings.bookSelf(s.member, cls.id);
    const d = (await db.select().from(schema.classSession).where(eq(schema.classSession.id, cls.id)))[0]!.localDate;
    const [mine] = await schedule.listSessions(s.member, d, d, { forMemberId: s.memberId });
    expect(mine).toMatchObject({ myBookingId: booking.id, booked: 1 });
    const [theirs] = await schedule.listSessions(s.owner, d, d, { forMemberId: s.owner.userId });
    expect(theirs?.myBookingId).toBeNull();
  });

  it("can't see another studio's classes", async () => {
    await makeSession(s, 48);
    const other = await makeStudio();
    expect(await schedule.listSessions(other.owner, today(), addDays(today(), 7))).toEqual([]);
  });
});
