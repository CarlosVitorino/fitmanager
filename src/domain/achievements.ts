import { addDays, startOfWeek, type LocalDate } from "./dates";

export const MILESTONES = [1, 10, 25, 50, 100, 200, 500] as const;

export interface Milestone {
  count: number;
  reachedOn: LocalDate | null;
}

export interface Achievements {
  totalClasses: number;
  /** Consecutive weeks (Mon–Sun) with at least one class, ending this week or last week. */
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  classesThisWeek: number;
  milestones: Milestone[];
  nextMilestone: { count: number; remaining: number } | null;
}

/**
 * Simple class-count gamification. `classDates` are the dates of classes the member attended
 * (settled bookings that weren't no-shows), in any order.
 */
export function computeAchievements(classDates: readonly LocalDate[], today: LocalDate): Achievements {
  const sorted = [...classDates].sort();
  const weeks = [...new Set(sorted.map(startOfWeek))].sort();

  let longest = 0;
  let run = 0;
  let prev: LocalDate | null = null;
  for (const w of weeks) {
    run = prev !== null && addDays(prev, 7) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }

  // The current streak survives until the end of this week: a member who trained last week
  // but not yet this week still has their streak.
  const thisWeek = startOfWeek(today);
  const weekSet = new Set(weeks);
  let cursor = weekSet.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  let current = 0;
  while (weekSet.has(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }

  const milestones = MILESTONES.map((count) => ({ count, reachedOn: sorted[count - 1] ?? null }));
  const next = MILESTONES.find((m) => m > sorted.length);

  return {
    totalClasses: sorted.length,
    currentStreakWeeks: current,
    longestStreakWeeks: longest,
    classesThisWeek: sorted.filter((d) => startOfWeek(d) === thisWeek).length,
    milestones,
    nextMilestone: next ? { count: next, remaining: next - sorted.length } : null,
  };
}
