import { localDateOf, localTimeOf, type LocalDate } from "../domain/dates";

const LOCALE = "en-GB";

function asUtcDate(date: LocalDate): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** "Tue 18 Nov" */
export function formatDay(date: LocalDate): string {
  return asUtcDate(date).toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Tuesday 18 November" */
export function formatDayLong(date: LocalDate): string {
  return asUtcDate(date).toLocaleDateString(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "18 Nov 2026" */
export function formatDate(date: LocalDate): string {
  return asUtcDate(date).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(instant: Date, tz: string): string {
  return localTimeOf(instant, tz);
}

export function formatTimeRange(start: Date, end: Date, tz: string): string {
  return `${localTimeOf(start, tz)}–${localTimeOf(end, tz)}`;
}

/** "18 Nov 2026, 14:05" in the studio's timezone. */
export function formatInstant(instant: Date, tz: string): string {
  return `${formatDate(localDateOf(instant, tz))}, ${localTimeOf(instant, tz)}`;
}

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "currency", currency }).format(cents / 100);
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
