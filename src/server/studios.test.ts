import { describe, expect, it } from "vitest";
import { createStudioInput } from "./studios";

const valid = { name: "North Studio", slug: "north-studio", timezone: "Europe/Lisbon" };

describe("createStudioInput", () => {
  it("accepts a valid studio", () => {
    expect(createStudioInput.parse({ ...valid, slug: "North-Studio" }).slug).toBe("north-studio");
  });

  it.each(["ab", "-north", "north--studio", "north_studio", "api", "login"])("rejects slug %s", (slug) => {
    expect(createStudioInput.safeParse({ ...valid, slug }).success).toBe(false);
  });

  it("rejects unknown timezones", () => {
    expect(createStudioInput.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(false);
  });
});
