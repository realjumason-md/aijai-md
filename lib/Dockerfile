FROM quay.io/qasimtech/mega-md:latest

WORKDIR /root/aijai-md

RUN if ! command -v curl >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends ca-certificates curl && \
      rm -rf /var/lib/apt/lists/*; \
    fi && \
    curl --fail --silent --show-error --location https://ollama.com/install.sh | sh

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 5000

CMD ["bash", "scripts/start-railway.sh"]
