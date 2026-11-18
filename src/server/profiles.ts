/** Personal profile, fitness profile, measurements and benchmarks for a member. */
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { msg, t } from "../i18n";
import { isLocalDate } from "../domain/dates";
import {
  BENCHMARK_UNITS,
  benchmark,
  bodyMeasurement,
  CLEARANCE,
  EXPERIENCE_LEVELS,
  fitnessProfile,
  memberProfile,
  user,
} from "../db/schema";
import { can } from "./authz";
import { notFound } from "./errors";
import { cleanHtml } from "./html";
import { getMember } from "./members";
import { requireCapability, type StudioContext } from "./studio-context";
import { db } from "./tx";

const opt = (max = 120) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();
const optDate = z
  .string()
  .trim()
  .transform((v) => v || null)
  .nullable()
  .refine((v) => v === null || isLocalDate(v), msg("errors.pickDate"));

/* ---------- Personal profile ---------- */

export const personalInput = z.object({
  name: z.string().trim().min(1, msg("errors.enterName")).max(80),
  phone: opt(40),
  dateOfBirth: optDate,
  gender: opt(40),
  addressLine: opt(200),
  city: opt(80),
  postalCode: opt(20),
  country: opt(80),
  emergencyName: opt(80),
  emergencyPhone: opt(40),
});
export type PersonalInput = z.infer<typeof personalInput>;

export async function getPersonal(ctx: StudioContext, memberId: string) {
  const m = await getMember(ctx, memberId);
  const [p] = await db
    .select()
    .from(memberProfile)
    .where(and(eq(memberProfile.studioId, ctx.studioId), eq(memberProfile.userId, memberId)));
  return {
    name: m.name,
    email: m.email,
    phone: p?.phone ?? null,
    dateOfBirth: p?.dateOfBirth ?? null,
    gender: p?.gender ?? null,
    addressLine: p?.addressLine ?? null,
    city: p?.city ?? null,
    postalCode: p?.postalCode ?? null,
    country: p?.country ?? null,
    emergencyName: p?.emergencyName ?? null,
    emergencyPhone: p?.emergencyPhone ?? null,
  };
}

/** Members edit their own details; staff can edit anyone's. */
export async function savePersonal(ctx: StudioContext, memberId: string, input: PersonalInput) {
  if (memberId !== ctx.userId) requireCapability(ctx, "members:manage");
  await getMember(ctx, memberId);
  const { name, ...details } = input;
  await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, memberId));
  await db
    .insert(memberProfile)
    .values({ studioId: ctx.studioId, userId: memberId, ...details })
    .onConflictDoUpdate({
      target: [memberProfile.studioId, memberProfile.userId],
      set: { ...details, updatedAt: new Date() },
    });
}

/* ---------- Fitness profile ---------- */

export const GOALS = [
  "Lose fat",
  "Build muscle",
  "Get stronger",
  "Move better",
  "Endurance",
  "Return from injury",
  "Sport performance",
  "Health & wellbeing",
] as const;

export const SECTIONS = ["goals", "background", "health", "measurements", "benchmarks"] as const;
export type Section = (typeof SECTIONS)[number];

export const fitnessInput = z.object({
  goals: z.array(z.string().trim().max(40)).max(12),
  goalNotes: z.string().nullable(),
  targetDate: optDate,
  experience: z.enum(EXPERIENCE_LEVELS).nullable(),
  trainingNotes: z.string().nullable(),
  clearance: z.enum(CLEARANCE),
  injuries: z.string().nullable(),
  medical: z.string().nullable(),
});

export type FitnessProfile = {
  goals: string[];
  goalNotes: string | null;
  targetDate: string | null;
  experience: (typeof EXPERIENCE_LEVELS)[number] | null;
  trainingNotes: string | null;
  clearance: (typeof CLEARANCE)[number];
  injuries: string | null;
  medical: string | null;
  shared: Record<Section, boolean>;
  updatedAt: Date | null;
};

const EMPTY: FitnessProfile = {
  goals: [],
  goalNotes: null,
  targetDate: null,
  experience: null,
  trainingNotes: null,
  clearance: "unknown",
  injuries: null,
  medical: null,
  shared: { goals: true, background: true, health: false, measurements: true, benchmarks: true },
  updatedAt: null,
};

/**
 * The fitness profile as the viewer may see it. Staff see everything; a member sees only the
 * sections their coach shared (the others come back empty and marked not shared).
 */
export async function getFitness(ctx: StudioContext, memberId: string): Promise<FitnessProfile> {
  if (memberId !== ctx.userId) await getMember(ctx, memberId);
  const [row] = await db
    .select()
    .from(fitnessProfile)
    .where(and(eq(fitnessProfile.studioId, ctx.studioId), eq(fitnessProfile.userId, memberId)));
  const p: FitnessProfile = row
    ? {
        goals: row.goals,
        goalNotes: row.goalNotes,
        targetDate: row.targetDate,
        experience: row.experience,
        trainingNotes: row.trainingNotes,
        clearance: row.clearance,
        injuries: row.injuries,
        medical: row.medical,
        shared: {
          goals: row.shareGoals,
          background: row.shareBackground,
          health: row.shareHealth,
          measurements: row.shareMeasurements,
          benchmarks: row.shareBenchmarks,
        },
        updatedAt: row.updatedAt,
      }
    : structuredClone(EMPTY);
  if (can(ctx.role, "notes:private")) return p;
  if (!p.shared.goals) Object.assign(p, { goals: [], goalNotes: null, targetDate: null });
  if (!p.shared.background) Object.assign(p, { experience: null, trainingNotes: null });
  if (!p.shared.health) Object.assign(p, { clearance: "unknown", injuries: null, medical: null });
  return p;
}

export async function saveFitness(ctx: StudioContext, memberId: string, input: z.infer<typeof fitnessInput>) {
  requireCapability(ctx, "notes:private");
  await getMember(ctx, memberId);
  const values = {
    goals: [...new Set(input.goals.filter(Boolean))],
    goalNotes: cleanHtml(input.goalNotes),
    targetDate: input.targetDate,
    experience: input.experience,
    trainingNotes: cleanHtml(input.trainingNotes),
    clearance: input.clearance,
    injuries: cleanHtml(input.injuries),
    medical: cleanHtml(input.medical),
    updatedAt: new Date(),
    updatedBy: ctx.userId,
  };
  await db
    .insert(fitnessProfile)
    .values({ studioId: ctx.studioId, userId: memberId, ...values })
    .onConflictDoUpdate({ target: [fitnessProfile.studioId, fitnessProfile.userId], set: values });
}

const SHARE_COLUMN = {
  goals: "shareGoals",
  background: "shareBackground",
  health: "shareHealth",
  measurements: "shareMeasurements",
  benchmarks: "shareBenchmarks",
} as const;

/** Shows or hides one section of the fitness profile from the member. */
export async function setSectionShared(ctx: StudioContext, memberId: string, section: Section, shared: boolean) {
  requireCapability(ctx, "notes:private");
  await getMember(ctx, memberId);
  const set = { [SHARE_COLUMN[section]]: shared, updatedAt: new Date(), updatedBy: ctx.userId };
  await db
    .insert(fitnessProfile)
    .values({ studioId: ctx.studioId, userId: memberId, ...set })
    .onConflictDoUpdate({ target: [fitnessProfile.studioId, fitnessProfile.userId], set });
}

/* ---------- Measurements ---------- */

const num = (min: number, max: number) => z.number().min(min).max(max).nullable();
export const measurementInput = z
  .object({
    measuredOn: z.string().refine(isLocalDate, msg("errors.pickDate")),
    weightKg: num(20, 400),
    bodyFatPct: num(2, 75),
    waistCm: num(30, 250),
    hipsCm: num(30, 250),
    chestCm: num(30, 250),
    armCm: num(10, 100),
    thighCm: num(20, 150),
    restingHr: z.number().int().min(25).max(220).nullable(),
    note: opt(300),
  })
  .refine(
    (m) =>
      [m.weightKg, m.bodyFatPct, m.waistCm, m.hipsCm, m.chestCm, m.armCm, m.thighCm, m.restingHr].some(
        (v) => v !== null,
      ),
    msg("errors.oneMeasurement"),
  );

/** Measurements, oldest first. Members only see them when the section is shared. */
export async function listMeasurements(ctx: StudioContext, memberId: string) {
  if (!(await canSee(ctx, memberId, "measurements"))) return [];
  return db
    .select()
    .from(bodyMeasurement)
    .where(and(eq(bodyMeasurement.studioId, ctx.studioId), eq(bodyMeasurement.memberId, memberId)))
    .orderBy(asc(bodyMeasurement.measuredOn), asc(bodyMeasurement.createdAt));
}

export async function addMeasurement(ctx: StudioContext, memberId: string, input: z.infer<typeof measurementInput>) {
  requireCapability(ctx, "notes:private");
  await getMember(ctx, memberId);
  await db.insert(bodyMeasurement).values({ ...input, studioId: ctx.studioId, memberId, createdBy: ctx.userId });
}

export async function deleteMeasurement(ctx: StudioContext, id: string) {
  requireCapability(ctx, "notes:private");
  const [row] = await db
    .delete(bodyMeasurement)
    .where(and(eq(bodyMeasurement.id, id), eq(bodyMeasurement.studioId, ctx.studioId)))
    .returning({ id: bodyMeasurement.id });
  if (!row) throw notFound(t("errors.measurementNotFound"));
}

/* ---------- Benchmarks ---------- */

export const benchmarkInput = z.object({
  exercise: z.string().trim().min(2, msg("errors.nameExercise")).max(60),
  value: z.number().positive(msg("errors.enterResult")).max(100000),
  unit: z.enum(BENCHMARK_UNITS),
  recordedOn: z.string().refine(isLocalDate, msg("errors.pickDate")),
  note: opt(300),
});

export async function listBenchmarks(ctx: StudioContext, memberId: string) {
  if (!(await canSee(ctx, memberId, "benchmarks"))) return [];
  return db
    .select()
    .from(benchmark)
    .where(and(eq(benchmark.studioId, ctx.studioId), eq(benchmark.memberId, memberId)))
    .orderBy(desc(benchmark.recordedOn), desc(benchmark.createdAt));
}

export async function addBenchmark(ctx: StudioContext, memberId: string, input: z.infer<typeof benchmarkInput>) {
  requireCapability(ctx, "notes:private");
  await getMember(ctx, memberId);
  await db.insert(benchmark).values({ ...input, studioId: ctx.studioId, memberId, createdBy: ctx.userId });
}

export async function deleteBenchmark(ctx: StudioContext, id: string) {
  requireCapability(ctx, "notes:private");
  const [row] = await db
    .delete(benchmark)
    .where(and(eq(benchmark.id, id), eq(benchmark.studioId, ctx.studioId)))
    .returning({ id: benchmark.id });
  if (!row) throw notFound(t("errors.resultNotFound"));
}

/** Exercise names already used in the studio, for autocomplete. */
export async function knownExercises(ctx: StudioContext): Promise<string[]> {
  const rows = await db
    .selectDistinct({ exercise: benchmark.exercise })
    .from(benchmark)
    .where(eq(benchmark.studioId, ctx.studioId))
    .orderBy(asc(benchmark.exercise));
  const defaults = [
    "Back squat",
    "Deadlift",
    "Bench press",
    "Overhead press",
    "Pull-ups",
    "Push-ups",
    "Plank",
    "5 km run",
    "Row 500 m",
  ];
  return [...new Set([...defaults, ...rows.map((r) => r.exercise)])];
}

async function canSee(ctx: StudioContext, memberId: string, section: Section): Promise<boolean> {
  if (memberId !== ctx.userId) {
    requireCapability(ctx, "members:view");
    await getMember(ctx, memberId); // 404 for someone outside this studio
    return true;
  }
  if (can(ctx.role, "notes:private")) return true;
  return (await getFitness(ctx, memberId)).shared[section];
}
