/**
 * Builds a studio full of realistic data: plans, class types, a weekly schedule with six weeks of
 * history, members in different situations, notes, a fitness profile, measurements and records.
 * Used by the local dev seed and by the public demo (one fresh copy per visitor).
 * Text is written in the current request's language.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { addDays, localDateOf, startOfWeek } from "../domain/dates";
import { t } from "../i18n";
import { auth } from "../lib/auth";
import * as bookings from "./bookings";
import * as catalog from "./catalog";
import * as members from "./members";
import { adjustCredits, assignPlan } from "./packs";
import * as profiles from "./profiles";
import * as schedule from "./schedule";
import { settleStudio } from "./settlement";
import { resolveStudioContext } from "./studio-context";
import { saveStudioPage } from "./studio-page";
import { createStudio } from "./studios";

export type SampleKey = "owner" | "coach" | "member" | "ana" | "bruno" | "chloe" | "daniel" | "eva" | "filipe";

export interface SampleOptions {
  slug: string;
  name: string;
  timezone: string;
  password: string;
  /** Login address for each sample person. */
  email: (key: SampleKey) => string;
}

export async function buildSampleStudio(opts: SampleOptions) {
  const { slug, timezone: tz } = opts;
  const signUp = async (name: string, key: SampleKey) =>
    (await auth.api.signUpEmail({ body: { name, email: opts.email(key), password: opts.password } })).user;

  const owner = await signUp("Olivia Owner", "owner");
  const coach = await signUp("Carl Coach", "coach");
  const studio = await createStudio(owner.id, { name: opts.name, slug, timezone: tz });
  await auth.api.addMember({ body: { organizationId: studio.id, userId: coach.id, role: "coach" } });
  const ctx = (await resolveStudioContext(db, slug, owner.id))!;

  // Prices for the default plans.
  const types = await catalog.listPackTypes(ctx);
  const prices = [1500, 11000, 9500];
  for (const [i, p] of types.entries())
    await db.update(schema.packType).set({ priceCents: prices[i] }).where(eq(schema.packType.id, p.id));
  const [single, trimester, tenPack] = types as [(typeof types)[0], (typeof types)[0], (typeof types)[0]];

  // Class types.
  const general = (await catalog.listTemplates(ctx))[0]!;
  const tpl = (key: "upper" | "legs" | "hiit" | "mobility", color: string, icon: string) =>
    catalog.saveTemplate(ctx, { name: t(`demo.${key}`), description: t(`demo.${key}Desc`), color, icon });
  const upper = await tpl("upper", "#2563eb", "💪");
  const legs = await tpl("legs", "#dc2626", "🦵");
  const hiit = await tpl("hiit", "#ea580c", "🔥");
  const mobility = await tpl("mobility", "#0d9488", "🧘");

  // Weekly slots, starting 6 weeks ago so there's history.
  const [group, priv] = await catalog.listCalendars(ctx);
  const today = localDateOf(new Date(), tz);
  const from = addDays(startOfWeek(today), -42);
  const slots: [number, string, number, typeof general, string, number, string | null][] = [
    [1, "07:00", 45, hiit, group!.id, 12, coach.id],
    [1, "18:30", 60, upper, group!.id, 10, owner.id],
    [2, "18:30", 60, legs, group!.id, 10, coach.id],
    [3, "07:00", 45, hiit, group!.id, 12, coach.id],
    [3, "18:30", 60, general, group!.id, 12, owner.id],
    [4, "18:30", 60, upper, group!.id, 10, coach.id],
    [5, "07:00", 45, hiit, group!.id, 12, owner.id],
    [6, "10:00", 60, mobility, group!.id, 14, owner.id],
    [2, "12:00", 60, general, priv!.id, 1, owner.id],
    [4, "12:00", 60, general, priv!.id, 1, owner.id],
  ];
  for (const [weekday, startTime, durationMinutes, template, calendarId, capacity, coachId] of slots) {
    await schedule.saveSlot(ctx, {
      weekday,
      startTime,
      durationMinutes,
      templateId: template.id,
      calendarId,
      capacity,
      coachId,
      startsOn: from,
      endsOn: null,
    });
  }
  await schedule.ensureSessions(ctx, from, 42 + 56);

  // Members in different situations.
  type Plan = { type: typeof single; startedDaysAgo: number; paid?: number };
  const people: { name: string; key: SampleKey; phone: string; plans: Plan[]; perWeek: number; upcoming: number }[] = [
    {
      name: "Mia Member",
      key: "member",
      phone: "+351 912 345 678",
      plans: [
        { type: tenPack, startedDaysAgo: 40, paid: 9500 },
        { type: single, startedDaysAgo: 3, paid: 1500 },
      ],
      perWeek: 1,
      upcoming: 2,
    },
    {
      name: "Ana Silva",
      key: "ana",
      phone: "+351 913 000 111",
      plans: [{ type: trimester, startedDaysAgo: 30, paid: 11000 }],
      perWeek: 1,
      upcoming: 1,
    },
    {
      name: "Bruno Costa",
      key: "bruno",
      phone: "+351 914 222 333",
      plans: [{ type: tenPack, startedDaysAgo: 88, paid: 9500 }],
      perWeek: 1,
      upcoming: 0,
    },
    {
      name: "Chloé Martin",
      key: "chloe",
      phone: "",
      plans: [{ type: tenPack, startedDaysAgo: 35, paid: 9500 }],
      perWeek: 1,
      upcoming: 2,
    },
    {
      name: "Daniel Ferreira",
      key: "daniel",
      phone: "+351 915 444 555",
      plans: [{ type: single, startedDaysAgo: 2, paid: 1500 }],
      perWeek: 0,
      upcoming: 1,
    },
    { name: "Eva Santos", key: "eva", phone: "+351 916 666 777", plans: [], perWeek: 0, upcoming: 0 },
    {
      name: "Filipe Rocha",
      key: "filipe",
      phone: "+351 917 888 999",
      plans: [{ type: trimester, startedDaysAgo: 5 }],
      perWeek: 0,
      upcoming: 3,
    },
  ];

  const settings = await members.getSettings(ctx);
  const past = (await schedule.listSessions(ctx, from, addDays(today, -1))).filter((s) => s.capacity > 1);
  const future = (await schedule.listSessions(ctx, today, addDays(today, 14))).filter(
    (s) => s.capacity > 1 && s.startsAt.getTime() > Date.now() + 3 * 3_600_000,
  );

  const ids = {} as Record<SampleKey, string>;
  ids.owner = owner.id;
  ids.coach = coach.id;
  for (const [pi, p] of people.entries()) {
    const u = await signUp(p.name, p.key);
    ids[p.key] = u.id;
    await members.joinStudio(u.id, slug, settings.joinCode);
    const mctx = (await resolveStudioContext(db, slug, u.id))!;
    if (p.phone) await members.updateProfile(ctx, u.id, { name: p.name, phone: p.phone });
    for (const plan of p.plans) {
      const startsOn = addDays(today, -plan.startedDaysAgo);
      await assignPlan(ctx, {
        memberId: u.id,
        packTypeId: plan.type.id,
        startsOn,
        ...(plan.paid
          ? { payment: { amountCents: plan.paid, method: pi % 2 ? "transfer" : "cash", paidOn: startsOn } }
          : {}),
      });
    }
    // Past classes: pick classes each week from when their first plan started.
    const firstStart = p.plans.length ? addDays(today, -Math.max(...p.plans.map((x) => x.startedDaysAgo))) : today;
    const eligible = past.filter((s) => s.localDate >= firstStart);
    const byWeek = new Map<string, typeof eligible>();
    for (const s of eligible)
      byWeek.set(startOfWeek(s.localDate), [...(byWeek.get(startOfWeek(s.localDate)) ?? []), s]);
    let k = pi;
    for (const list of byWeek.values()) {
      for (let i = 0; i < p.perWeek && i < list.length; i++) {
        const s = list[(k++ * 3) % list.length]!;
        try {
          await bookings.addMemberToSession(ctx, s.id, u.id);
        } catch {
          // out of credits or already in: fine for sample data
        }
      }
    }
    for (let i = 0; i < p.upcoming && future.length; i++) {
      const s = future[(pi * 2 + i * 3) % future.length]!;
      try {
        await bookings.bookSelf(mctx, s.id);
      } catch {
        /* skip */
      }
    }
  }

  // A no-show, a waived no-show and coach notes for Mia.
  const mia = ids.member;
  await settleStudio(studio.id, tz);
  const miaPast = (await members.classHistory(ctx, mia)).filter((h) => h.settled);
  if (miaPast[2]) await bookings.setNoShow(ctx, miaPast[2].bookingId, true);
  if (miaPast[5]) {
    await bookings.setNoShow(ctx, miaPast[5].bookingId, true);
    await bookings.setBookingCharged(ctx, miaPast[5].bookingId, false);
  }
  await members.addNote(ctx, mia, {
    visibility: "shared",
    category: "programme",
    pinned: true,
    body: t("demo.noteProgramme"),
  });
  await members.addNote(ctx, mia, { visibility: "shared", category: "progress", body: t("demo.noteProgress") });
  await members.addNote(ctx, mia, { visibility: "private", category: "health", body: t("demo.noteHealth") });

  // Fitness profile, measurements and records for Mia.
  await profiles.savePersonal(ctx, mia, {
    name: "Mia Member",
    phone: "+351 912 345 678",
    dateOfBirth: "1994-03-12",
    gender: t("demo.gender"),
    addressLine: "Rua das Flores 12",
    city: "Porto",
    postalCode: "4050-262",
    country: "Portugal",
    emergencyName: "João Member",
    emergencyPhone: "+351 913 111 222",
  });
  await profiles.saveFitness(ctx, mia, {
    goals: ["Get stronger", "Move better", t("demo.customGoal")],
    goalNotes: t("demo.goalNotes"),
    targetDate: `${Number(today.slice(0, 4)) + 1}-06-30`,
    experience: "some",
    trainingNotes: t("demo.trainingNotes"),
    clearance: "cleared",
    injuries: t("demo.injuries"),
    medical: null,
  });
  const checkins: [number, number, number, number, number][] = [
    [-70, 68.4, 29.5, 78, 99],
    [-42, 67.6, 28.6, 76.5, 98.5],
    [-14, 67.1, 27.9, 75, 98],
  ];
  for (const [d, w, bf, waist, hips] of checkins)
    await profiles.addMeasurement(ctx, mia, {
      measuredOn: addDays(today, d),
      weightKg: w,
      bodyFatPct: bf,
      waistCm: waist,
      hipsCm: hips,
      chestCm: null,
      armCm: null,
      thighCm: null,
      restingHr: null,
      note: null,
    });
  const records: [string, number, "kg" | "reps" | "seconds" | "minutes", number][] = [
    ["Back squat", 40, "kg", -70],
    ["Back squat", 47.5, "kg", -35],
    ["Back squat", 52.5, "kg", -7],
    ["Deadlift", 60, "kg", -63],
    ["Deadlift", 72.5, "kg", -14],
    ["Push-ups", 6, "reps", -60],
    ["Push-ups", 14, "reps", -10],
    ["5 km run", 31.5, "minutes", -56],
    ["5 km run", 29, "minutes", -21],
  ];
  for (const [exercise, value, unit, d] of records)
    await profiles.addBenchmark(ctx, mia, { exercise, value, unit, recordedOn: addDays(today, d), note: null });
  const [brunoPack] = await db.select().from(schema.pack).where(eq(schema.pack.memberId, ids.bruno));
  if (brunoPack) await adjustCredits(ctx, { packId: brunoPack.id, delta: 1, reason: t("demo.goodwill") });

  // The public page new members see from the invite link.
  await saveStudioPage(ctx, {
    tagline: t("demo.tagline"),
    about: t("demo.about"),
    address: "Rua de Santa Catarina 100, 4000-447 Porto",
    phone: "+351 220 000 000",
    email: null,
    website: null,
    instagram: null,
    showSchedule: true,
    showPlans: true,
  });

  // Sample history shouldn't look like a pile of manual coach edits.
  await db
    .delete(schema.auditLog)
    .where(and(eq(schema.auditLog.studioId, studio.id), eq(schema.auditLog.action, "booking.added")));
  await settleStudio(studio.id, tz);

  return { studioId: studio.id, slug, ids };
}
