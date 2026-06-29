# Hypertube

Hypertube is a self-hosted streaming platform that lets you search a public torrent
index (YTS) for movies and watch them in the browser before the download even
finishes. A movie's torrent is fetched in the background, transcoded on the fly
when needed, and streamed straight out of object storage — with subtitles,
comments, watch history, and a full user/auth system on top.

## What it does

- **Search & browse** — search YTS for any movie; results not yet in the local
  catalog are fetched, enriched with cast/crew (via OMDb), and persisted on
  first request.
- **Stream while downloading** — picking a movie kicks off a torrent download
  on the downloader service; the player starts streaming as soon as enough of
  the file is available, transcoding to a browser-friendly codec if needed.
- **Subtitles** — subtitle tracks bundled in the torrent are extracted,
  converted, and exposed as standard `<track>` elements so the browser's
  native subtitle picker works out of the box.
- **Accounts & auth** — registration with email verification, login,
  password reset, session/refresh tokens (RS256 JWTs), and social login via
  Google and 42.
- **OAuth2 API access** — a documented REST API (`/api-docs` on the running
  site) lets third-party clients exchange credentials for a bearer token and
  read/update users, movies, and comments.
- **Comments & watch history** — per-movie comment threads and a
  "continue watching" list based on real playback progress.

## Architecture

The platform is split into three independently deployed services that share
one Postgres database and one MinIO object store:

| Service | Tech | Responsibility |
|---|---|---|
| `services/auth` | Node.js / Express / PostgreSQL / Redis | Registration, login, sessions, JWT issuance, OAuth2 clients & social login |
| `services/hypertube` | Next.js (App Router) | Web UI, BFF API routes, movie catalog, comments, subtitles, the public REST API |
| `services/downloader` | Python / FastAPI / libtorrent | Torrent fetching, transcoding, subtitle extraction, MinIO uploads |

Supporting infrastructure (`docker-compose.yml` at the repo root, plus
`services/auth/docker-compose.yml`):

- **Postgres** — one instance for `hypertube`, one for `auth` (separate
  databases/credentials, same schema family).
- **MinIO** — S3-compatible object storage for posters, backgrounds,
  torrents, downloaded videos, and subtitles.
- **Redis** — session cache for the auth service.
- **Adminer** — a DB admin UI for each Postgres instance.

All containers join a single external Docker network (`hypertube-net`) so
services can reach each other by container name (`auth`, `db`, `minio`, ...).

## Prerequisites

- Docker and Docker Compose (v2, the `docker compose` plugin)
- Node.js 22+ and npm (deploy.sh runs `npm install` and the Drizzle/auth
  migrations on the host before starting the app containers)
- `curl` and `psql` client tools available on your `PATH`

## Configuration

Before deploying, create the following `.env` files from their checked-in
`.example` templates and fill in real values:

```bash
cp .env.example .env
cp services/auth/.env.example services/auth/.env
cp services/auth/.env.crypto.example services/auth/.env.crypto
cp services/hypertube/.env.example services/hypertube/.env
cp services/downloader/.env.example services/downloader/.env
```

Notes on what needs real values:

- **Postgres/MinIO credentials** — pick your own values; just keep them
  consistent across the root `.env`, `services/hypertube/.env`, and
  `services/auth/.env` (the `db`/`hypertube` Postgres credentials are shared
  by the hypertube and downloader services; the `auth` service has its own
  separate Postgres instance and credentials).
- **JWT keypair** (`services/auth/.env`) — generate an RSA keypair:
  ```bash
  openssl genpkey -algorithm RSA -out private_key.pem -pkeyopt rsa_keygen_bits:2048
  openssl rsa -pubout -in private_key.pem -out public_key.pem
  ```
  and paste the contents into `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`.
- **`CRYPTO_SECRET_KEY_V1`** (`services/auth/.env.crypto`) — any random
  32-byte base64 string.
- **AWS SES** (`services/auth/.env`) — used to send verification/reset
  emails; requires a verified sender identity in your AWS account.
- **Google / 42 OAuth** (`services/auth/.env`) — only required if you want
  social login; otherwise leave the placeholders, those buttons will simply
  fail if clicked.
- **OMDb API key** (`services/hypertube/.env`) — free key from
  https://www.omdbapi.com/apikey.aspx, used to enrich search results with
  cast/crew.
- **OpenSubtitles API key** (`services/downloader/.env`) — free key from
  https://www.opensubtitles.com/en/consumers, used as a fallback when a
  torrent has no bundled subtitles.

## Deploying

From the repo root, run:

```bash
./deploy.sh
```

This single script brings the whole stack up from nothing:

1. Creates the shared `hypertube-net` Docker network if it doesn't exist.
2. Builds and starts the auth service's Postgres + Redis, waits for them to
   be healthy, then applies the auth service's SQL schema (skipped if
   already applied) and starts the `auth` container.
3. Builds and starts the shared Postgres + MinIO, waits for them to be
   healthy, then applies the hypertube service's Drizzle migrations
   (skipped if already applied).
4. Builds and starts the `downloader` and `hypertube` containers.
5. Waits for all three services to respond on their health endpoints.

The script is idempotent — re-running it after a partial failure (e.g. a
port conflict from a leftover local dev process) skips every step that's
already done.

Once it prints `✅ Hypertube is up.`, the stack is reachable at:

| Service | URL |
|---|---|
| Website | http://localhost:3000 |
| API docs | http://localhost:3000/api-docs |
| Auth service | http://localhost:3333 |
| Downloader API | http://localhost:8000 |
| MinIO console | http://localhost:9001 |
| DB admin (app DB) | http://localhost:8080 |
| DB admin (auth DB) | http://localhost:8081 |

## Stopping

```bash
docker compose -f services/auth/docker-compose.yml down
docker compose down
```

## Re-deploying after a code change

```bash
docker compose up -d --build hypertube      # or: downloader / auth (run from services/auth)
```

`deploy.sh` is also safe to re-run any time — it rebuilds and restarts
everything without re-applying migrations that are already in place.
