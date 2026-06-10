# XBoss — Hệ thống quản lý thi công MEP

Web app quản lý tiến độ thi công ACMV cho dự án **TT AVIO Tháp A**, thay thế bộ file Excel tracking bằng giao diện realtime, đa người dùng, mobile-friendly.

> 📄 Xem đặc tả kỹ thuật đầy đủ tại [`spec.md`](./spec.md)

---

## Yêu cầu hệ thống

- Node.js 20+
- Git
- Tài khoản [Supabase](https://supabase.com) (free tier)

---

## Cài đặt & Chạy local

```bash
# 1. Clone repo
git clone https://github.com/your-org/xboss.git
cd xboss

# 2. Cài dependencies
npm install

# 3. Tạo file môi trường
cp .env.example .env.local
# Điền NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY

# 4. Chạy migration DB
npm run db:migrate

# 5. Seed data mẫu (từ file Excel AVIO)
npm run db:seed

# 6. Khởi động dev server
npm run dev
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

---

## Cấu trúc thư mục

```
xboss/
├── app/                  # Next.js App Router (pages + API routes)
│   ├── api/              # API endpoints
│   ├── dashboard/        # Trang Dashboard
│   ├── tracking/         # Trang Tracking per sheet
│   └── import/           # Trang Import Excel
├── components/           # UI components (shadcn/ui + custom)
├── lib/                  # Utilities, DB client, helpers
├── drizzle/              # Schema + migrations
├── data/                 # Excel mapping config, seed files
├── docs/                 # ERD, wireframes
├── scripts/              # Import/seed scripts
├── spec.md               # Đặc tả kỹ thuật đầy đủ
└── .env.example
```

---

## Scripts

| Command | Mô tả |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm run db:migrate` | Chạy migrations |
| `npm run db:seed` | Seed data từ Excel AVIO |
| `npm run test` | Chạy unit tests |
| `npm run test:e2e` | Chạy E2E tests (Playwright) |

---

## Tech Stack

Next.js 14 · TypeScript · Tailwind · shadcn/ui · Drizzle ORM · Supabase · TanStack Table · Recharts · SheetJS

---

## Tài liệu

- [`spec.md`](./spec.md) — Database schema, API endpoints, User Stories, logic nghiệp vụ
- [`docs/ERD.md`](./docs/ERD.md) — Entity Relationship Diagram
- [`data/excel-mapping.json`](./data/excel-mapping.json) — Mapping cột Excel → DB fields
