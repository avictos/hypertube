# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
# npm ci is avoided here: Tailwind v4's optional native bindings (@emnapi/*)
# are resolved per-platform, and a lockfile generated on macOS doesn't carry
# the Linux-specific optional entries this container's `npm ci` would need.
RUN npm install

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time-only placeholders so `next build` doesn't fail validating env —
# real values are injected at container runtime via docker-compose.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
# Turbopack (the default `next build`) needs native bindings that aren't
# available on linux/arm64 in this base image — webpack is the documented
# fallback and is only used for this container build, not local dev.
RUN npx next build --webpack

# next.config.ts has `output: "standalone"`, which traces only the files each
# route actually needs into .next/standalone — the runtime image below never
# needs node_modules or the source tree at all.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# /api-docs reads this at request time via fs.readFileSync, which standalone's
# import-graph tracing doesn't pick up — copy it explicitly.
COPY --from=builder /app/docs ./docs

EXPOSE 3000
CMD ["node", "server.js"]
