#!/usr/bin/env bash
# Nightly dump of the only state FitManager has. From root's cron, e.g.:
#   30 3 * * *  /path/to/fitmanager/deploy/backup.sh
# Keeps the newest $KEEP dumps in deploy/backups/. Copy them off the host: on this server the
# off-host copy is the backup (huntingApps/docs/18-the-shared-host.md §8).
set -euo pipefail

KEEP="${KEEP:-14}"
cd "$(dirname "$(readlink -f "$0")")"
mkdir -p backups
chmod 700 backups

out="backups/fitmanager-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose -f compose.yml --env-file .env exec -T postgres \
    pg_dump -U fitmanager -d fitmanager --format=custom > "$out.partial"
mv "$out.partial" "$out"

ls -1t backups/fitmanager-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm --
echo "wrote $out"
