import { describe, expect, it } from "vitest";
import { choosePack, computeExpiry, isPackExpired, isPackValidOn, type PackForAllocation } from "./packs";

describe("computeExpiry", () => {
  it("counts the start day as day one", () => {
    expect(computeExpiry("2026-01-05", { unit: "days", amount: 30 })).toBe("2026-02-03");
    expect(computeExpiry("2026-01-05", { unit: "weeks", amount: 14 })).toBe("2026-04-12");
    expect(computeExpiry("2026-01-15", { unit: "months", amount: 3 })).toBe("2026-04-14");
    expect(computeExpiry("2026-11-30", { unit: "months", amount: 3 })).toBe("2027-02-27");
  });

  it("returns null for packs that never expire", () => {
    expect(computeExpiry("2026-01-05", null)).toBeNull();
  });

  it("rejects zero or fractional validity", () => {
    expect(() => computeExpiry("2026-01-05", { unit: "days", amount: 0 })).toThrow();
    expect(() => computeExpiry("2026-01-05", { unit: "days", amount: 1.5 })).toThrow();
  });
});

describe("validity and expiry", () => {
  const pack = { startsOn: "2026-01-05", expiresOn: "2026-04-12" };
  it("is valid from the start day through the expiry day", () => {
    expect(isPackValidOn(pack, "2026-01-04")).toBe(false);
    expect(isPackValidOn(pack, "2026-01-05")).toBe(true);
    expect(isPackValidOn(pack, "2026-04-12")).toBe(true);
    expect(isPackValidOn(pack, "2026-04-13")).toBe(false);
  });
  it("is expired the day after the expiry day", () => {
    expect(isPackExpired(pack, "2026-04-12")).toBe(false);
    expect(isPackExpired(pack, "2026-04-13")).toBe(true);
    expect(isPackExpired({ expiresOn: null }, "2099-01-01")).toBe(false);
  });
});

describe("choosePack", () => {
  const p = (
    id: string,
    expiresOn: string | null,
    available = 5,
    startsOn = "2026-01-01",
    created = 0,
  ): PackForAllocation => ({
    id,
    startsOn,
    expiresOn,
    available,
    createdAt: new Date(created),
  });

  it("spends from the pack closest to expiry first", () => {
    expect(
      choosePack([p("late", "2026-06-01"), p("soon", "2026-03-01"), p("mid", "2026-04-01")], "2026-02-01")?.id,
    ).toBe("soon");
  });

  it("spends never-expiring packs last", () => {
    expect(choosePack([p("forever", null), p("dated", "2026-12-01")], "2026-02-01")?.id).toBe("dated");
    expect(choosePack([p("forever", null)], "2026-02-01")?.id).toBe("forever");
  });

  it("skips packs with no credits", () => {
    expect(choosePack([p("empty", "2026-03-01", 0), p("full", "2026-06-01")], "2026-02-01")?.id).toBe("full");
  });

  it("skips packs that will have expired by the class date", () => {
    expect(choosePack([p("soon", "2026-03-01"), p("later", "2026-06-01")], "2026-03-02")?.id).toBe("later");
  });

  it("skips packs that haven't started by the class date", () => {
    expect(choosePack([p("future", "2026-06-01", 5, "2026-05-01")], "2026-02-01")).toBeNull();
  });

  it("breaks ties by the older pack", () => {
    expect(
      choosePack(
        [p("newer", "2026-03-01", 5, "2026-01-01", 2), p("older", "2026-03-01", 5, "2026-01-01", 1)],
        "2026-02-01",
      )?.id,
    ).toBe("older");
  });

  it("returns null when nothing is usable", () => {
    expect(choosePack([], "2026-02-01")).toBeNull();
  });
});
