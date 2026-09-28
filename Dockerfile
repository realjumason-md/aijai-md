FROM quay.io/qasimtech/mega-md:latest

WORKDIR /root/aijai-md

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org

COPY . .

ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm", "run", "start:optimized"]
