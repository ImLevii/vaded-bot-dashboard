#!/bin/sh
set -eu

cd /app

npx prisma migrate deploy --config prisma/prisma.config.ts

exec pm2-runtime ecosystem.config.cjs --env production