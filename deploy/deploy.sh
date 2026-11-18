#!/usr/bin/env bash
# Run on the server by CI over SSH, as the forced command of a key that can do nothing else
# (huntingApps/docs/18-the-shared-host.md §10). Deploys exactly the commit CI tested, and only one that
# is already on the deploy branch, so a leaked key can at worst redeploy what is there.
set -euo pipefail

# Everything lives in a function: bash reads a script as it runs, and the checkout below can rewrite this file.
main() {
    local branch=main
    local sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
    if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
        echo "expected a 40-character commit sha, got '${sha}'" >&2
        exit 2
    fi

    cd "$(dirname "$(readlink -f "$0")")/.."
    # A dropped SSH session must not leave Compose half-way through recreating containers.
    trap '' HUP
    exec 9>/tmp/fitmanager-deploy.lock
    flock 9

    git fetch --quiet origin "$branch"
    if ! git merge-base --is-ancestor "$sha" "origin/$branch"; then
        echo "$sha is not on origin/$branch; refusing to deploy it" >&2
        exit 3
    fi
    git checkout --quiet "$branch"
    git merge --quiet --ff-only "$sha"

    docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
    docker image prune -f >/dev/null
    echo "deployed $(git rev-parse --short HEAD)"
}

main "$@"
