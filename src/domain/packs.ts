import { addDays, addMonths, type LocalDate } from "./dates";

export type ValidityUnit = "days" | "weeks" | "months";
/** How long a pack is valid. `null` means it never expires. */
export type Validity = { unit: ValidityUnit; amount: number } | null;

/**
 * Last day a pack can be used (inclusive), counted from its start day.
 * 14 weeks from Mon 2026-01-05 → Sun 2026-04-12. 3 months from 2026-01-15 → 2026-04-14.
 */
export function computeExpiry(startsOn: LocalDate, validity: Validity): LocalDate | null {
  if (!validity) return null;
  if (!Number.isInteger(validity.amount) || validity.amount < 1) throw new RangeError("Validity must be at least 1");
  switch (validity.unit) {
    case "days":
      return addDays(startsOn, validity.amount - 1);
    case "weeks":
      return addDays(startsOn, validity.amount * 7 - 1);
    case "months":
      return addDays(addMonths(startsOn, validity.amount), -1);
  }
}

/** What allocation needs to know about a pack the member holds. */
export interface PackForAllocation {
  id: string;
  startsOn: LocalDate;
  expiresOn: LocalDate | null;
  /** Credits not yet reserved, used or expired. */
  available: number;
  createdAt: Date;
}

export function isPackValidOn(pack: Pick<PackForAllocation, "startsOn" | "expiresOn">, date: LocalDate): boolean {
  return pack.startsOn <= date && (pack.expiresOn === null || date <= pack.expiresOn);
}

export function isPackExpired(pack: Pick<PackForAllocation, "expiresOn">, today: LocalDate): boolean {
  return pack.expiresOn !== null && pack.expiresOn < today;
}

/**
 * The pack a booking for `classDate` spends from: among packs with credits that are valid on the
 * class date, the one closest to expiry. Packs that never expire come last; ties go to the older pack.
 */
export function choosePack<P extends PackForAllocation>(packs: readonly P[], classDate: LocalDate): P | null {
  const usable = packs.filter((p) => p.available > 0 && isPackValidOn(p, classDate));
  usable.sort((a, b) => {
    if (a.expiresOn !== b.expiresOn) {
      if (a.expiresOn === null) return 1;
      if (b.expiresOn === null) return -1;
      return a.expiresOn < b.expiresOn ? -1 : 1;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return usable[0] ?? null;
}
