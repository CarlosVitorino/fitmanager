import { describe, expect, it } from "vitest";
import { ageOn, measurementChange, summariseBenchmarks, weeklyCounts } from "./progress";

describe("weeklyCounts", () => {
  it("buckets classes into the last N weeks, oldest first", () => {
    const w = weeklyCounts(["2026-11-16", "2026-11-17", "2026-11-10", "2026-09-01"], "2026-11-18", 3);
    expect(w).toEqual([
      { weekStart: "2026-11-02", count: 0 },
      { weekStart: "2026-11-09", count: 1 },
      { weekStart: "2026-11-16", count: 2 },
    ]);
  });
});

describe("summariseBenchmarks", () => {
  it("finds best, first and latest, higher is better for weights", () => {
    const [squat] = summariseBenchmarks([
      { exercise: "Back squat", value: 50, unit: "kg", recordedOn: "2026-09-01" },
      { exercise: "back squat ", value: 65, unit: "kg", recordedOn: "2026-10-01" },
      { exercise: "Back squat", value: 60, unit: "kg", recordedOn: "2026-11-01" },
    ]);
    expect(squat).toMatchObject({ best: { value: 65 }, first: { value: 50 }, latest: { value: 60 }, improvement: 10 });
  });

  it("treats a lower time as better", () => {
    const [run] = summariseBenchmarks([
      { exercise: "5 km run", value: 30, unit: "minutes", recordedOn: "2026-09-01" },
      { exercise: "5 km run", value: 27.5, unit: "minutes", recordedOn: "2026-11-01" },
    ]);
    expect(run).toMatchObject({ best: { value: 27.5 }, improvement: 2.5 });
  });

  it("keeps different units apart", () => {
    expect(
      summariseBenchmarks([
        { exercise: "Plank", value: 60, unit: "seconds", recordedOn: "2026-09-01" },
        { exercise: "Plank", value: 2, unit: "minutes", recordedOn: "2026-10-01" },
      ]),
    ).toHaveLength(2);
  });
});

describe("measurementChange", () => {
  const rows = [
    { measuredOn: "2026-11-01", weight: 70.4 },
    { measuredOn: "2026-09-01", weight: 73.0 },
    { measuredOn: "2026-10-01", weight: null },
  ];
  it("compares the first and latest recorded values, skipping blanks", () => {
    expect(measurementChange(rows, (r) => r.weight)).toEqual({
      first: 73,
      latest: 70.4,
      change: -2.6,
      since: "2026-09-01",
      points: [73, 70.4],
    });
  });
  it("is null with no values", () => {
    expect(measurementChange([{ measuredOn: "2026-01-01", weight: null }], (r) => r.weight)).toBeNull();
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("1990-11-19", "2026-11-18")).toBe(35);
    expect(ageOn("1990-11-18", "2026-11-18")).toBe(36);
  });
});
