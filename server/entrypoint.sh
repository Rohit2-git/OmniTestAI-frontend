#!/bin/sh
set -e

echo "Waiting for Postgres to accept connections..."
# docker-compose's healthcheck already gates this via depends_on, but this
# is a second, cheap safety net in case the port isn't open yet even
# though pg_isready passed. Plain TCP check only — no protocol-specific
# payload — since sending an HTTP request at a raw Postgres port just
# floods its logs with "invalid length of startup packet" for no benefit.
until nc -z db 5432 2>/dev/null; do
  sleep 1
done

echo "Applying Prisma schema to the database..."
# `db push` syncs schema.prisma straight to the DB — good for early-stage
# projects. Once you start using real migrations, switch this line to:
#   prisma migrate deploy
prisma db push --skip-generate

echo "Starting FastAPI server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000