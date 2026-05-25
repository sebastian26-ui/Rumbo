# Rumbo production image.
# Single-stage so tsx (used to run server.ts directly) and Vite (used to
# build the SPA) are both available at build time. Image is ~400 MB which
# is fine for Fly.io's free allowance.
FROM node:22-slim

# better-sqlite3 + adm-zip need build tools to compile native modules
# on the slim base. python is for node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the source and build the SPA
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start"]
