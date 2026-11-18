import { describe, expect, it } from "vitest";
import { localTimeOf } from "./dates";
import { occurrences, type RecurringSlot } from "./schedule";

const tuesday6pm: RecurringSlot = {
  weekday: 2,
  startTime: "18:00",
  durationMinutes: 60,
  startsOn: "2026-11-01",
  endsOn: null,
};

describe("occurrences", () => {
  it("lists every matching weekday in range", () => {
    const list = occurrences(tuesday6pm, "2026-11-16", "2026-12-06", "Europe/Lisbon");
    expect(list.map((o) => o.localDate)).toEqual(["2026-11-17", "2026-11-24", "2026-12-01"]);
    expect(list[0]!.startsAt.toISOString()).toBe("2026-11-17T18:00:00.000Z");
    expect(list[0]!.endsAt.toISOString()).toBe("2026-11-17T19:00:00.000Z");
  });

  it("respects the slot's own start and end dates", () => {
    const slot = { ...tuesday6pm, startsOn: "2026-11-20", endsOn: "2026-12-01" };
    expect(occurrences(slot, "2026-11-01", "2026-12-31", "UTC").map((o) => o.localDate)).toEqual([
      "2026-11-24",
      "2026-12-01",
    ]);
  });

  it("returns nothing for an empty range", () => {
    expect(occurrences({ ...tuesday6pm, endsOn: "2026-10-01" }, "2026-11-01", "2026-11-30", "UTC")).toEqual([]);
  });

  it("keeps the wall-clock time across a DST change", () => {
    const sunday = { ...tuesday6pm, weekday: 7, startTime: "09:00", startsOn: "2026-03-01" };
    const list = occurrences(sunday, "2026-03-22", "2026-04-05", "Europe/Berlin");
    expect(list.map((o) => localTimeOf(o.startsAt, "Europe/Berlin"))).toEqual(["09:00", "09:00", "09:00"]);
    expect(list[0]!.startsAt.getUTCHours()).toBe(8);
    expect(list[1]!.startsAt.getUTCHours()).toBe(7);
  });
});
