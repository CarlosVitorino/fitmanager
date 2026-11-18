# FitManager
Small studio and independent coach owners pay for a narrow tool that handles three pack types with expiry, consumption-vs-expiry visualization, automatic reminders, and member self-service plan management — fixing documented complaints like disappearing credits, no backdating in payment reports, and members forced to email a business to manage their plan.
What would stop this: nothing at this point
The smallest thing worth building first: One studio's credit lifecycle running end to end: members hold packs of the three types, book themselves into slots, credits consume automatically on the class date, packs drain closest-to-expiry first, and the owner sees a consumption-versus-expiry view with reminders firing in-app. Payment records can be manual entries at first; the proof is whether a real owner trusts the counts more than their spreadsheet.
Do not build:
- WeChat mini-program; the web app ships first and the mini-program is a separate compliance-heavy project
- Online pack purchases and checkout; payments cover only the FitManager subscription through Creem.io for now
- Email reminders; notifications stay in-app in the first phase
- Backdating and corrections in payment reports; noted as a complaint but no decided rule exists yet
- Check-in hardware or attendance scanning; consumption happens by rule on the event date regardless
- Gamification beyond simple class-count streaks on the member profile


## How to work on this

These are defaults to start from, not rules. If you have a better way to reach the goal, use it and say why. Ask the person you are working for whenever the brief leaves something that changes the outcome.

**Size of the build: Full product.** A production-ready product: sound architecture, tests, security, monitoring and documentation, built in reviewed stages.

**Before writing code**
- Read `build-brief.md` end to end.
- Never build anything listed under "Do not build".
- Work in the phases of `docs/build-plan.md`, and check in with the person at the end of each one.

**Throughout**
- Keep commits small and the app runnable at every step.
- If the brief looks wrong or contradicts itself, say so instead of working around it.
- When the stop condition in the brief is met, tell the person before building anything more.