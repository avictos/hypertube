FROM node:20-bookworm-slim

# argon2 compiles a native addon if no prebuilt binary matches this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3333

CMD ["npm", "run", "start"]
