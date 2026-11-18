import { describe, expect, it } from "vitest";
import { computeAchievements } from "./achievements";

const today = "2026-11-18"; // Wednesday

describe("computeAchievements", () => {
  it("is empty for a new member", () => {
    const a = computeAchievements([], today);
    expect(a).toMatchObject({
      totalClasses: 0,
      currentStreakWeeks: 0,
      longestStreakWeeks: 0,
      nextMilestone: { count: 1, remaining: 1 },
    });
  });

  it("counts consecutive weeks, not classes", () => {
    // Two classes this week, one last week, one the week before.
    const a = computeAchievements(["2026-11-16", "2026-11-17", "2026-11-12", "2026-11-03"], today);
    expect(a.currentStreakWeeks).toBe(3);
    expect(a.classesThisWeek).toBe(2);
    expect(a.totalClasses).toBe(4);
  });

  it("keeps the streak alive until this week ends", () => {
    expect(computeAchievements(["2026-11-12", "2026-11-05"], today).currentStreakWeeks).toBe(2);
  });

  it("breaks the streak after a missed week but remembers the longest", () => {
    const a = computeAchievements(["2026-10-06", "2026-10-13", "2026-10-20", "2026-11-16"], today);
    expect(a.currentStreakWeeks).toBe(1);
    expect(a.longestStreakWeeks).toBe(3);
  });

  it("is zero when the last class was two weeks ago", () => {
    expect(computeAchievements(["2026-11-03"], today).currentStreakWeeks).toBe(0);
  });

  it("records the date each milestone was reached", () => {
    const dates = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const a = computeAchievements(dates, today);
    expect(a.milestones.find((m) => m.count === 1)?.reachedOn).toBe("2026-10-01");
    expect(a.milestones.find((m) => m.count === 10)?.reachedOn).toBe("2026-10-10");
    expect(a.milestones.find((m) => m.count === 25)?.reachedOn).toBeNull();
    expect(a.nextMilestone).toEqual({ count: 25, remaining: 13 });
  });
});
