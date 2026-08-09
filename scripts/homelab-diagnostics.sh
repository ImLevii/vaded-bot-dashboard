#!/usr/bin/env bash
set -euo pipefail

host="${1:-server-do-luk}"
deploy_dir="${2:-/home/luk-server/vaded-gaming}"

ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=10
    -o StrictHostKeyChecking=accept-new
)

redact() {
    sed -E \
        -e 's/(DISCORD_TOKEN|CLIENT_SECRET|WEBAPP_SESSION_SECRET|POSTGRES_PASSWORD|DEPLOY_WEBHOOK_SECRET)=([^[:space:]]+)/\1=[REDACTED]/g' \
        -e 's/(Bearer )[A-Za-z0-9._-]+/\1[REDACTED]/g'
}

ssh "${ssh_opts[@]}" "$host" "set -euo pipefail
echo \"HOST:\$(hostname)\"
echo \"DATE:\$(date -Is)\"
echo
echo \"== docker ps (Vaded Gaming) ==\"
docker ps --filter 'name=vaded-' --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo
echo \"== compose ps (Vaded Gaming stack) ==\"
docker compose --project-directory '$deploy_dir' -p vaded ps || true
echo
echo \"== vaded-backend logs (tail 120) ==\"
docker logs --tail 120 vaded-backend 2>&1 || true
echo
echo \"== local auth health ==\"
curl -sS -m 8 -i http://127.0.0.1:3000/api/health/auth-config || true
echo
echo \"== public auth health ==\"
curl -sS -m 12 -i https://api.vadedgaming.com/api/health/auth-config || true
echo
echo \"== public oauth redirect ==\"
curl -sS -m 12 -i https://api.vadedgaming.com/api/auth/discord || true
" | redact
