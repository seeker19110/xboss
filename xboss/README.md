# XBoss — Hệ thống quản lý thi công MEP

Web app quản lý tiến độ thi công ACMV cho dự án **TT AVIO Tháp A**, thay thế bộ file Excel tracking bằng giao diện realtime, đa người dùng, mobile-friendly.

> 📄 Xem đặc tả kỹ thuật đầy đủ tại [`spec.md`](./spec.md)

---

## Yêu cầu hệ thống

- Node.js 20+
- Git
- Tài khoản [Supabase](https://supabase.com) (free tier) — hoặc bất kỳ Postgres nào

---

## Cài đặt & Chạy local

```bash
# 1. Clone repo
git clone https://github.com/seeker19110/xboss.git
cd xboss

# 2. Cài dependencies
npm install

# 3. Tạo file môi trường
cp .env.example .env.local
# Điền DATABASE_URL (Postgres) + NEXT_PUBLIC_SUPABASE_* nếu dùng Supabase

# 4. Tạo bảng trong DB (generate đã có sẵn, chỉ cần migrate)
npm run db:migrate

# 5. Seed data từ file Excel AVIO (đặt trong attachments/)
npm run db:seed

# 6. Khởi động dev server
npm run dev
```

Mở trình duyệt: [http://localhost:3000](http://localhost:3000)

---

## Cấu trúc thư mục

```
xboss/
├── app/
│   ├── page.tsx              # Dashboard (trang chủ)
│   ├── import/page.tsx       # Trang upload & import Excel
│   └── api/
│       ├── dashboard/        # GET danh sách trễ + KPI
│       └── import/excel/     # POST import file .xlsx
├── lib/
│   ├── db/                   # Drizzle client + schema
│   ├── import.ts             # Logic parse Excel (dùng chung API + seed)
│   └── status.ts             # Chuẩn hóa trạng thái + % tiến độ
├── drizzle/migrations/       # SQL migrations (đã generate)
├── attachments/              # File Excel nguồn
├── scripts/seed.ts           # Seed từ Excel
└── spec.md                   # Đặc tả kỹ thuật
```

---

## Scripts

| Command | Mô tả |
|---|---|
| `npm run dev` | Chạy dev server |
| `npm run build` | Build production |
| `npm run db:generate` | Generate migration từ schema |
| `npm run db:migrate` | Áp dụng migrations |
| `npm run db:seed` | Seed data từ Excel AVIO |
| `npm run db:studio` | Mở Drizzle Studio |

---

## Mô hình dữ liệu

`projects → towers → sheet_types → work_packages → tasks → progress_dimensions`

Trạng thái (`status`) chuẩn hóa dạng slug: `chuan_bi`, `dang_thi_cong`, `hoan_thanh`, `nghiem_thu`, `tre`. Chuỗi tiếng Việt từ Excel ("Chuẩn bị", "Đang thi công"...) được map tự động trong `lib/status.ts`.

Một task bị coi là **trễ** khi: `end_date < hôm nay` **và** `progress < 100%` **và** chưa `hoan_thanh`/`nghiem_thu`.

---

## Tech Stack

Next.js 14 · TypeScript · Tailwind v4 · Drizzle ORM · Postgres/Supabase · TanStack Table · Recharts · SheetJS
