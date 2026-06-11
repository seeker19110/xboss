# XBoss — production image (PostgreSQL qua DATABASE_URL)
FROM node:24-bookworm-slim

WORKDIR /app

# Cài dependencies trên Linux (không dùng node_modules của Windows).
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Copy mã nguồn + file Excel nguồn (để seed khi cần).
COPY . .

# Build production.
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Schema tự khởi tạo khi app chạy lần đầu; seed dữ liệu bằng: npm run db:seed
CMD ["npm", "start"]
