/** date-fns locales and date patterns per language. Pure: usable on the server and in islands. */
import type { Locale as DateFnsLocale } from "date-fns";
import { de, enGB, es, fr, pt } from "date-fns/locale";
import type { Locale } from "./locales";

export const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = { en: enGB, de, es, fr, pt };

export interface DatePatterns {
  /** Wed 18 Nov */
  day: string;
  /** Wednesday 18 November */
  dayLong: string;
  /** 18 Nov 2026 */
  date: string;
  /** Wed 18 Nov 2026 */
  dateWithDay: string;
  /** November 2026 */
  monthYear: string;
  /** 18:30 */
  time: string;
}

export const DATE_PATTERNS: Record<Locale, DatePatterns> = {
  en: {
    day: "EEE d MMM",
    dayLong: "EEEE d MMMM",
    date: "d MMM yyyy",
    dateWithDay: "EEE d MMM yyyy",
    monthYear: "MMMM yyyy",
    time: "HH:mm",
  },
  de: {
    day: "EEE, d. MMM",
    dayLong: "EEEE, d. MMMM",
    date: "d. MMM yyyy",
    dateWithDay: "EEE, d. MMM yyyy",
    monthYear: "MMMM yyyy",
    time: "HH:mm",
  },
  es: {
    day: "EEE d MMM",
    dayLong: "EEEE, d 'de' MMMM",
    date: "d MMM yyyy",
    dateWithDay: "EEE d MMM yyyy",
    monthYear: "MMMM 'de' yyyy",
    time: "HH:mm",
  },
  fr: {
    day: "EEE d MMM",
    dayLong: "EEEE d MMMM",
    date: "d MMM yyyy",
    dateWithDay: "EEE d MMM yyyy",
    monthYear: "MMMM yyyy",
    time: "HH:mm",
  },
  pt: {
    day: "EEE, d MMM",
    dayLong: "EEEE, d 'de' MMMM",
    date: "d MMM yyyy",
    dateWithDay: "EEE, d MMM yyyy",
    monthYear: "MMMM 'de' yyyy",
    time: "HH:mm",
  },
};

/** Spanish, French and Portuguese write weekdays and months in lower case; headings start upper case. */
export function capitalizeFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}
