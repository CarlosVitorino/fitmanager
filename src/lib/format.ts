/**
 * Every date, time and amount shown in the app goes through these helpers, so formats stay consistent,
 * follow the request's language, and instants always show in the studio's timezone.
 *
 * Two kinds of value:
 *  - LocalDate "YYYY-MM-DD": a calendar day in the studio (class day, plan start/expiry, payment day).
 *    It has no timezone, so it's formatted as-is.
 *  - Date: an instant (class start, note written at). Formatted in the studio's timezone.
 */
import { tz } from "@date-fns/tz";
import { format } from "date-fns";
import type { LocalDate } from "../domain/dates";
import { getLocale, t } from "../i18n";
import { capitalizeFirst, DATE_FNS_LOCALES, DATE_PATTERNS, type DatePatterns } from "../i18n/dates";
import { LOCALE_TAGS } from "../i18n/locales";

const UTC = tz("UTC");

/** A LocalDate as a Date at noon UTC, so formatting it in UTC always gives the same day. */
export function localDateToDate(date: LocalDate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function pattern(key: keyof DatePatterns) {
  return DATE_PATTERNS[getLocale()][key];
}

function formatLocalDate(date: LocalDate, key: keyof DatePatterns): string {
  return format(localDateToDate(date), pattern(key), { in: UTC, locale: DATE_FNS_LOCALES[getLocale()] });
}

function formatAt(instant: Date, timeZone: string, key: keyof DatePatterns): string {
  return format(instant, pattern(key), { in: tz(timeZone), locale: DATE_FNS_LOCALES[getLocale()] });
}

/** "Wed 18 Nov" */
export const formatDay = (date: LocalDate) => capitalizeFirst(formatLocalDate(date, "day"));
/** "Wednesday 18 November" */
export const formatDayLong = (date: LocalDate) => capitalizeFirst(formatLocalDate(date, "dayLong"));
/** "18 Nov 2026" */
export const formatDate = (date: LocalDate) => formatLocalDate(date, "date");
/** "Wed 18 Nov 2026" */
export const formatDateWithDay = (date: LocalDate) => capitalizeFirst(formatLocalDate(date, "dateWithDay"));
/** "November 2026" */
export const formatMonthYear = (date: LocalDate) => capitalizeFirst(formatLocalDate(date, "monthYear"));

/** "18:30" in the studio's timezone. */
export const formatTime = (instant: Date, timeZone: string) => formatAt(instant, timeZone, "time");

/** "18:30–19:30" in the studio's timezone. */
export function formatTimeRange(start: Date, end: Date, timeZone: string): string {
  return `${formatTime(start, timeZone)}–${formatTime(end, timeZone)}`;
}

/** "18 Nov 2026, 14:05" in the studio's timezone. */
export function formatInstant(instant: Date, timeZone: string): string {
  return `${formatAt(instant, timeZone, "date")}, ${formatAt(instant, timeZone, "time")}`;
}

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat(LOCALE_TAGS[getLocale()], { style: "currency", currency }).format(cents / 100);
}

export function formatNumber(n: number, maxDecimals = 1): string {
  return new Intl.NumberFormat(LOCALE_TAGS[getLocale()], { maximumFractionDigits: maxDecimals }).format(n);
}

type Unit = "classes" | "credits" | "days" | "hours" | "minutes" | "weeks" | "months" | "members" | "spots" | "years";
/** "3 classes", "1 Kurs"… */
export function plural(n: number, unit: Unit): string {
  return t(`common.${unit}`, { count: n });
}

/** "2 hours", "1 day" for cutoff windows. */
export function formatMinutes(minutes: number): string {
  if (minutes % 1440 === 0 && minutes >= 1440) return plural(minutes / 1440, "days");
  if (minutes % 60 === 0) return plural(minutes / 60, "hours");
  return plural(minutes, "minutes");
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
