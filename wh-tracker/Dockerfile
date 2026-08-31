FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js fec-taxii-pipeline.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data /app/logs && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
