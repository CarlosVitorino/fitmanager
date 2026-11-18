# Domain rules

Credits, packs, expiry, booking windows, settlement and achievements live here as plain
TypeScript functions. This folder must not import Astro, React, Drizzle, Better Auth or
anything under `src/db` or `src/server` — ESLint enforces it. Code here takes plain data
in and returns plain data (or ledger entries to write) out, so it can be tested without a
database and would survive a change of framework.

| File              | Rules                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| `dates.ts`        | Studio-local dates, DST-safe conversion between wall-clock time and UTC              |
| `packs.ts`        | Pack validity and expiry, closest-to-expiry allocation                               |
| `ledger.ts`       | Credit entry kinds and their fixed signs; balances are sums of entries               |
| `booking.ts`      | Booking and cancellation windows, capacity, settlement timing, coach charge override |
| `achievements.ts` | Class counts, weekly streaks, milestones                                             |
| `schedule.ts`     | Recurring weekly slots to dated classes                                              |
