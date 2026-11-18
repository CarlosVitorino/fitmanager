/**
 * The credit ledger. A pack's available credits are the sum of its entries' deltas; nothing ever
 * edits a balance directly. Each kind has a fixed sign so a bad caller can't, say, grant -3.
 *
 *   grant    +N  pack assigned
 *   adjust   ±N  coach correction, with a reason
 *   reserve  -1  member booked a class
 *   release  +1  booking cancelled in time, removed by a coach, or class cancelled
 *   consume   0  class took place; the reserved credit is now used (history only)
 *   refund   +1  coach chose not to charge a booking that was charged
 *   charge   -1  coach chose to charge a booking again after a refund
 *   expire   -N  pack expired with N credits unused
 */
export const CREDIT_KINDS = ["grant", "adjust", "reserve", "release", "consume", "refund", "charge", "expire"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export interface CreditEntry {
  kind: CreditKind;
  delta: number;
}

export function makeEntry(kind: CreditKind, amount = 1): CreditEntry {
  if (!Number.isInteger(amount)) throw new RangeError("Credit amounts are whole numbers");
  switch (kind) {
    case "grant":
      if (amount < 1) throw new RangeError("A grant adds at least one credit");
      return { kind, delta: amount };
    case "adjust":
      if (amount === 0) throw new RangeError("An adjustment can't be zero");
      return { kind, delta: amount };
    case "reserve":
    case "charge":
      return { kind, delta: -1 };
    case "release":
    case "refund":
      return { kind, delta: 1 };
    case "consume":
      return { kind, delta: 0 };
    case "expire":
      if (amount < 1) throw new RangeError("Expire only unused credits");
      return { kind, delta: -amount };
  }
}

export function available(entries: readonly Pick<CreditEntry, "delta">[]): number {
  return entries.reduce((sum, e) => sum + e.delta, 0);
}

/** A coach adjustment may not take a pack below zero available credits. */
export function checkAdjustment(currentAvailable: number, delta: number): { ok: true } | { ok: false; reason: string } {
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, reason: "Enter a whole number other than zero" };
  if (currentAvailable + delta < 0)
    return { ok: false, reason: `Only ${currentAvailable} credits are free to remove; the rest are booked or used` };
  return { ok: true };
}
