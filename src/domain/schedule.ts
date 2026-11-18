import { addDays, daysBetween, weekday, zonedToUtc, type LocalDate } from "./dates";

/** A weekly recurring class slot, e.g. "Tuesdays 18:00, 60 min, 12 spots". */
export interface RecurringSlot {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Studio-local "HH:MM". */
  startTime: string;
  durationMinutes: number;
  startsOn: LocalDate;
  endsOn: LocalDate | null;
}

export interface Occurrence {
  localDate: LocalDate;
  startsAt: Date;
  endsAt: Date;
}

/** Every class a slot produces between `from` and `to` (inclusive), in the studio's timezone. */
export function occurrences(slot: RecurringSlot, from: LocalDate, to: LocalDate, timeZone: string): Occurrence[] {
  const first = from > slot.startsOn ? from : slot.startsOn;
  const last = slot.endsOn && slot.endsOn < to ? slot.endsOn : to;
  if (daysBetween(first, last) < 0) return [];

  const result: Occurrence[] = [];
  let day = addDays(first, (slot.weekday - weekday(first) + 7) % 7);
  while (day <= last) {
    const startsAt = zonedToUtc(day, slot.startTime, timeZone);
    result.push({ localDate: day, startsAt, endsAt: new Date(startsAt.getTime() + slot.durationMinutes * 60_000) });
    day = addDays(day, 7);
  }
  return result;
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
