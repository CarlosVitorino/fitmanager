/**
 * Demo data for local development. Runs automatically from `npm run dev` when the database is empty.
 * Logins (password for all: demo-password):
 *   owner@demo.test  — studio owner (Olivia)
 *   coach@demo.test  — coach (Carl)
 *   member@demo.test — member (Mia), with plans, history and upcoming bookings
 * Plus a handful of other members in different situations (low credits, expiring, no plan).
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";

export const DEMO_PASSWORD = "demo-password";

export async function seedIfEmpty(): Promise<void> {
  const { db } = await import("../src/db/client");
  const [row] = await db.execute<{ count: number }>(sql`select count(*)::int as count from "user"`);
  if ((row?.count ?? 0) > 0) return;
  await seed();
}

export async function seed(): Promise<void> {
  const { db } = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  const { auth } = await import("../src/lib/auth");
  const { createStudio } = await import("../src/server/studios");
  const { resolveStudioContext } = await import("../src/server/studio-context");
  const catalog = await import("../src/server/catalog");
  const schedule = await import("../src/server/schedule");
  const { assignPlan, adjustCredits } = await import("../src/server/packs");
  const bookings = await import("../src/server/bookings");
  const members = await import("../src/server/members");
  const { settleStudio } = await import("../src/server/settlement");
  const { addDays, localDateOf, startOfWeek } = await import("../src/domain/dates");

  const signUp = async (name: string, email: string) =>
    (await auth.api.signUpEmail({ body: { name, email, password: DEMO_PASSWORD } })).user;

  const tz = "Europe/Lisbon";
  const owner = await signUp("Olivia Owner", "owner@demo.test");
  const coach = await signUp("Carl Coach", "coach@demo.test");
  const studio = await createStudio(owner.id, { name: "Demo Studio", slug: "demo", timezone: tz });
  await auth.api.addMember({ body: { organizationId: studio.id, userId: coach.id, role: "coach" } });
  const ctx = (await resolveStudioContext(db, "demo", owner.id))!;

  // Prices for the default plans.
  const types = await catalog.listPackTypes(ctx);
  const prices = [1500, 11000, 9500];
  for (const [i, t] of types.entries())
    await db.update(schema.packType).set({ priceCents: prices[i] }).where(eq(schema.packType.id, t.id));
  const [single, trimester, tenPack] = types as [(typeof types)[0], (typeof types)[0], (typeof types)[0]];

  // Class types.
  const general = (await catalog.listTemplates(ctx))[0]!;
  const upper = await catalog.saveTemplate(ctx, {
    name: "Upper body",
    description: "Push, pull and core.",
    color: "#2563eb",
    icon: "💪",
  });
  const legs = await catalog.saveTemplate(ctx, {
    name: "Legs day",
    description: "Squats, lunges, deadlifts.",
    color: "#dc2626",
    icon: "🦵",
  });
  const hiit = await catalog.saveTemplate(ctx, {
    name: "HIIT",
    description: "Short, hard intervals.",
    color: "#ea580c",
    icon: "🔥",
  });
  const mobility = await catalog.saveTemplate(ctx, {
    name: "Mobility",
    description: "Stretching and joint work.",
    color: "#0d9488",
    icon: "🧘",
  });

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
  const people: { name: string; email: string; phone: string; plans: Plan[]; perWeek: number; upcoming: number }[] = [
    {
      name: "Mia Member",
      email: "member@demo.test",
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
      email: "ana@demo.test",
      phone: "+351 913 000 111",
      plans: [{ type: trimester, startedDaysAgo: 30, paid: 11000 }],
      perWeek: 1,
      upcoming: 1,
    },
    {
      name: "Bruno Costa",
      email: "bruno@demo.test",
      phone: "+351 914 222 333",
      plans: [{ type: tenPack, startedDaysAgo: 88, paid: 9500 }],
      perWeek: 1,
      upcoming: 0,
    },
    {
      name: "Chloé Martin",
      email: "chloe@demo.test",
      phone: "",
      plans: [{ type: tenPack, startedDaysAgo: 35, paid: 9500 }],
      perWeek: 1,
      upcoming: 2,
    },
    {
      name: "Daniel Ferreira",
      email: "daniel@demo.test",
      phone: "+351 915 444 555",
      plans: [{ type: single, startedDaysAgo: 2, paid: 1500 }],
      perWeek: 0,
      upcoming: 1,
    },
    { name: "Eva Santos", email: "eva@demo.test", phone: "+351 916 666 777", plans: [], perWeek: 0, upcoming: 0 },
    {
      name: "Filipe Rocha",
      email: "filipe@demo.test",
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

  for (const [pi, p] of people.entries()) {
    const u = await signUp(p.name, p.email);
    await members.joinStudio(u.id, "demo", settings.joinCode);
    const mctx = (await resolveStudioContext(db, "demo", u.id))!;
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
          // out of credits or already in: fine for demo data
        }
      }
    }
    for (let i = 0; i < p.upcoming; i++) {
      const s = future[(pi * 2 + i * 3) % future.length]!;
      try {
        await bookings.bookSelf(mctx, s.id);
      } catch {
        /* skip */
      }
    }
  }

  // A no-show, a waived no-show and a coach note for Mia.
  const mia = (await db.select().from(schema.user).where(eq(schema.user.email, "member@demo.test")))[0]!;
  await settleStudio(studio.id, tz);
  const miaPast = (await members.classHistory(ctx, mia.id)).filter((h) => h.settled);
  if (miaPast[2]) await bookings.setNoShow(ctx, miaPast[2].bookingId, true);
  if (miaPast[5]) {
    await bookings.setNoShow(ctx, miaPast[5].bookingId, true);
    await bookings.setBookingCharged(ctx, miaPast[5].bookingId, false);
  }
  await members.addNote(ctx, mia.id, {
    visibility: "shared",
    body: "Great progress on your squat depth. Next goal: 3×8 at 50 kg.",
  });
  await members.addNote(ctx, mia.id, {
    visibility: "private",
    body: "Mentioned a sore left knee in October. Keep an eye on lunges.",
  });
  const bruno = (await db.select().from(schema.user).where(eq(schema.user.email, "bruno@demo.test")))[0]!;
  const brunoPack = (await db.select().from(schema.pack).where(eq(schema.pack.memberId, bruno.id)))[0]!;
  await adjustCredits(ctx, {
    packId: brunoPack.id,
    delta: 1,
    reason: "Goodwill: class cancelled at short notice in October",
  });

  // Seeded history shouldn't look like a pile of manual coach edits.
  await db
    .delete(schema.auditLog)
    .where(and(eq(schema.auditLog.studioId, studio.id), eq(schema.auditLog.action, "booking.added")));
  await settleStudio(studio.id, tz);

  console.log(
    `Seeded Demo Studio at /s/demo. Log in as owner@demo.test, coach@demo.test or member@demo.test (password: ${DEMO_PASSWORD}).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  process.exit(0);
}
