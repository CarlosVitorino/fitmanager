import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/*
 * Every table here belongs to one studio and carries `studio_id`. Server code reaches them only
 * through functions that take a StudioContext and filter by it (see src/server/).
 * Dates (`date` columns) are studio-local calendar days; timestamps are UTC instants.
 */

const id = () => uuid().primaryKey().defaultRandom();
const studioId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const userRef = () => text().references(() => user.id, { onDelete: "set null" });
const memberRef = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const localDate = () => date({ mode: "string" });

/** FitManager settings for a studio (1:1 with organization), apart from Better Auth's table. */
export const studioSettings = pgTable("studio_settings", {
  studioId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  /** IANA timezone; class dates, expiry and settlement are computed in it. */
  timezone: text().notNull().default("UTC"),
  /** ISO 4217 code used to show plan prices and record payments. */
  currency: text().notNull().default("EUR"),
  /** Language used when a person hasn't picked one and their browser's isn't supported. */
  locale: text().notNull().default("en"),
  /** Members can book until this many minutes before a class starts. */
  bookingCutoffMinutes: integer().notNull().default(120),
  /** Cancelling later than this many minutes before start keeps the credit spent. */
  cancellationCutoffMinutes: integer().notNull().default(1440),
  /** Secret part of the member invite link. Regenerating it invalidates old links. */
  joinCode: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Personal details for a member in a studio. Nothing is mandatory; the member and staff can edit it. */
export const memberProfile = pgTable(
  "member_profile",
  {
    studioId: studioId(),
    userId: memberRef(),
    phone: text(),
    dateOfBirth: localDate(),
    gender: text(),
    addressLine: text(),
    city: text(),
    postalCode: text(),
    country: text(),
    emergencyName: text(),
    emergencyPhone: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.studioId, t.userId)],
);

export const EXPERIENCE_LEVELS = ["new", "some", "regular", "advanced"] as const;
export const CLEARANCE = ["unknown", "cleared", "needs_clearance"] as const;

/**
 * The coach's record of a member's training: goals, background, health. Each section can be shared
 * with the member or kept to coaches. Rich-text fields hold sanitized HTML.
 */
export const fitnessProfile = pgTable(
  "fitness_profile",
  {
    studioId: studioId(),
    userId: memberRef(),
    goals: jsonb().$type<string[]>().notNull().default([]),
    goalNotes: text(),
    targetDate: localDate(),
    experience: text({ enum: EXPERIENCE_LEVELS }),
    trainingNotes: text(),
    clearance: text({ enum: CLEARANCE }).notNull().default("unknown"),
    injuries: text(),
    medical: text(),
    shareGoals: boolean().notNull().default(true),
    shareBackground: boolean().notNull().default(true),
    shareHealth: boolean().notNull().default(false),
    shareMeasurements: boolean().notNull().default(true),
    shareBenchmarks: boolean().notNull().default(true),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: userRef(),
  },
  (t) => [uniqueIndex().on(t.studioId, t.userId)],
);

/** Body measurements over time. Every value is optional. */
export const bodyMeasurement = pgTable(
  "body_measurement",
  {
    id: id(),
    studioId: studioId(),
    memberId: memberRef(),
    measuredOn: localDate().notNull(),
    weightKg: doublePrecision(),
    bodyFatPct: doublePrecision(),
    waistCm: doublePrecision(),
    hipsCm: doublePrecision(),
    chestCm: doublePrecision(),
    armCm: doublePrecision(),
    thighCm: doublePrecision(),
    restingHr: integer(),
    note: text(),
    createdBy: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId, t.memberId, t.measuredOn)],
);

export const BENCHMARK_UNITS = ["kg", "reps", "seconds", "minutes", "metres", "km", "cm"] as const;
/** Units where a smaller result is better (e.g. a 5 km run time). */
export const LOWER_IS_BETTER_UNITS = ["seconds", "minutes"] as const;

/** Performance results over time: "Back squat 60 kg", "5 km run 26 minutes". */
export const benchmark = pgTable(
  "benchmark",
  {
    id: id(),
    studioId: studioId(),
    memberId: memberRef(),
    exercise: text().notNull(),
    value: doublePrecision().notNull(),
    unit: text({ enum: BENCHMARK_UNITS }).notNull(),
    recordedOn: localDate().notNull(),
    note: text(),
    createdBy: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId, t.memberId, t.exercise)],
);

/** A plan the studio offers: single class, trimester, 10-pack… */
export const packType = pgTable(
  "pack_type",
  {
    id: id(),
    studioId: studioId(),
    name: text().notNull(),
    description: text(),
    entries: integer().notNull(),
    /** null with validityAmount null: never expires. */
    validityUnit: text({ enum: ["days", "weeks", "months"] }),
    validityAmount: integer(),
    priceCents: integer(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.studioId),
    check("pack_type_entries_positive", sql`${t.entries} > 0`),
    check(
      "pack_type_validity_pair",
      sql`(${t.validityUnit} is null) = (${t.validityAmount} is null) and coalesce(${t.validityAmount}, 1) > 0`,
    ),
  ],
);

/** A plan assigned to one member. Its balance lives in credit_entry. */
export const pack = pgTable(
  "pack",
  {
    id: id(),
    studioId: studioId(),
    memberId: memberRef(),
    packTypeId: uuid().references(() => packType.id, { onDelete: "set null" }),
    /** Copied from the pack type at assignment so later edits to the type don't rewrite history. */
    name: text().notNull(),
    entries: integer().notNull(),
    startsOn: localDate().notNull(),
    expiresOn: localDate(),
    /** Set once settlement has written the expire entry. */
    expiredAt: timestamp({ withTimezone: true }),
    note: text(),
    createdBy: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId, t.memberId), index().on(t.studioId, t.expiresOn)],
);

export const CREDIT_KINDS = ["grant", "adjust", "reserve", "release", "consume", "refund", "charge", "expire"] as const;

/** The credit ledger: append-only. A pack's available credits are the sum of its deltas. */
export const creditEntry = pgTable(
  "credit_entry",
  {
    id: id(),
    studioId: studioId(),
    packId: uuid()
      .notNull()
      .references(() => pack.id, { onDelete: "cascade" }),
    memberId: memberRef(),
    kind: text({ enum: CREDIT_KINDS }).notNull(),
    delta: integer().notNull(),
    bookingId: uuid(),
    actorId: userRef(),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.packId), index().on(t.studioId, t.memberId), index().on(t.bookingId)],
);

export const PAYMENT_METHODS = ["cash", "card", "transfer", "other"] as const;

/** A payment the coach recorded by hand (usually when assigning a plan). */
export const payment = pgTable(
  "payment",
  {
    id: id(),
    studioId: studioId(),
    memberId: memberRef(),
    packId: uuid().references(() => pack.id, { onDelete: "set null" }),
    amountCents: integer().notNull(),
    currency: text().notNull(),
    method: text({ enum: PAYMENT_METHODS }).notNull(),
    paidOn: localDate().notNull(),
    note: text(),
    recordedBy: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId, t.paidOn), index().on(t.studioId, t.memberId)],
);

/** A schedule the studio runs, e.g. Group classes, Private classes. */
export const calendar = pgTable(
  "calendar",
  {
    id: id(),
    studioId: studioId(),
    name: text().notNull(),
    description: text(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId)],
);

/** A kind of class shown in the calendar: General class, Upper body, Legs day… */
export const classTemplate = pgTable(
  "class_template",
  {
    id: id(),
    studioId: studioId(),
    name: text().notNull(),
    description: text(),
    color: text().notNull().default("#57534e"),
    icon: text().notNull().default("🏋️"),
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId)],
);

/** A weekly recurring slot that generates dated sessions. */
export const slot = pgTable(
  "slot",
  {
    id: id(),
    studioId: studioId(),
    calendarId: uuid()
      .notNull()
      .references(() => calendar.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => classTemplate.id),
    weekday: smallint().notNull(),
    startTime: text().notNull(),
    durationMinutes: integer().notNull(),
    capacity: integer().notNull(),
    coachId: userRef(),
    startsOn: localDate().notNull(),
    endsOn: localDate(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.studioId),
    check("slot_weekday", sql`${t.weekday} between 1 and 7`),
    check("slot_capacity", sql`${t.capacity} > 0`),
    check("slot_duration", sql`${t.durationMinutes} > 0`),
  ],
);

/** One dated class. Generated from a slot, or created on its own. */
export const classSession = pgTable(
  "class_session",
  {
    id: id(),
    studioId: studioId(),
    calendarId: uuid()
      .notNull()
      .references(() => calendar.id, { onDelete: "cascade" }),
    templateId: uuid()
      .notNull()
      .references(() => classTemplate.id),
    slotId: uuid().references(() => slot.id, { onDelete: "set null" }),
    localDate: localDate().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    capacity: integer().notNull(),
    coachId: userRef(),
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.studioId, t.startsAt),
    uniqueIndex("class_session_slot_date").on(t.slotId, t.localDate),
    check("class_session_capacity", sql`${t.capacity} > 0`),
  ],
);

export const BOOKING_STATUSES = ["booked", "cancelled", "late_cancelled"] as const;

/**
 * A member's place in a session.
 *  - booked: holds a spot; its credit is reserved, then used when the class starts
 *  - cancelled: cancelled in time (or removed by staff); credit released
 *  - late_cancelled: cancelled inside the window; spot freed, credit still spent
 * `charged` is whether the credit stays spent; the coach can flip it (refund / charge entries).
 */
export const booking = pgTable(
  "booking",
  {
    id: id(),
    studioId: studioId(),
    sessionId: uuid()
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    memberId: memberRef(),
    packId: uuid().references(() => pack.id, { onDelete: "set null" }),
    status: text({ enum: BOOKING_STATUSES }).notNull().default("booked"),
    charged: boolean().notNull().default(true),
    noShow: boolean().notNull().default(false),
    settledAt: timestamp({ withTimezone: true }),
    createdBy: userRef(),
    createdAt: createdAt(),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledBy: userRef(),
  },
  (t) => [
    index().on(t.studioId, t.memberId),
    index().on(t.sessionId),
    uniqueIndex("booking_one_active")
      .on(t.sessionId, t.memberId)
      .where(sql`${t.status} = 'booked'`),
  ],
);

export const NOTE_CATEGORIES = ["general", "progress", "programme", "nutrition", "health"] as const;

/** Coach notes about a member (sanitized HTML). Private notes are never shown to the member. */
export const memberNote = pgTable(
  "member_note",
  {
    id: id(),
    studioId: studioId(),
    memberId: memberRef(),
    visibility: text({ enum: ["private", "shared"] }).notNull(),
    category: text({ enum: NOTE_CATEGORIES }).notNull().default("general"),
    pinned: boolean().notNull().default(false),
    body: text().notNull(),
    authorId: userRef(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.studioId, t.memberId)],
);

/** Every manual change by staff: what, who, when and why. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    studioId: studioId(),
    actorId: userRef(),
    memberId: text().references(() => user.id, { onDelete: "set null" }),
    action: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.studioId, t.createdAt), index().on(t.studioId, t.memberId)],
);

/**
 * The public studio page people see when they open the coach's invite link. Everything is optional;
 * an empty page still shows the studio name, the weekly classes and the plans.
 */
export const studioPage = pgTable("studio_page", {
  studioId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  tagline: text(),
  /** Sanitized HTML from the rich text editor. */
  about: text(),
  address: text(),
  phone: text(),
  email: text(),
  website: text(),
  instagram: text(),
  showSchedule: boolean().notNull().default(true),
  showPlans: boolean().notNull().default(true),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: userRef(),
});

/**
 * A throwaway studio built for one visitor of the public demo. Its users have addresses ending in
 * `.<token>@demo.fitmanager.invalid`; the studio and those users are deleted when the visitor logs
 * out or the sandbox expires, whichever comes first.
 */
export const demoSandbox = pgTable("demo_sandbox", {
  studioId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  token: text().notNull().unique(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});
