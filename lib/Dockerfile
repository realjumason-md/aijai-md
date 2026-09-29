FROM quay.io/qasimtech/mega-md:latest

WORKDIR /root/aijai-md

RUN set -eux; \
    if ! command -v curl >/dev/null 2>&1 || ! command -v zstd >/dev/null 2>&1; then \
      if command -v apt-get >/dev/null 2>&1; then \
        apt-get update; \
        apt-get install -y --no-install-recommends ca-certificates curl zstd; \
        rm -rf /var/lib/apt/lists/*; \
      elif command -v apk >/dev/null 2>&1; then \
        apk add --no-cache ca-certificates curl zstd; \
      elif command -v dnf >/dev/null 2>&1; then \
        dnf install -y ca-certificates curl zstd; \
        dnf clean all; \
      else \
        echo "Unsupported base image: cannot install curl and zstd." >&2; \
        exit 1; \
      fi; \
    fi; \
    curl --fail --silent --show-error --location https://ollama.com/install.sh | sh

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 5000

CMD ["bash", "scripts/start-railway.sh"]
