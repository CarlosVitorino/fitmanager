/**
 * Scheduled job: settle started classes and expire packs in every studio, and generate upcoming
 * classes from recurring slots. Run it at least daily (hourly is better), e.g. from cron:
 *   0 * * * *  cd /app && npm run jobs:settle
 * The app also settles a studio before showing balances, so a missed run never shows wrong counts.
 */
import "dotenv/config";

const { db } = await import("../src/db/client");
const { studioSettings } = await import("../src/db/schema");
const { settleStudio } = await import("../src/server/settlement");
const { ensureSessions } = await import("../src/server/schedule");
const { removeExpiredDemos } = await import("../src/server/demo");

const removed = await removeExpiredDemos();
if (removed) console.log(`Removed ${removed} expired demo studios.`);

const studios = await db
  .select({ studioId: studioSettings.studioId, timezone: studioSettings.timezone })
  .from(studioSettings);
let consumed = 0;
let expired = 0;
for (const s of studios) {
  await ensureSessions(s);
  const r = await settleStudio(s.studioId, s.timezone);
  consumed += r.consumed;
  expired += r.expiredCredits;
}
console.log(`Settled ${studios.length} studios: ${consumed} credits used, ${expired} credits expired.`);
process.exit(0);
