# FitManager
## What this is

Small studio and independent coach owners pay for a narrow tool that handles three pack types with expiry, consumption-vs-expiry visualization, automatic reminders, and member self-service plan management — fixing documented complaints like disappearing credits, no backdating in payment reports, and members forced to email a business to manage their plan.

## What would make you stop

nothing at this point

## The smallest thing worth building first

One studio's credit lifecycle running end to end: members hold packs of the three types, book themselves into slots, credits consume automatically on the class date, packs drain closest-to-expiry first, and the owner sees a consumption-versus-expiry view with reminders firing in-app. Payment records can be manual entries at first; the proof is whether a real owner trusts the counts more than their spreadsheet.

## What this is not building

- WeChat mini-program; the web app ships first and the mini-program is a separate compliance-heavy project
- Online pack purchases and checkout; payments cover only the FitManager subscription through Creem.io for now
- Email reminders; notifications stay in-app in the first phase
- Backdating and corrections in payment reports; noted as a complaint but no decided rule exists yet
- Check-in hardware or attendance scanning; consumption happens by rule on the event date regardless
- Gamification beyond simple class-count streaks on the member profile

## Who this is for

Small studios and independent coaches who currently juggle credit packs over email and spreadsheets. The documented complaints are members' credits disappearing, no backdating in payment reports, and members being forced to email the business to manage their own plan. They pay for a narrow tool that makes pack balances, expiry and consumption visible and automatic, and gives members self-service booking and plan management. Nothing in the research says what would make them stop using it, so retention risk is unknown.

## The domain rules are the product

Credits, packs, expiry, consumption and reminders live in a framework-free TypeScript module that Astro, the calendar library and Creem.io never bend. The decided rules: a credit consumes on the event date, automatically, for every booked participant, whether they attended or no-showed. Cancellation is allowed up to 24 hours before class by default, with no credit returned after that; the window is admin-configurable. Members can book up to 2 hours before start, also configurable. A member holding several packs spends from the pack closest to expiry first. Reminders are in-app only in the first phase. This module is the most tested, most boring code in the project.

## How it is built

TypeScript end to end with Astro for the web app; payments through Creem.io. Astro renders server-side pages for profiles, admin views, history and settings. The interactive parts, the calendar, booking buttons and notification panel, are islands on otherwise static pages; React is likely because calendar libraries support it best, but Vue or Solid are acceptable if the implementer prefers. The planning document is the source of truth for the feature list, and the technical direction is a suggestion the implementer may override where a better approach serves the features.

## Open decisions

Payment records are flagged as an open question in the planning document, and the backdating complaint is not covered by a decided rule. The reminder triggers and cutoff windows beyond the defaults need concrete values. The smallest proof does not need these settled; the owner-side money view will.

## Evidence

_Nothing attached yet._
