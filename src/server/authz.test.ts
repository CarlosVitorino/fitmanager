import { describe, expect, it } from "vitest";
import { assertCan, can, isRole } from "./authz";

describe("authz", () => {
  it("lets staff manage credits and members only book", () => {
    expect(can("owner", "credits:manage")).toBe(true);
    expect(can("coach", "credits:manage")).toBe(true);
    expect(can("member", "credits:manage")).toBe(false);
    expect(can("member", "bookings:self")).toBe(true);
  });

  it("keeps studio settings and staff to the owner", () => {
    expect(can("coach", "studio:settings")).toBe(false);
    expect(can("coach", "staff:manage")).toBe(false);
    expect(can("owner", "studio:settings")).toBe(true);
  });

  it("keeps private notes away from members", () => {
    expect(can("member", "notes:private")).toBe(false);
    expect(() => assertCan("member", "notes:private")).toThrow(/permission/);
  });

  it("rejects unknown roles", () => {
    expect(isRole("admin")).toBe(false);
    expect(isRole("coach")).toBe(true);
  });
});
