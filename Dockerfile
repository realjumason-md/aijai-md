FROM node:24-bookworm-slim

    RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      ffmpeg \
      g++ \
      libvips-dev \
      make \
      python3 \
    && rm -rf /var/lib/apt/lists/*

    ARG YT_DLP_VERSION=2026.08.19
    RUN set -eux; \
      base_url="https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}"; \
      curl --fail --location --silent --show-error --retry 3 \
        "${base_url}/yt-dlp" -o /tmp/yt-dlp; \
      curl --fail --location --silent --show-error --retry 3 \
        "${base_url}/SHA2-256SUMS" -o /tmp/SHA2-256SUMS; \
      cd /tmp; \
      grep -E '([* ]|  )yt-dlp$' SHA2-256SUMS | sha256sum --check --strict -; \
      install -m 0755 /tmp/yt-dlp /usr/local/bin/yt-dlp; \
      /usr/local/bin/yt-dlp --version; \
      rm -f /tmp/yt-dlp /tmp/SHA2-256SUMS

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
    