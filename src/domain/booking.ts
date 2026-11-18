import type { LocalDate } from "./dates";
import { choosePack, type PackForAllocation } from "./packs";

export function minutesUntil(start: Date, now: Date): number {
  return Math.floor((start.getTime() - now.getTime()) / 60_000);
}

export type BookingRefusal =
  "session_cancelled" | "class_started" | "booking_closed" | "class_full" | "already_booked" | "no_credits";

export interface BookingRequest<P extends PackForAllocation> {
  now: Date;
  startsAt: Date;
  classDate: LocalDate;
  cancelled: boolean;
  capacity: number;
  bookedCount: number;
  alreadyBooked: boolean;
  bookingCutoffMinutes: number;
  packs: readonly P[];
  /** Staff booking on a member's behalf: ignores the booking cutoff and capacity. */
  byStaff?: boolean;
}

export type BookingDecision<P> = { ok: true; pack: P } | { ok: false; reason: BookingRefusal };

/** Whether a member can be booked into a class, and which pack pays for it. */
export function decideBooking<P extends PackForAllocation>(req: BookingRequest<P>): BookingDecision<P> {
  if (req.cancelled) return { ok: false, reason: "session_cancelled" };
  if (req.startsAt <= req.now && !req.byStaff) return { ok: false, reason: "class_started" };
  if (req.alreadyBooked) return { ok: false, reason: "already_booked" };
  if (!req.byStaff) {
    if (minutesUntil(req.startsAt, req.now) < req.bookingCutoffMinutes) return { ok: false, reason: "booking_closed" };
    if (req.bookedCount >= req.capacity) return { ok: false, reason: "class_full" };
  }
  const pack = choosePack(req.packs, req.classDate);
  if (!pack) return { ok: false, reason: "no_credits" };
  return { ok: true, pack };
}

export type CancellationOutcome = "release" | "late" | "too_late";

/**
 * Member cancelling: in time returns the credit; inside the cutoff the booking is cancelled but the
 * credit stays spent; once the class has started it can't be cancelled.
 */
export function decideCancellation(startsAt: Date, now: Date, cancellationCutoffMinutes: number): CancellationOutcome {
  if (startsAt <= now) return "too_late";
  return minutesUntil(startsAt, now) >= cancellationCutoffMinutes ? "release" : "late";
}

/** A class settles (its reserved credits become used) once it has started. */
export function isDueForSettlement(startsAt: Date, now: Date): boolean {
  return startsAt <= now;
}

/**
 * Coach override on whether a booking's credit is spent. Returns the ledger entry kind that moves the
 * booking from its current state to the wanted one, or null when nothing changes.
 */
export function chargeChange(currentlyCharged: boolean, wantCharged: boolean): "refund" | "charge" | null {
  if (currentlyCharged === wantCharged) return null;
  return wantCharged ? "charge" : "refund";
}
