# XBoss — production image (Node 24 có sẵn node:sqlite)
FROM node:24-bookworm-slim

WORKDIR /app

# Cài dependencies trên Linux (không dùng node_modules của Windows).
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy mã nguồn + file Excel nguồn (để seed).
COPY . .

# Build production.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV XBOSS_DB=/app/data/xboss.db

EXPOSE 3000

# Seed DB lần đầu (nếu chưa có) rồi khởi động.
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENTRYPOINT ["/docker-entrypoint.sh"]
