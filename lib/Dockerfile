FROM quay.io/qasimtech/mega-md:latest

WORKDIR /root/aijai-md

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 5000

CMD ["bash", "scripts/start-railway.sh"]
