import { addDays, startOfWeek, type LocalDate } from "./dates";

/** Classes per week for the last `weeks` weeks (oldest first), for the attendance chart. */
export function weeklyCounts(
  classDates: readonly LocalDate[],
  today: LocalDate,
  weeks = 12,
): { weekStart: LocalDate; count: number }[] {
  const thisWeek = startOfWeek(today);
  const buckets = Array.from({ length: weeks }, (_, i) => ({
    weekStart: addDays(thisWeek, -7 * (weeks - 1 - i)),
    count: 0,
  }));
  const index = new Map(buckets.map((b, i) => [b.weekStart, i]));
  for (const d of classDates) {
    const i = index.get(startOfWeek(d));
    if (i !== undefined) buckets[i]!.count++;
  }
  return buckets;
}

export interface Result {
  exercise: string;
  value: number;
  unit: string;
  recordedOn: LocalDate;
}

/** For time-based units a smaller result is better. */
export function lowerIsBetter(unit: string): boolean {
  return unit === "seconds" || unit === "minutes";
}

export interface ExerciseSummary {
  exercise: string;
  unit: string;
  best: Result;
  latest: Result;
  first: Result;
  history: Result[];
  /** Change from first to latest, signed so positive always means better. */
  improvement: number;
}

/**
 * Groups results by exercise (case-insensitive) and finds the personal best, first and latest.
 * Results with different units for the same exercise are kept apart.
 */
export function summariseBenchmarks(results: readonly Result[]): ExerciseSummary[] {
  const groups = new Map<string, Result[]>();
  for (const r of results) {
    const key = `${r.exercise.trim().toLowerCase()}|${r.unit}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .map((list) => {
      const history = [...list].sort((a, b) =>
        a.recordedOn < b.recordedOn ? -1 : a.recordedOn > b.recordedOn ? 1 : 0,
      );
      const lower = lowerIsBetter(history[0]!.unit);
      const best = history.reduce((b, r) => (lower ? (r.value < b.value ? r : b) : r.value > b.value ? r : b));
      const first = history[0]!;
      const latest = history[history.length - 1]!;
      return {
        exercise: latest.exercise,
        unit: latest.unit,
        best,
        latest,
        first,
        history,
        improvement: lower ? first.value - latest.value : latest.value - first.value,
      };
    })
    .sort((a, b) => a.exercise.localeCompare(b.exercise));
}

/** First and latest non-empty value of one measurement, for "−3.2 kg since 3 Oct". */
export function measurementChange<T extends { measuredOn: LocalDate }>(
  rows: readonly T[],
  pick: (row: T) => number | null,
): { first: number; latest: number; change: number; since: LocalDate; points: number[] } | null {
  const withValue = [...rows]
    .filter((r) => pick(r) !== null && pick(r) !== undefined)
    .sort((a, b) => (a.measuredOn < b.measuredOn ? -1 : 1));
  if (!withValue.length) return null;
  const first = pick(withValue[0]!)!;
  const latest = pick(withValue[withValue.length - 1]!)!;
  return {
    first,
    latest,
    change: Math.round((latest - first) * 10) / 10,
    since: withValue[0]!.measuredOn,
    points: withValue.map((r) => pick(r)!),
  };
}

/** Whole years between a birth date and today. */
export function ageOn(dateOfBirth: LocalDate, today: LocalDate): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
