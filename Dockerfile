FROM node:24-bookworm-slim

    RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      ffmpeg \
      g++ \
      libvips-dev \
      make \
      python3 \
    && rm -rf /var/lib/apt/lists/*

    WORKDIR /root/aijai-md

    COPY package.json package-lock.json ./
    RUN set -eux; \
      attempt=1; \
      until npm ci \
        --omit=dev \
        --no-audit \
        --no-fund \
        --registry=https://registry.npmjs.org \
        --fetch-retries=5 \
        --fetch-retry-factor=2 \
        --fetch-retry-mintimeout=20000 \
        --fetch-retry-maxtimeout=120000 \
        --maxsockets=3; do \
        if [ "$attempt" -ge 5 ]; then \
          echo "npm ci failed after $attempt attempts" >&2; \
          exit 1; \
        fi; \
        echo "npm ci attempt $attempt failed; retrying..." >&2; \
        rm -rf node_modules; \
        sleep "$((attempt * 15))"; \
        attempt=$((attempt + 1)); \
      done

    COPY . .

    ENV NODE_ENV=production
    ENV HOST=0.0.0.0
    EXPOSE 5000
    CMD ["bash", "scripts/start-railway.sh"]
    