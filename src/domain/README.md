# Domain rules

Credits, packs, expiry, booking windows, settlement and achievements live here as plain
TypeScript functions. This folder must not import Astro, React, Drizzle, Better Auth or
anything under `src/db` or `src/server` — ESLint enforces it. Code here takes plain data
in and returns plain data (or ledger entries to write) out, so it can be tested without a
database and would survive a change of framework.

Built in Phase 3a.
