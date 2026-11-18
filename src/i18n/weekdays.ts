import { format } from "date-fns";
import { getLocale } from ".";
import { DATE_FNS_LOCALES, capitalizeFirst } from "./dates";

/** Weekday names Monday…Sunday in the request's language. */
export function weekdayNames(style: "long" | "short" = "long"): string[] {
  const locale = DATE_FNS_LOCALES[getLocale()];
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => capitalizeFirst(format(new Date(2024, 0, 1 + i), style === "long" ? "EEEE" : "EEE", { locale })));
}
