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

# VITE_* values are inlined into the browser bundle at build time. They
# must be available BEFORE `npm run build`, so we accept them as build
# args (Fly runtime secrets don't reach the Docker build context).
#
# Deploy with:
#   fly deploy --no-cache \
#     --build-arg VITE_RECAPTCHA_SITE_KEY=<reCAPTCHA-Enterprise-site-key> \
#     --build-arg VITE_SENTRY_DSN=<sentry-react-dsn>
#
# These keys are designed to ship in the public bundle (reCAPTCHA site
# keys and Sentry DSNs are PUBLIC identifiers — security comes from the
# domain allowlist on each, not from hiding the key).
ARG VITE_RECAPTCHA_SITE_KEY=""
ARG VITE_SENTRY_DSN=""
ENV VITE_RECAPTCHA_SITE_KEY=$VITE_RECAPTCHA_SITE_KEY
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

# Copy the rest of the source and build the SPA
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "run", "start"]
