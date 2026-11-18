import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { msg, t } from "../i18n";
import { isLocalDate, localDateOf, type LocalDate } from "../domain/dates";
import { checkAdjustment, makeEntry } from "../domain/ledger";
import { computeExpiry, isPackExpired, type Validity } from "../domain/packs";
import { booking, creditEntry, member, pack, packType, payment, PAYMENT_METHODS } from "../db/schema";
import { audit } from "./audit";
import { requireCapability, type StudioContext } from "./studio-context";
import { badRequest, notFound } from "./errors";
import { db, type Executor } from "./tx";

export function validityOf(row: {
  validityUnit: "days" | "weeks" | "months" | null;
  validityAmount: number | null;
}): Validity {
  return row.validityUnit && row.validityAmount ? { unit: row.validityUnit, amount: row.validityAmount } : null;
}

export interface PackSummary {
  id: string;
  name: string;
  entries: number;
  startsOn: LocalDate;
  expiresOn: LocalDate | null;
  createdAt: Date;
  note: string | null;
  /** Free to book with. */
  available: number;
  /** Held by upcoming bookings. */
  reserved: number;
  /** Spent on classes (including late cancellations and no-shows that were charged). */
  used: number;
  /** Lost to expiry. */
  expired: number;
  /** Granted plus adjustments. */
  total: number;
  status: "active" | "used_up" | "expired" | "upcoming";
}

/**
 * Every pack a member holds, with balances derived from the ledger.
 * Call settleStudio first so started classes and expired packs are accounted for.
 */
export async function memberPacks(ctx: StudioContext, memberId: string, ex: Executor = db): Promise<PackSummary[]> {
  const rows = await ex
    .select({
      id: pack.id,
      name: pack.name,
      entries: pack.entries,
      startsOn: pack.startsOn,
      expiresOn: pack.expiresOn,
      createdAt: pack.createdAt,
      note: pack.note,
      available: sql<number>`coalesce(sum(${creditEntry.delta}), 0)::int`,
      total: sql<number>`coalesce(sum(${creditEntry.delta}) filter (where ${creditEntry.kind} in ('grant','adjust')), 0)::int`,
      expired: sql<number>`coalesce(-sum(${creditEntry.delta}) filter (where ${creditEntry.kind} = 'expire'), 0)::int`,
    })
    .from(pack)
    .leftJoin(creditEntry, eq(creditEntry.packId, pack.id))
    .where(and(eq(pack.studioId, ctx.studioId), eq(pack.memberId, memberId)))
    .groupBy(pack.id)
    .orderBy(sql`${pack.expiresOn} asc nulls last`, asc(pack.createdAt));

  if (!rows.length) return [];
  const reservedRows = await ex
    .select({ packId: booking.packId, n: sql<number>`count(*)::int` })
    .from(booking)
    .where(
      and(
        eq(booking.studioId, ctx.studioId),
        inArray(
          booking.packId,
          rows.map((r) => r.id),
        ),
        eq(booking.status, "booked"),
        isNull(booking.settledAt),
      ),
    )
    .groupBy(booking.packId);
  const reserved = new Map(reservedRows.map((r) => [r.packId, r.n]));
  const today = localDateOf(new Date(), ctx.timezone);

  return rows.map((r) => {
    const res = reserved.get(r.id) ?? 0;
    const used = r.total - r.available - res - r.expired;
    const status: PackSummary["status"] = isPackExpired(r, today)
      ? "expired"
      : r.startsOn > today
        ? "upcoming"
        : r.available === 0 && res === 0
          ? "used_up"
          : "active";
    return { ...r, reserved: res, used, status };
  });
}

export const assignPlanInput = z.object({
  memberId: z.string().min(1),
  packTypeId: z.uuid(),
  startsOn: z.string().refine(isLocalDate, msg("errors.validStartDate")),
  note: z.string().trim().max(500).optional(),
  payment: z
    .object({
      amountCents: z.number().int().min(0),
      method: z.enum(PAYMENT_METHODS),
      paidOn: z.string().refine(isLocalDate, msg("errors.validPaymentDate")),
      note: z.string().trim().max(500).optional(),
    })
    .optional(),
});
export type AssignPlanInput = z.infer<typeof assignPlanInput>;

async function assertMember(ex: Executor, ctx: StudioContext, memberId: string) {
  const [m] = await ex
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, ctx.studioId), eq(member.userId, memberId)));
  if (!m) throw notFound(t("errors.memberNotFound"));
}

/** Coach gives a member a plan, optionally recording what they paid. */
export async function assignPlan(ctx: StudioContext, input: AssignPlanInput) {
  requireCapability(ctx, "credits:manage");
  return db.transaction(async (tx) => {
    await assertMember(tx, ctx, input.memberId);
    const [type] = await tx
      .select()
      .from(packType)
      .where(and(eq(packType.id, input.packTypeId), eq(packType.studioId, ctx.studioId), isNull(packType.archivedAt)));
    if (!type) throw notFound(t("errors.planNotFound"));

    const expiresOn = computeExpiry(input.startsOn, validityOf(type));
    const [created] = await tx
      .insert(pack)
      .values({
        studioId: ctx.studioId,
        memberId: input.memberId,
        packTypeId: type.id,
        name: type.name,
        entries: type.entries,
        startsOn: input.startsOn,
        expiresOn,
        note: input.note || null,
        createdBy: ctx.userId,
      })
      .returning();
    await tx.insert(creditEntry).values({
      studioId: ctx.studioId,
      packId: created!.id,
      memberId: input.memberId,
      actorId: ctx.userId,
      ...makeEntry("grant", type.entries),
    });
    if (input.payment) {
      await tx.insert(payment).values({
        studioId: ctx.studioId,
        memberId: input.memberId,
        packId: created!.id,
        amountCents: input.payment.amountCents,
        currency: ctx.currency,
        method: input.payment.method,
        paidOn: input.payment.paidOn,
        note: input.payment.note || null,
        recordedBy: ctx.userId,
      });
    }
    await audit(tx, ctx, "plan.assigned", input.memberId, {
      packId: created!.id,
      plan: type.name,
      entries: type.entries,
      startsOn: input.startsOn,
      expiresOn,
      paymentCents: input.payment?.amountCents ?? null,
    });
    return created!;
  });
}

export const adjustCreditsInput = z.object({
  packId: z.uuid(),
  delta: z.number().int(),
  reason: z.string().trim().min(3, msg("errors.sayWhy")).max(500),
});

/** Coach adds or removes free credits on a pack, with a reason. */
export async function adjustCredits(ctx: StudioContext, input: z.infer<typeof adjustCreditsInput>) {
  requireCapability(ctx, "credits:manage");
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: pack.id, memberId: pack.memberId, name: pack.name })
      .from(pack)
      .where(and(eq(pack.id, input.packId), eq(pack.studioId, ctx.studioId)))
      .for("update");
    if (!p) throw notFound(t("errors.packNotFound"));
    const [{ available } = { available: 0 }] = await tx
      .select({ available: sql<number>`coalesce(sum(${creditEntry.delta}), 0)::int` })
      .from(creditEntry)
      .where(eq(creditEntry.packId, p.id));
    const check = checkAdjustment(available, input.delta);
    if (!check.ok)
      throw badRequest(
        check.reason === "not_whole" ? t("errors.adjustWhole") : t("errors.adjustTooMany", { count: check.available }),
      );
    await tx.insert(creditEntry).values({
      studioId: ctx.studioId,
      packId: p.id,
      memberId: p.memberId,
      actorId: ctx.userId,
      reason: input.reason,
      ...makeEntry("adjust", input.delta),
    });
    await audit(tx, ctx, "credits.adjusted", p.memberId, {
      packId: p.id,
      pack: p.name,
      delta: input.delta,
      reason: input.reason,
      before: available,
      after: available + input.delta,
    });
  });
}

export interface LedgerLine {
  id: string;
  kind: string;
  delta: number;
  reason: string | null;
  createdAt: Date;
  packName: string;
}

/** The raw credit history for a member, newest first. */
export async function memberLedger(ctx: StudioContext, memberId: string, limit = 100): Promise<LedgerLine[]> {
  return db
    .select({
      id: creditEntry.id,
      kind: creditEntry.kind,
      delta: creditEntry.delta,
      reason: creditEntry.reason,
      createdAt: creditEntry.createdAt,
      packName: pack.name,
    })
    .from(creditEntry)
    .innerJoin(pack, eq(pack.id, creditEntry.packId))
    .where(and(eq(creditEntry.studioId, ctx.studioId), eq(creditEntry.memberId, memberId)))
    .orderBy(desc(creditEntry.createdAt))
    .limit(limit);
}
