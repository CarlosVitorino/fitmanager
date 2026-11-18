import { and, eq, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { localDateOf } from "../domain/dates";
import { makeEntry } from "../domain/ledger";
import { booking, classSession, creditEntry, pack } from "../db/schema";
import { db } from "./tx";

export interface SettlementResult {
  consumed: number;
  expiredPacks: number;
  expiredCredits: number;
}

/**
 * Brings a studio's credits up to date at `now`. Safe to run any number of times, concurrently:
 *  1. bookings for classes that have started are settled: their reserved credit becomes used
 *  2. packs past their expiry day are closed: unused credits get an explicit `expire` entry
 * Runs from the scheduled job and before any page that shows balances.
 */
export async function settleStudio(studioId: string, timeZone: string, now = new Date()): Promise<SettlementResult> {
  const today = localDateOf(now, timeZone);

  return db.transaction(async (tx) => {
    const settled = await tx
      .update(booking)
      .set({ settledAt: now })
      .where(
        and(
          eq(booking.studioId, studioId),
          isNull(booking.settledAt),
          inArray(booking.status, ["booked", "late_cancelled"]),
          inArray(
            booking.sessionId,
            tx
              .select({ id: classSession.id })
              .from(classSession)
              .where(
                and(
                  eq(classSession.studioId, studioId),
                  lte(classSession.startsAt, now),
                  isNull(classSession.cancelledAt),
                ),
              ),
          ),
        ),
      )
      .returning({ id: booking.id, packId: booking.packId, memberId: booking.memberId });

    const consumeRows = settled
      .filter((b) => b.packId)
      .map((b) => ({ studioId, packId: b.packId!, memberId: b.memberId, bookingId: b.id, ...makeEntry("consume") }));
    if (consumeRows.length) await tx.insert(creditEntry).values(consumeRows);

    const expired = await tx
      .update(pack)
      .set({ expiredAt: now })
      .where(and(eq(pack.studioId, studioId), isNull(pack.expiredAt), lt(pack.expiresOn, today)))
      .returning({ id: pack.id, memberId: pack.memberId });

    let expiredCredits = 0;
    if (expired.length) {
      const balances = await tx
        .select({ packId: creditEntry.packId, available: sql<number>`coalesce(sum(${creditEntry.delta}), 0)::int` })
        .from(creditEntry)
        .where(
          inArray(
            creditEntry.packId,
            expired.map((p) => p.id),
          ),
        )
        .groupBy(creditEntry.packId);
      const byPack = new Map(balances.map((b) => [b.packId, b.available]));
      const rows = expired
        .filter((p) => (byPack.get(p.id) ?? 0) > 0)
        .map((p) => {
          const n = byPack.get(p.id)!;
          expiredCredits += n;
          return { studioId, packId: p.id, memberId: p.memberId, ...makeEntry("expire", n) };
        });
      if (rows.length) await tx.insert(creditEntry).values(rows);
    }

    return { consumed: settled.length, expiredPacks: expired.length, expiredCredits };
  });
}
