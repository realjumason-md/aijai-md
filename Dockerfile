FROM quay.io/qasimtech/mega-md:latest

    WORKDIR /root/aijai-md

    COPY package.json package-lock.json ./
    RUN npm ci --omit=dev --no-audit --no-fund --maxsockets=3

    COPY . .

    ENV NODE_ENV=production
    ENV HOST=0.0.0.0
    EXPOSE 5000

    CMD ["npm", "run", "start:optimized"]
    