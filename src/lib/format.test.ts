import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateWithDay,
  formatDay,
  formatDayLong,
  formatInstant,
  formatMonthYear,
  formatTime,
  formatTimeRange,
} from "./format";

describe("calendar days", () => {
  it("formats the same day whatever the server's timezone", () => {
    expect(formatDay("2026-11-18")).toBe("Wed 18 Nov");
    expect(formatDayLong("2026-11-18")).toBe("Wednesday 18 November");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
    expect(formatDateWithDay("2026-11-18")).toBe("Wed 18 Nov 2026");
    expect(formatMonthYear("2026-11-01")).toBe("November 2026");
  });
});

describe("instants in the studio's timezone", () => {
  const instant = new Date("2026-11-18T23:30:00Z");
  it("shows the studio's wall clock", () => {
    expect(formatTime(instant, "Europe/Lisbon")).toBe("23:30");
    expect(formatTime(instant, "Asia/Tokyo")).toBe("08:30");
    expect(formatTime(instant, "America/New_York")).toBe("18:30");
  });
  it("uses the studio's day, which can differ from UTC", () => {
    expect(formatInstant(instant, "Asia/Tokyo")).toBe("19 Nov 2026, 08:30");
    expect(formatInstant(instant, "America/New_York")).toBe("18 Nov 2026, 18:30");
  });
  it("formats ranges across DST", () => {
    const start = new Date("2026-03-29T08:00:00Z");
    expect(formatTimeRange(start, new Date(start.getTime() + 3_600_000), "Europe/Berlin")).toBe("10:00–11:00");
  });
});
