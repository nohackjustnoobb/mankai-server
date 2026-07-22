#!/bin/bash
set -e

echo "Running database migrations..."
bun run db:migrate

# Seed the admin user if credentials are provided (idempotent)
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Seeding admin user ($ADMIN_EMAIL)..."
  bun run create-admin
else
  echo "Skipping admin seeding: ADMIN_EMAIL / ADMIN_PASSWORD not set."
fi

echo "Starting server..."
exec bun run start
