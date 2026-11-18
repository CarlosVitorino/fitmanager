/**
 * Every date and time shown in the app goes through these helpers, so formats stay consistent and
 * instants always show in the studio's timezone (never the server's or the browser's).
 *
 * Two kinds of value:
 *  - LocalDate "YYYY-MM-DD": a calendar day in the studio (class day, plan start/expiry, payment day).
 *    It has no timezone, so it's formatted as-is.
 *  - Date: an instant (class start, note written at). Formatted in the studio's timezone.
 */
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import type { LocalDate } from "../domain/dates";

/** Formats used across the app, in date-fns tokens. */
export const FORMATS = {
  day: "EEE d MMM", // Wed 18 Nov
  dayLong: "EEEE d MMMM", // Wednesday 18 November
  date: "d MMM yyyy", // 18 Nov 2026
  dateWithDay: "EEE d MMM yyyy", // Wed 18 Nov 2026
  monthYear: "MMMM yyyy", // November 2026
  time: "HH:mm", // 18:30
} as const;

const UTC = tz("UTC");

/** A LocalDate as a Date at noon UTC, so formatting it in UTC always gives the same day. */
export function localDateToDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function formatLocalDate(date: LocalDate, pattern: string): string {
  return format(localDateToDate(date), pattern, { in: UTC, locale: enGB });
}

function formatAt(instant: Date, timeZone: string, pattern: string): string {
  return format(instant, pattern, { in: tz(timeZone), locale: enGB });
}

/** "Wed 18 Nov" */
export const formatDay = (date: LocalDate) => formatLocalDate(date, FORMATS.day);
/** "Wednesday 18 November" */
export const formatDayLong = (date: LocalDate) => formatLocalDate(date, FORMATS.dayLong);
/** "18 Nov 2026" */
export const formatDate = (date: LocalDate) => formatLocalDate(date, FORMATS.date);
/** "Wed 18 Nov 2026" */
export const formatDateWithDay = (date: LocalDate) => formatLocalDate(date, FORMATS.dateWithDay);
/** "November 2026" */
export const formatMonthYear = (date: LocalDate) => formatLocalDate(date, FORMATS.monthYear);

/** "18:30" in the studio's timezone. */
export const formatTime = (instant: Date, timeZone: string) => formatAt(instant, timeZone, FORMATS.time);

/** "18:30–19:30" in the studio's timezone. */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`;
}

/** "18 Nov 2026, 14:05" in the studio's timezone. */
export function formatInstant(instant: Date, timeZone: string): string {
  return formatAt(instant, timeZone, `${FORMATS.date}, ${FORMATS.time}`);
}

/** "18 Nov 2026" for the studio-local day of an instant. */
export function formatInstantDate(instant: Date, timeZone: string): string {
  return formatAt(instant, timeZone, FORMATS.date);
}

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(cents / 100);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return plural(minutes / 1440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  return plural(minutes, "minute");
}

/** Initials for avatars. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
