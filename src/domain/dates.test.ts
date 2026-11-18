import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  daysBetween,
  isLocalDate,
  localDateOf,
  localTimeOf,
  startOfWeek,
  weekday,
  zonedToUtc,
} from "./dates";

describe("local dates", () => {
  it("validates dates", () => {
    expect(isLocalDate("2026-02-28")).toBe(true);
    expect(isLocalDate("2026-02-29")).toBe(false);
    expect(isLocalDate("2028-02-29")).toBe(true);
    expect(isLocalDate("2026-1-01")).toBe(false);
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("adds months clamping to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-18", 3)).toBe("2027-02-18");
    expect(addMonths("2027-11-30", 3)).toBe("2028-02-29");
  });

  it("counts days and weekdays", () => {
    expect(daysBetween("2026-11-18", "2026-12-01")).toBe(13);
    expect(weekday("2026-11-16")).toBe(1); // Monday
    expect(weekday("2026-11-22")).toBe(7); // Sunday
    expect(startOfWeek("2026-11-22")).toBe("2026-11-16");
  });
});

describe("timezones", () => {
  it("finds the local date of an instant", () => {
    const instant = new Date("2026-11-18T23:30:00Z");
    expect(localDateOf(instant, "UTC")).toBe("2026-11-18");
    expect(localDateOf(instant, "Asia/Tokyo")).toBe("2026-11-19");
    expect(localDateOf(instant, "America/New_York")).toBe("2026-11-18");
  });

  it("converts studio wall-clock time to UTC", () => {
    expect(zonedToUtc("2026-11-18", "18:00", "Europe/Lisbon").toISOString()).toBe("2026-11-18T18:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "18:00", "Europe/Lisbon").toISOString()).toBe("2026-07-01T17:00:00.000Z");
    expect(zonedToUtc("2026-11-18", "07:00", "America/New_York").toISOString()).toBe("2026-11-18T12:00:00.000Z");
    expect(zonedToUtc("2026-11-19", "06:00", "Asia/Tokyo").toISOString()).toBe("2026-11-18T21:00:00.000Z");
  });

  it("round-trips through DST changes", () => {
    for (const [date, time] of [
      ["2026-03-29", "09:00"],
      ["2026-10-25", "09:00"],
      ["2026-03-08", "10:00"],
    ] as const) {
      const tz = date === "2026-03-08" ? "America/New_York" : "Europe/Berlin";
      const utc = zonedToUtc(date, time, tz);
      expect(localDateOf(utc, tz)).toBe(date);
      expect(localTimeOf(utc, tz)).toBe(time);
    }
  });

  it("moves a non-existent DST-gap time forward", () => {
    // 02:30 doesn't exist in Berlin on 2026-03-29.
    expect(localTimeOf(zonedToUtc("2026-03-29", "02:30", "Europe/Berlin"), "Europe/Berlin")).toBe("03:30");
  });
});
