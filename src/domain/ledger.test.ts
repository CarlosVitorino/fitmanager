import { describe, expect, it } from "vitest";
import { available, checkAdjustment, makeEntry } from "./ledger";

describe("ledger entries", () => {
  it("gives every kind a fixed sign", () => {
    expect(makeEntry("grant", 10).delta).toBe(10);
    expect(makeEntry("adjust", -2).delta).toBe(-2);
    expect(makeEntry("reserve").delta).toBe(-1);
    expect(makeEntry("release").delta).toBe(1);
    expect(makeEntry("consume").delta).toBe(0);
    expect(makeEntry("refund").delta).toBe(1);
    expect(makeEntry("charge").delta).toBe(-1);
    expect(makeEntry("expire", 3).delta).toBe(-3);
  });

  it("refuses nonsense amounts", () => {
    expect(() => makeEntry("grant", 0)).toThrow();
    expect(() => makeEntry("grant", -5)).toThrow();
    expect(() => makeEntry("adjust", 0)).toThrow();
    expect(() => makeEntry("expire", 0)).toThrow();
    expect(() => makeEntry("grant", 1.5)).toThrow();
  });

  it("derives the balance from the entries", () => {
    // 10 granted, 3 booked, 1 cancelled in time, 2 used, 1 refunded by the coach.
    const entries = [
      makeEntry("grant", 10),
      makeEntry("reserve"),
      makeEntry("reserve"),
      makeEntry("reserve"),
      makeEntry("release"),
      makeEntry("consume"),
      makeEntry("consume"),
      makeEntry("refund"),
    ];
    expect(available(entries)).toBe(9);
  });
});

describe("checkAdjustment", () => {
  it("allows additions and removals within what's free", () => {
    expect(checkAdjustment(3, 2)).toEqual({ ok: true });
    expect(checkAdjustment(3, -3)).toEqual({ ok: true });
  });
  it("refuses taking a pack below zero", () => {
    expect(checkAdjustment(3, -4)).toMatchObject({ ok: false });
  });
  it("refuses zero and fractions", () => {
    expect(checkAdjustment(3, 0)).toMatchObject({ ok: false });
    expect(checkAdjustment(3, 0.5)).toMatchObject({ ok: false });
  });
});
