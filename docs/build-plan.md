# Build plan — FitManager

Size: **First version, multi-tenant from the start.** The smallest product a real studio can use end to end, with the data model and permissions built for many studios from day one.

The feature list below is the founder's scope (2026-11-18). Where it differs from `build-brief.md`, this plan wins; the differences are recorded under Decisions.

## 1. Plan
- [x] Read the brief, the notes in `docs/notes/` and the handoff files.
- [x] Agree the first-version scope with the founder.
- Done when: the founder has read this plan and agreed.

## 2. Foundation ✅
- [x] Astro (SSR, Node adapter) + React islands, TypeScript strict.
- [x] Postgres in Docker Compose for local dev; Drizzle schema and migrations.
- [x] Better Auth with the organization plugin: a studio is an organization; roles `owner`, `coach`, `member`. One user account can belong to several studios.
- [x] Tenant scoping: every studio-owned table has `studio_id`; all data access goes through a repository layer that requires a studio context. Studio is addressed by path (`/s/{studio-slug}/...`).
- [x] `src/domain/`: framework-free TypeScript module for the rules, with Vitest. ESLint blocks framework, database and server imports there.
- [x] ESLint, Prettier, GitHub Actions CI (typecheck, lint, test, build). Seed script with a demo studio.
- Done when: `npm run dev` brings up the database and the app with seeded data, and CI is green.

## 3. Core ✅
Built in milestones, each one usable and committed before the next.

### 3a. Domain rules (most tested code in the repo)
- [x] Credit ledger: balances are derived from entries (`grant`, `adjust`, `reserve`, `release`, `consume`, `refund`, `charge`, `expire`), never stored as an editable number.
- [x] Pack types with entries and validity; packs expire at end of day in the studio's timezone.
- [x] Booking reserves one credit from the pack closest to expiry that is still valid on the class date; packs without expiry are spent last.
- [x] Cancellation inside the window releases the credit; after it, the credit stays reserved.
- [x] Settlement on the class date: every reservation becomes `consumed`. Idempotent; runs from a scheduled job and before any balance is read.
- [x] Coach override per booking: mark no-show, and choose whether the credit is consumed (default yes, unless cancelled inside the window). Changing the choice after settlement writes a compensating ledger entry.
- [x] Achievements: total classes, weekly streak (consecutive weeks with at least one attended class), milestones (1, 10, 25, 50, 100…). No-shows don't count.

### 3b. Admin setup
- [x] Studio settings: name, timezone, booking cutoff (default 2h), cancellation cutoff (default 24h).
- [x] Pack types: single class (1 entry, 30 days), trimester (10 entries, 3 months), expiring (10 entries, 14 weeks). Price, entries and validity editable per studio.
- [x] Calendars (e.g. Private classes, Group classes) with recurring weekly slots: day, time, duration, capacity, coach, class template. Sessions generated ahead from the recurrence; single sessions can be edited or cancelled.
- [x] Class templates: "General class" by default; admin creates others with name, description, colour, icon.
- [x] Calendar: Schedule-X week/day/month/list views for coaches and members, in the studio's timezone (see Decisions).

### 3c. Member side
- [x] Join a studio by invite link; sign up / sign in.
- [x] Calendar: day list of sessions with template colour/icon and spots left; book and cancel within the windows; full sessions shown as full.
- [x] Profile: my packs (entries left, expiry), class history, achievements.
- [x] See the studio's pack types and prices, so members know what to ask the coach for.

### 3d. Admin members
- [x] Members list: name, contact, active packs, entries left, next expiry.
- [x] Member detail: profile; fitness notes (private to coaches, and shared with the member); class history; payment history (the payments recorded when plans were assigned).
- [x] Assign a plan: the coach adds pack type X to member A. Optional payment details on the same form (amount, method, date paid), which feed the payment history.
- [x] Adjust credits: add or remove entries on an existing pack, with a required reason. Used for migrating existing balances, corrections and goodwill.
- [x] Booking adjustments on a member's behalf: add (including to a full session), remove, move.
- [x] Audit log of every manual change: what, who, when, why.

- [x] Studio Today dashboard: today's classes, plans expiring in 14 days, members running low.

- Done when: a demo studio runs the whole loop (set up calendars and packs, coach assigns a plan, member books, class happens, credits settle, coach sees history and payments) on seeded and real data.

## 4. Harden
- [ ] Playwright end-to-end tests for the core loop.
- [ ] Tenant isolation tests: no query returns another studio's data; role checks on every server action. (Started: integration tests cover studio context, bookings, notes and plans across studios.)
- [ ] Error handling for what users actually hit: double booking, full session race, expired pack, timezone edges. (Races for the last spot and for one credit paying two classes are tested.)
- [ ] Error monitoring (Sentry or similar) and structured logs.
- Done when: the founder is comfortable putting it in front of a real studio.

## 5. Ship and learn
- [ ] Deploy (Node host + managed Postgres, e.g. Fly.io/Railway + Neon), with automated backups.
- [ ] Onboard a pilot studio: import existing balances with manual credits.
- [ ] Measure: the owner stops keeping their spreadsheet, and members book and buy without emailing the studio.
- Done when: there is evidence for or against the idea.

## Decisions

- **2026-11-18 — Scope set by the founder.** First version, multi-tenant. Member side: profile, achievements, class history, buying packs, booking calendar. Admin side: members list, member detail with notes and history, calendars and slots, class templates, payments view, settings.
- **Payments are deferred.** The coach assigns plans to members by hand and can record the payment (amount, method, date) when doing so. Online pack purchases come later; the founder wants them, overriding the brief's "Do not build", but not in this version.
- **Reminders and the consumption-versus-expiry view are out** of the first version, though they're in the brief's core proof. The ledger keeps the data needed to add them later.
- **Pack validity:** single class 30 days, trimester 3 months, expiring pack 14 weeks; all editable per studio.
- **No-show:** the coach can flag a no-show and decide whether the credit is consumed. Default is consumed, unless the member cancelled inside the window.
- **Credits are reserved at booking** so members can't book more classes than they hold; the pack is chosen at booking (closest to expiry still valid on the class date).
- **Stack:** Astro + React islands, Postgres + Drizzle, Better Auth (organization plugin for studios and roles), Vitest, Playwright.

- **Domain rules live in `src/domain/`, not a separate `packages/domain`.** A lint rule keeps it framework-free, which gives the same independence without the overhead of a workspace setup.
- **Better Auth tables are written by hand** in `src/db/schema/auth.ts`, based on the installed package's own table definitions, because the schema generator CLI couldn't run here. Re-check them when upgrading better-auth.
- **Studio settings are kept in their own table** (`studio_settings`), not on Better Auth's organization table, so auth upgrades never touch them. Timezone is chosen when the studio is created.
- **Logins are server-rendered forms**, so login and signup work without JavaScript. Astro's origin check blocks cross-site form posts.
- **Not a member and no such studio both return 404**, so studio addresses can't be probed.
- **Calendar: Schedule-X** (MIT, v4) for both the coach calendar and member booking, replacing the first hand-built lists at the founder's request. Verified: licence, React bindings, timezone support (it shows classes in the studio's timezone whatever the device's), click handling. Phones open on its list view; its week arrows are re-enabled on small screens with CSS. The list view can't take a custom component, so class status ("3 spots left", "✓ Booked") is put in the title there.
- **Members book from a dialog** on the calendar. The dialog posts the page's normal server form, so every booking rule still runs on the server.
- **Date picker: react-day-picker** (MIT) in a small `DateField` island that submits a plain `YYYY-MM-DD`, replacing the browser's native pickers, which look different in every browser. Times are two 24-hour selects (`TimeField`).
- **Date formatting: date-fns + @date-fns/tz**, all in `src/lib/format.ts`. The founder asked for Moment.js; we chose date-fns instead because Moment is in maintenance mode and date-fns already came with the date picker. Instants are always shown in the studio's timezone; calendar days are formatted as-is.
- **Late cancellation frees the spot** for someone else; the credit is still used. Cancelling a whole class returns every credit.
- **Coaches can book members past the cutoff, into full classes, and into past classes** (to fix the record). A credit is still needed; there's no "free" booking, a coach adds a credit with a reason instead.
- **Moving a booking** returns the old credit and reserves a new one, so the closest-to-expiry rule still applies to the new date.
- **Recurring slots generate classes 8 weeks ahead.** Editing a slot regenerates its future classes that nobody booked; booked ones keep their time until a coach changes them.
- **Settlement runs before studio pages** (at most every 30 seconds per studio) and from `npm run jobs:settle`, which should run hourly in production.
- **Roles:** owners manage settings, plans and staff; coaches manage classes, members, credits and notes; members book and see their own data. Defined in `src/server/authz.ts`.
- **New studios start with** a General class, Group and Private calendars, and the three plans (prices left empty).
- **Currency** is a studio setting (default EUR), used for plan prices and payments.

- **Member home is about training, not plans** (founder, 2026-11-18): next class, progress chart, milestones, coach feedback and recent classes come first; the current plan sits in the sidebar as one compact card, since most members hold one plan at a time. Personal details and the shared fitness profile live on "My profile".
- **Coach notes replaced by profiles + rich notes.** Personal profile (all optional: contact, date of birth, address, emergency contact), editable by member and staff. Fitness profile kept by coaches, modelled on common trainer intake forms: goals, training background, health & injuries with a clearance status, body-measurement check-ins and personal records. Each of the five sections has its own "visible to member" switch; health is coaches-only by default. Notes are rich text (TipTap) with a category, pin and shared/private choice.
- **Rich text is sanitized on the server** (sanitize-html allowlist) before saving and rendered as HTML; typed markup stays text.
- **Health data is sensitive** (special-category data under GDPR). It's only visible to the studio's coaches unless shared; a privacy notice and consent wording are needed before launch (Phase 4/5).
- **Look and feel:** Inter typeface, Lucide icons, consistent page headers, stat tiles, avatars and empty states across pages.

## Open decisions

1. **Pilot studio**: who, and whether their current spreadsheet can seed the test data.
2. **FitManager's own subscription** (Creem.io): not needed for the pilot; decide pricing before the second studio.
3. **Payment provider for online pack purchases (later).** Creem.io is a merchant of record for digital goods; its docs exclude human services and marketplaces reselling others' products, so it likely can't sell studio class packs. Stripe Connect (each studio connects its own account) is the likely choice. Keep payment code behind a `PaymentProvider` interface when this is built.
