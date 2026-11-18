import { describe, expect, it } from "vitest";
import { chargeChange, decideBooking, decideCancellation, isDueForSettlement, type BookingRequest } from "./booking";
import type { PackForAllocation } from "./packs";

const startsAt = new Date("2026-12-01T18:00:00Z");
const at = (iso: string) => new Date(iso);
const pack: PackForAllocation = {
  id: "p1",
  startsOn: "2026-11-01",
  expiresOn: "2026-12-31",
  available: 3,
  createdAt: new Date(0),
};

const base: BookingRequest<PackForAllocation> = {
  now: at("2026-11-30T10:00:00Z"),
  startsAt,
  classDate: "2026-12-01",
  cancelled: false,
  capacity: 10,
  bookedCount: 4,
  alreadyBooked: false,
  bookingCutoffMinutes: 120,
  packs: [pack],
};

describe("decideBooking", () => {
  it("books and picks the pack", () => {
    expect(decideBooking(base)).toEqual({ ok: true, pack });
  });

  it("is open exactly at the cutoff and closed a minute later", () => {
    expect(decideBooking({ ...base, now: at("2026-12-01T16:00:00Z") }).ok).toBe(true);
    expect(decideBooking({ ...base, now: at("2026-12-01T16:01:00Z") })).toEqual({
      ok: false,
      reason: "booking_closed",
    });
  });

  it.each([
    [{ cancelled: true }, "session_cancelled"],
    [{ now: at("2026-12-01T18:00:00Z") }, "class_started"],
    [{ bookedCount: 10 }, "class_full"],
    [{ alreadyBooked: true }, "already_booked"],
    [{ packs: [] }, "no_credits"],
    [{ packs: [{ ...pack, expiresOn: "2026-11-30" }] }, "no_credits"],
  ] as const)("refuses %o with %s", (change, reason) => {
    expect(decideBooking({ ...base, ...change })).toEqual({ ok: false, reason });
  });

  it("lets staff book past the cutoff and into a full class, but still needs a credit", () => {
    expect(decideBooking({ ...base, byStaff: true, bookedCount: 10, now: at("2026-12-01T17:59:00Z") }).ok).toBe(true);
    expect(decideBooking({ ...base, byStaff: true, packs: [] })).toEqual({ ok: false, reason: "no_credits" });
    expect(decideBooking({ ...base, byStaff: true, alreadyBooked: true })).toEqual({
      ok: false,
      reason: "already_booked",
    });
  });

  it("lets staff add someone to a class that already happened (fixing the record)", () => {
    expect(decideBooking({ ...base, byStaff: true, now: at("2026-12-02T10:00:00Z") }).ok).toBe(true);
  });
});

describe("decideCancellation", () => {
  it("returns the credit up to 24h before", () => {
    expect(decideCancellation(startsAt, at("2026-11-30T18:00:00Z"), 1440)).toBe("release");
  });
  it("keeps the credit spent inside 24h", () => {
    expect(decideCancellation(startsAt, at("2026-11-30T18:00:30Z"), 1440)).toBe("late");
    expect(decideCancellation(startsAt, at("2026-12-01T17:59:00Z"), 1440)).toBe("late");
  });
  it("can't cancel once the class started", () => {
    expect(decideCancellation(startsAt, startsAt, 1440)).toBe("too_late");
  });
  it("respects a custom window", () => {
    expect(decideCancellation(startsAt, at("2026-12-01T12:00:00Z"), 360)).toBe("release");
  });
});

describe("settlement and charge override", () => {
  it("settles once the class starts", () => {
    expect(isDueForSettlement(startsAt, at("2026-12-01T17:59:59Z"))).toBe(false);
    expect(isDueForSettlement(startsAt, startsAt)).toBe(true);
  });
  it("maps the coach's choice to a ledger entry", () => {
    expect(chargeChange(true, false)).toBe("refund");
    expect(chargeChange(false, true)).toBe("charge");
    expect(chargeChange(true, true)).toBeNull();
  });
});
