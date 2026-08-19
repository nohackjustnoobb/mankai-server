# Mankai Server

A self-hosted manga server with an admin dashboard that implements the [Mankai HTTP Plugin API](https://github.com/nohackjustnoobb/mankai/blob/master/docs/httpplugin/api.md) for the [Mankai](https://github.com/nohackjustnoobb/mankai) manga reader.

Point the Mankai app at `http://<host>:3000/api`, sign in, and your library and reading progress sync across devices.

## Features

- Full Mankai API support: server info, JWT auth, manga browsing, search, suggestions, and the in-app [editor API](https://github.com/nohackjustnoobb/mankai/blob/master/docs/httpplugin/editor-api.md).
- Web admin dashboard for managing manga, chapter groups, chapters, page images, covers, and users.
- Semantic search and autocomplete powered by local sentence embeddings (`Xenova/bge-m3`) indexed with pgvector.
- Reading progress and saved-library sync with incremental endpoints.
- PostgreSQL + pgvector in production, or embedded PGlite for zero-config setups.
- JWT Bearer tokens for the app, session cookies for the dashboard, and auto-generated API keys per user.

## Quick start (Docker Compose)

`docker-compose.yml` runs the server alongside a `pgvector/pgvector:pg18` Postgres instance.

1. Edit `docker-compose.yml` and change the placeholder secrets under the `app` service's `environment` block:

```yaml
environment:
  SESSION_SECRET: changeme123-make-sure-it-is-at-least-32-characters
  JWT_SECRET: changeme123-make-sure-it-is-at-least-32-characters
  SERVER_ID: mankai-server
  ADMIN_EMAIL: admin@mankai.local
  ADMIN_PASSWORD: changeme123
  # BASE_API_URL: https://api.example.app
  # EMBEDDING_QUANTIZED: "0"
  # FORCE_SECURE_COOKIE: "true"
  # LOG_LEVEL: debug
```

2. Build and start:

```bash
docker compose up -d --build
```

On startup the container runs migrations, seeds the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (idempotent), and serves the app on port 3000.

3. Open `http://localhost:3000` for the dashboard, or add a server in the Mankai app with base URL `http://<host>:3000/api`.

Data is persisted on the host under `./data`.

```bash
docker compose logs -f app
docker compose restart app
docker compose down
```
