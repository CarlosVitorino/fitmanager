# Build plan — FitManager

Size: **First version, multi-tenant from the start.** The smallest product a real studio can use end to end, with the data model and permissions built for many studios from day one.

The feature list below is the founder's scope (2026-11-18). Where it differs from `build-brief.md`, this plan wins; the differences are recorded under Decisions.

## 1. Plan
- [x] Read the brief, the notes in `docs/notes/` and the handoff files.
- [x] Agree the first-version scope with the founder.
- [ ] Decide the payment provider for member pack purchases (see Open decisions).
- Done when: the founder has read this plan and agreed.

## 2. Foundation
- [ ] Astro (SSR, Node adapter) + React islands, TypeScript strict.
- [ ] Postgres in Docker Compose for local dev; Drizzle schema and migrations.
- [ ] Better Auth with the organization plugin: a studio is an organization; roles `owner`, `coach`, `member`. One user account can belong to several studios.
- [ ] Tenant scoping: every studio-owned table has `studio_id`; all data access goes through a repository layer that requires a studio context. Studio is addressed by path (`/s/{studio-slug}/...`).
- [ ] `packages/domain`: framework-free TypeScript module for the rules, with Vitest.
- [ ] ESLint, Prettier, GitHub Actions CI (typecheck, lint, test, build). Seed script with a demo studio.
- Done when: `npm run dev` brings up the database and the app with seeded data, and CI is green.

## 3. Core
Built in milestones, each one usable and committed before the next.

### 3a. Domain rules (most tested code in the repo)
- [ ] Credit ledger: balances are derived from entries (`granted`, `reserved`, `released`, `consumed`, `waived`, `expired`, `manual_adjustment`), never stored as an editable number.
- [ ] Pack types with entries and validity; packs expire at end of day in the studio's timezone.
- [ ] Booking reserves one credit from the pack closest to expiry that is still valid on the class date; packs without expiry are spent last.
- [ ] Cancellation inside the window releases the credit; after it, the credit stays reserved.
- [ ] Settlement on the class date: every reservation becomes `consumed`. Idempotent; runs from a scheduled job and before any balance is read.
- [ ] Coach override per booking: mark no-show, and choose whether the credit is consumed (default yes, unless cancelled inside the window). Changing the choice after settlement writes a compensating ledger entry.
- [ ] Achievements: total classes, weekly streak (consecutive weeks with at least one attended class), milestones (10, 25, 50, 100). No-shows don't count.

### 3b. Admin setup
- [ ] Studio settings: name, timezone, booking cutoff (default 2h), cancellation cutoff (default 24h).
- [ ] Pack types: single class (1 entry, 30 days), trimester (10 entries, 3 months), expiring (10 entries, 14 weeks). Price, entries and validity editable per studio.
- [ ] Calendars (e.g. Private classes, Group classes) with recurring weekly slots: day, time, duration, capacity, coach, class template. Sessions generated ahead from the recurrence; single sessions can be edited or cancelled.
- [ ] Class templates: "General class" by default; admin creates others with name, description, colour, icon.
- [ ] Admin week view of sessions (Schedule-X, verified at the start of this milestone; FullCalendar as fallback).

### 3c. Member side
- [ ] Join a studio by invite link; sign up / sign in.
- [ ] Calendar: day list of sessions with template colour/icon and spots left; book and cancel within the windows; full sessions shown as full.
- [ ] Profile: my packs (entries left, expiry), class history, achievements.
- [ ] Buy a pack: pick one of the studio's pack types, pay online, credits appear when the provider confirms payment.

### 3d. Admin members
- [ ] Members list: name, contact, active packs, entries left, next expiry.
- [ ] Member detail: profile; fitness notes (private to coaches, and shared with the member); class history; payment history.
- [ ] Manual credits: grant a pack or adjust entries without payment, with a required reason. Used for migrating existing balances and goodwill.
- [ ] Booking adjustments on a member's behalf: add (including to a full session), remove, move.
- [ ] Audit log of every manual change: what, who, when, why.

### 3e. Payments
- [ ] Checkout for pack purchases through the chosen provider.
- [ ] Webhook handler: verify signature, idempotent, grants the pack and writes the payment record.
- [ ] Payments view for the admin: our own payment records, with a link to the provider for details.
- Done when: a demo studio runs the whole loop (set up calendars and packs, member buys, books, class happens, credits settle, coach sees history and payments) on seeded and real data.

## 4. Harden
- [ ] Playwright end-to-end tests for the core loop.
- [ ] Tenant isolation tests: no query returns another studio's data; role checks on every server action.
- [ ] Error handling for what users actually hit: double booking, full session race, expired pack, duplicate webhook, timezone edges.
- [ ] Error monitoring (Sentry or similar) and structured logs.
- Done when: the founder is comfortable putting it in front of a real studio.

## 5. Ship and learn
- [ ] Deploy (Node host + managed Postgres, e.g. Fly.io/Railway + Neon), with automated backups.
- [ ] Onboard a pilot studio: import existing balances with manual credits.
- [ ] Measure: the owner stops keeping their spreadsheet, and members book and buy without emailing the studio.
- Done when: there is evidence for or against the idea.

## Decisions

- **2026-11-18 — Scope set by the founder.** First version, multi-tenant. Member side: profile, achievements, class history, buying packs, booking calendar. Admin side: members list, member detail with notes and history, calendars and slots, class templates, payments view, settings.
- **Online pack purchases are in**, overriding the brief's "Do not build". Manual credit assignment by the coach also exists, for migration and flexibility.
- **Reminders and the consumption-versus-expiry view are out** of the first version, though they're in the brief's core proof. The ledger keeps the data needed to add them later.
- **Pack validity:** single class 30 days, trimester 3 months, expiring pack 14 weeks; all editable per studio.
- **No-show:** the coach can flag a no-show and decide whether the credit is consumed. Default is consumed, unless the member cancelled inside the window.
- **Credits are reserved at booking** so members can't book more classes than they hold; the pack is chosen at booking (closest to expiry still valid on the class date).
- **Stack:** Astro + React islands, Postgres + Drizzle, Better Auth (organization plugin for studios and roles), Vitest, Playwright.

## Open decisions

1. **Payment provider for member purchases.** Creem.io is a merchant of record for digital goods. Its docs exclude human services and marketplaces reselling others' products, and in-person classes sold by many studios are both. Creem's split payments still route through one merchant store. Recommended: **Stripe Connect** (each studio connects its own Stripe account and receives the money directly). Keep Creem.io for FitManager's own subscription later. The checkout sits behind a `PaymentProvider` interface so the provider can change without touching the rules. Confirm with Creem support before ruling it out.
2. **Pilot studio**: who, and whether their current spreadsheet can seed the test data.
3. **FitManager's own subscription** (Creem.io): not needed for the pilot; decide pricing before the second studio.
