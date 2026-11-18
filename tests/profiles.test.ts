/** Personal and fitness profiles, sharing, measurements, benchmarks and rich-text notes. */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { makeStudio, makeUser, resetDb, type Studio } from "./fixtures";

const profiles = await import("../src/server/profiles");
const members = await import("../src/server/members");

let s: Studio;
beforeAll(resetDb);
beforeEach(async () => {
  s = await makeStudio();
});

const fitness = {
  goals: ["Get stronger", "Move better"],
  goalNotes: "<p>Deadlift <strong>100 kg</strong> by summer</p>",
  targetDate: "2027-06-01",
  experience: "some" as const,
  trainingNotes: "<p>Played football at school.</p>",
  clearance: "cleared" as const,
  injuries: "<p>Left knee, avoid deep lunges</p>",
  medical: "<p>Asthma, has inhaler</p>",
};

describe("personal profile", () => {
  it("lets the member and staff edit it, with nothing required", async () => {
    await profiles.savePersonal(
      s.member,
      s.memberId,
      profiles.personalInput.parse({
        name: "Mia",
        phone: "",
        dateOfBirth: "",
        gender: "",
        addressLine: "",
        city: "Porto",
        postalCode: "",
        country: "",
        emergencyName: "",
        emergencyPhone: "",
      }),
    );
    expect(await profiles.getPersonal(s.owner, s.memberId)).toMatchObject({
      name: "Mia",
      city: "Porto",
      phone: null,
      dateOfBirth: null,
    });
  });

  it("doesn't let a member edit someone else", async () => {
    const other = await makeStudio();
    await expect(
      profiles.savePersonal(
        s.member,
        other.memberId,
        profiles.personalInput.parse({
          name: "X",
          phone: null,
          dateOfBirth: null,
          gender: null,
          addressLine: null,
          city: null,
          postalCode: null,
          country: null,
          emergencyName: null,
          emergencyPhone: null,
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("fitness profile sharing", () => {
  it("shows coaches everything and members only shared sections (health private by default)", async () => {
    await profiles.saveFitness(s.owner, s.memberId, fitness);
    expect(await profiles.getFitness(s.owner, s.memberId)).toMatchObject({
      injuries: fitness.injuries,
      medical: fitness.medical,
    });
    const mine = await profiles.getFitness(s.member, s.memberId);
    expect(mine).toMatchObject({
      goals: ["Get stronger", "Move better"],
      experience: "some",
      injuries: null,
      medical: null,
      clearance: "unknown",
    });
    expect(mine.shared.health).toBe(false);
  });

  it("hides a section once the coach stops sharing it", async () => {
    await profiles.saveFitness(s.owner, s.memberId, fitness);
    await profiles.setSectionShared(s.owner, s.memberId, "goals", false);
    await profiles.setSectionShared(s.owner, s.memberId, "health", true);
    const mine = await profiles.getFitness(s.member, s.memberId);
    expect(mine).toMatchObject({ goals: [], goalNotes: null, injuries: fitness.injuries });
  });

  it("can only be written by staff", async () => {
    await expect(profiles.saveFitness(s.member, s.memberId, fitness)).rejects.toThrow(/permission/);
  });

  it("sanitizes rich text", async () => {
    await profiles.saveFitness(s.owner, s.memberId, {
      ...fitness,
      goalNotes: '<p>ok<script>alert(1)</script><img src=x onerror="x()"></p>',
    });
    expect((await profiles.getFitness(s.owner, s.memberId)).goalNotes).toBe("<p>ok</p>");
  });
});

describe("measurements and benchmarks", () => {
  it("are visible to the member only while shared", async () => {
    await profiles.addMeasurement(
      s.owner,
      s.memberId,
      profiles.measurementInput.parse({
        measuredOn: "2026-11-01",
        weightKg: 70.5,
        bodyFatPct: null,
        waistCm: 80,
        hipsCm: null,
        chestCm: null,
        armCm: null,
        thighCm: null,
        restingHr: null,
        note: null,
      }),
    );
    await profiles.addBenchmark(s.owner, s.memberId, {
      exercise: "Back squat",
      value: 60,
      unit: "kg",
      recordedOn: "2026-11-01",
      note: null,
    });
    expect(await profiles.listMeasurements(s.member, s.memberId)).toHaveLength(1);
    await profiles.setSectionShared(s.owner, s.memberId, "measurements", false);
    expect(await profiles.listMeasurements(s.member, s.memberId)).toHaveLength(0);
    expect(await profiles.listMeasurements(s.owner, s.memberId)).toHaveLength(1);
    expect(await profiles.listBenchmarks(s.member, s.memberId)).toHaveLength(1);
  });

  it("need at least one value", () => {
    expect(
      profiles.measurementInput.safeParse({
        measuredOn: "2026-11-01",
        weightKg: null,
        bodyFatPct: null,
        waistCm: null,
        hipsCm: null,
        chestCm: null,
        armCm: null,
        thighCm: null,
        restingHr: null,
        note: null,
      }).success,
    ).toBe(false);
  });

  it("can't be read across studios", async () => {
    const other = await makeStudio();
    await expect(profiles.listBenchmarks(other.owner, s.memberId)).rejects.toThrow(/not found/i);
    void makeUser;
  });
});

describe("rich-text notes", () => {
  it("sanitizes, keeps category, and lists pinned first", async () => {
    await members.addNote(s.owner, s.memberId, { body: "<p>First</p>", visibility: "shared" });
    await members.addNote(s.owner, s.memberId, {
      body: '<p onclick="x">Plan <b>A</b></p>',
      visibility: "shared",
      category: "programme",
      pinned: true,
    });
    const notes = await members.listNotes(s.member, s.memberId);
    expect(notes[0]).toMatchObject({ body: "<p>Plan <b>A</b></p>", category: "programme", pinned: true });
  });

  it("refuses an empty note", async () => {
    await expect(members.addNote(s.owner, s.memberId, { body: "<p> </p>", visibility: "private" })).rejects.toThrow(
      /Write something/,
    );
  });
});
