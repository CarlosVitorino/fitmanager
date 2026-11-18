import { describe, expect, it } from "vitest";
import { isBookingOpen, isFreeCancellation, minutesUntil } from "./time";

const start = new Date("2026-12-01T18:00:00Z");
const at = (iso: string) => new Date(iso);

describe("booking window", () => {
  it("is open exactly at the cutoff and closed one minute after", () => {
    expect(isBookingOpen(start, at("2026-12-01T16:00:00Z"), 120)).toBe(true);
    expect(isBookingOpen(start, at("2026-12-01T16:01:00Z"), 120)).toBe(false);
  });
});

describe("cancellation window", () => {
  it("returns the credit up to 24h before and not after", () => {
    expect(isFreeCancellation(start, at("2026-11-30T18:00:00Z"), 1440)).toBe(true);
    expect(isFreeCancellation(start, at("2026-11-30T18:00:30Z"), 1440)).toBe(false);
  });
});

describe("minutesUntil", () => {
  it("is negative after start", () => {
    expect(minutesUntil(start, at("2026-12-01T18:30:00Z"))).toBe(-30);
  });
});
