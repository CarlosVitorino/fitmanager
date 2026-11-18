# FitManager

Class packs, bookings and credits for small studios and independent coaches. Members see their own packs and book
themselves; coaches assign plans and see every member's history. Multi-tenant: one deployment serves many studios.

- `build-brief.md` — the original brief
- `docs/build-plan.md` — the phases, decisions and open questions (this wins where it differs from the brief)
- `docs/notes/` — the research and notes behind it

## Run it locally

Needs Node 22+ and either Docker or a Postgres 16 you point `DATABASE_URL` at.

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts Postgres with Docker Compose if nothing answers at `DATABASE_URL`, applies migrations, seeds a demo
studio on an empty database and starts the app at http://localhost:4321.

Demo logins (password `demo-password`): `owner@demo.test`, `coach@demo.test`, `member@demo.test`. The studio is at
`/s/demo`.

## Scripts

| Script                                         | What it does                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                                  | Database, migrations, seed and dev server in one go                               |
| `npm test`                                     | Unit and integration tests (integration tests use `TEST_DATABASE_URL`, see below) |
| `npm run typecheck` / `lint` / `format:check`  | What CI runs                                                                      |
| `npm run db:generate`                          | Create a migration after changing `src/db/schema`                                 |
| `npm run db:migrate` / `db:seed` / `db:studio` | Apply migrations, seed, browse the database                                       |

Integration tests need a separate database, by default
`postgres://fitmanager:fitmanager@localhost:5432/fitmanager_test`. With Docker Compose running:

```bash
docker compose exec db createdb -U fitmanager fitmanager_test
```

## How the code is organised

| Path                         | What lives there                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/domain/`                | The rules: credits, packs, booking windows, settlement. Plain TypeScript, no framework imports (lint-enforced) |
| `src/server/`                | Application layer: permissions (`authz.ts`), studio context, use cases that load data and apply the rules      |
| `src/db/`                    | Drizzle schema and client. Migrations are in `drizzle/`                                                        |
| `src/lib/auth.ts`            | Better Auth: email and password login, studios as organizations                                                |
| `src/pages/`, `src/layouts/` | Astro pages, server-rendered. Interactive parts will be React islands                                          |

**Studios and roles.** A studio is a Better Auth organization; a user can belong to several, with role `owner`,
`coach` or `member` in each. Studio pages live under `/s/{slug}/`. The middleware resolves the studio and the user's
role into `Astro.locals.studio`, and answers 404 when the user isn't in that studio. Every studio-owned table has a
`studio_id`, and every query that touches one takes the `StudioContext` and filters by it. What each role may do is
decided in one place, `src/server/authz.ts`; server code checks a capability, never a role name.
