# Deploying FitManager

FitManager runs on the shared host that serves huntingapps.io (`huntingApps/docs/18-the-shared-host.md`), at
**https://fit.huntingapps.io** for now. The host's one Caddy (`huntingApps/deploy/edge`) terminates TLS and dials
this project as `fitmanager-web:4321` on the `edge` network. Nothing here publishes a port on the host.

```
fitmanager (compose project)
├─ postgres   postgres:16, volume `postgres`, internal network only     512 MB
├─ migrate    one-shot: scripts/migrate.ts, then exits                  —
├─ web        Astro server, edge alias fitmanager-web:4321              384 MB · 1 cpu
└─ settle     sidecar: scripts/settle.ts every SETTLE_EVERY_SECONDS     256 MB · 0.5 cpu
```

Two images from one `Dockerfile`: `web` (built bundle + production dependencies) and `jobs` (sources + tsx, used by
`migrate` and `settle`). `web` and `settle` start only after `migrate` finishes successfully.

## First deploy

On the host (Docker and the `edge` network already exist there):

1. Point `fit.huntingapps.io` at the host and let DNS settle.
2. Clone the repo next to the others, then
   `cp deploy/.env.example deploy/.env` and fill it in (`openssl rand -hex 32` for each secret).
3. `docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build`
4. Add the edge block. It is already in `huntingApps/deploy/edge/Caddyfile`; pull it on the host, then recreate
   Caddy — a bind-mounted Caddyfile replaced by `git pull` is not seen by `reload` or `restart` (docs/18 §5):
   ```bash
   docker compose -f deploy/edge/compose.yml exec -T caddy grep -c fit.huntingapps.io /etc/caddy/Caddyfile
   docker compose -f deploy/edge/compose.yml up -d --force-recreate caddy
   ```
5. Check: the home page loads over HTTPS, sign-up works, "Try the demo" opens a studio, and
   `docker compose -f deploy/compose.yml logs settle` shows a `Settled …` line.

No demo data is seeded in production. The public demo builds its own throwaway studio per visitor, and the settle
sidecar removes expired ones.

## Changing the hostname

The hostname is baked into the image (`PUBLIC_HOSTNAME`, used by `security.allowedDomains` in `astro.config.mjs`,
so Astro trusts Caddy's `X-Forwarded-Proto` for that host only). When the real domain arrives, change
`PUBLIC_HOSTNAME` and `BETTER_AUTH_URL` in `deploy/.env`, the site block in the edge Caddyfile, and run
`up -d --build`. Existing sessions are tied to the old host and end.

## Deploys from CI

A push to `main` that passes CI runs `deploy/deploy.sh` on the host over SSH, with the same setup as huntingApps
(docs/18 §10): a dedicated key pinned in `authorized_keys` to
`restrict,command="/path/to/fitmanager/deploy/deploy.sh" ssh-ed25519 … fitmanager-ci`, and the repo secrets
`DEPLOY_SSH_KEY`, `DEPLOY_TARGET`, `DEPLOY_KNOWN_HOSTS`. Until they exist the job warns and skips.
By hand: `deploy/deploy.sh $(git rev-parse origin/main)`.

## Backups

Postgres is the only state. `deploy/backup.sh` from root's cron, nightly (`30 3 * * *`), keeps 14 dumps in
`deploy/backups/`. Copy them off the host: there are no provider snapshots, so the off-host copy is the backup.
Restore: `docker compose … exec -T postgres pg_restore -U fitmanager -d fitmanager --clean < dump`.
`BETTER_AUTH_SECRET` is not needed to read a dump; losing it only signs everyone out.
