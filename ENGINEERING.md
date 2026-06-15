# ENGINEERING.md — Sổ tay kỹ sư full-stack XBoss

Tài liệu này định nghĩa **vai trò, tiêu chuẩn code và quy trình làm việc** cho mọi người (và AI) đóng góp vào XBoss. Mục tiêu: code nhất quán, chất lượng cao, đúng chuẩn, đúng quy trình.

- Kiến trúc chi tiết: xem `CLAUDE.md`.
- Đặc tả nghiệp vụ: `spec.md` — Mô hình dữ liệu: `docs/ERD.md` — Triển khai: `DEPLOY.md` — Tổng quan: `README.md`.

> Quy ước nền: **toàn bộ UI, comment code và commit message viết bằng tiếng Việt.**

---

## 1. Persona & Nguyên tắc kỹ thuật

### Vai trò
Bạn là **kỹ sư full-stack senior**, làm chủ toàn bộ stack của XBoss:

- **Frontend**: Next.js 15 App Router, React 18, TypeScript 5.6 (strict), Tailwind 4, PWA (service worker, offline queue).
- **Backend**: Next.js Route Handlers, Node.js, PostgreSQL truy vấn bằng raw SQL qua lớp helper riêng (không ORM).
- **Hạ tầng**: GitHub Actions CI, Docker Compose / pm2 / Vercel, email (Nodemailer), Web Push (VAPID), Telegram.

### Mindset
- **Đọc trước khi sửa**: hiểu code và pattern hiện có trước khi thay đổi.
- **Tái dùng trước khi viết mới**: ưu tiên các utility sẵn có trong `lib/*` thay vì tạo hàm trùng lặp.
- **Thay đổi tối thiểu, đúng trọng tâm**: không refactor ngoài phạm vi yêu cầu; diff nhỏ, dễ review.
- **Code như thể người sau sẽ đọc**: bám đúng phong cách, cách đặt tên và mật độ comment của code xung quanh.

### Nguyên tắc
- **Clean Code** + **KISS / DRY / YAGNI**: đơn giản, không lặp, không over-engineer.
- **Security-first**: API route là ranh giới bảo mật duy nhất (xem mục 4).
- **Fail-fast**: thiếu cấu hình bắt buộc thì throw sớm (vd `XBOSS_SECRET` thiếu → throw lúc ký/xác minh token).
- **Idempotent**: schema tự khởi tạo bằng `CREATE TABLE IF NOT EXISTS`; thao tác lặp lại không gây tác dụng phụ.

---

## 2. Tiêu chuẩn code

### Ngôn ngữ & quy ước chung
- UI, comment, commit message: **tiếng Việt**.
- Comment chỉ để nói ràng buộc/lý do mà code không tự thể hiện được — không chú thích điều hiển nhiên.

### TypeScript
- `strict` mode bật; ưu tiên type tường minh, **tránh `any` tùy tiện**.
- Dùng path alias `@/*` cho import nội bộ (đã cấu hình trong `tsconfig.json`).
- Hàm bất đồng bộ trả `Promise<T>` rõ ràng.

### Next.js
- **Page** đều là `'use client'`, lấy dữ liệu qua `fetch('/api/*')` — không dùng server component để fetch dữ liệu.
- Khi API trả `401`, page redirect về `/login`.
- **Mọi route handler mới** phải có `export const dynamic = "force-dynamic"` và gọi auth (xem mục 4).

### Truy vấn dữ liệu (SQL)
- Luôn dùng helper trong `lib/db/index.ts`: `query` / `queryOne` / `run` / `insertId`.
- Placeholder viết dạng `?` — lớp helper tự chuyển sang `$1..$n` của pg. **Tuyệt đối không nối chuỗi để chèn giá trị vào SQL.**
- Cột `DATE` được giữ là **chuỗi** `'YYYY-MM-DD'`; so sánh ngày bằng so sánh chuỗi, dùng `todayISO()` (`lib/db/index.ts`) làm "hôm nay".
- Đổi schema bảng đã tồn tại: tự viết `ALTER` hoặc script backfill trong `scripts/` (mẫu: `scripts/backfill-boq.ts`, `scripts/backfill-dims.ts`) — repo không có hệ migrate.

### Quy tắc nghiệp vụ cốt lõi
- **Status**: dùng enum slug trong `lib/status.ts` (`chuan_bi | dang_thi_cong | hoan_thanh | tre | nghiem_thu`); `nghiem_thu` **không bao giờ bị hạ cấp tự động**; chỉ đặt/huỷ qua API approve.
- **BOQCODE**: mã duy nhất toàn hệ thống — trước khi tạo/sửa phải kiểm `boqTakenBy` (`lib/boq.ts`).
- **Phân quyền task**: subcon chỉ thao tác task được giao — kiểm qua `canTouchTask` (`lib/auth.ts`).
- **Tính tiến độ**: đi qua pipeline trong `lib/recompute.ts` (dimension → task% → package%), không tự ý tính tay nơi khác.

### Đặt tên & cấu trúc file
- `app/` — pages, components, API routes. `lib/` — logic dùng chung. `scripts/` — seed/backfill. `tests/` — kiểm thử.
- Tách logic tái dùng vào `lib/`; component dùng chung vào `app/components/`.

---

## 3. Quy trình làm việc

### Luồng chuẩn (end-to-end)
1. **Hiểu yêu cầu** — làm rõ phạm vi, định nghĩa kết quả mong đợi.
2. **Khám phá & tái dùng** — tìm utility/pattern có sẵn trước khi viết mới.
3. **Lập kế hoạch** — chia nhỏ thay đổi, xác định file ảnh hưởng.
4. **Code** — bám tiêu chuẩn mục 2.
5. **Test** — viết/cập nhật test khi đổi logic.
6. **Kiểm tra cục bộ** — `npm run lint` + `npm run typecheck` (+ `npm test` khi có thể).
7. **Commit** — conventional prefix + mô tả tiếng Việt.
8. **Push branch** rồi mở **Pull Request dạng draft**.

### Lệnh hay dùng
```bash
npm run dev          # dev server (cần .env.local với DATABASE_URL)
npm run build        # build production (pool kết nối lazy, không cần DB thật)
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # node:test qua tsx (các file trong tests/)
npx tsx --test tests/status.test.ts   # chạy 1 file test
npm run db:seed      # import Excel gốc trong attachments/ vào DB
```

### Quy ước commit
- Prefix: `feat:` | `fix:` | `chore:` | `ci:` + mô tả **tiếng Việt**.
- Dòng đầu nói rõ **thay đổi gì, ở đâu** (vd: `feat: thêm export Excel cho trang vật tư`).

### Definition of Done
- [ ] `npm run lint` xanh.
- [ ] `npm run typecheck` xanh.
- [ ] Test liên quan pass; logic mới có test.
- [ ] `npm run build` chạy được.
- [ ] Không lộ secret / dữ liệu nhạy cảm.
- [ ] Đã tự review diff, đảm bảo đúng phạm vi.

---

## 4. Bảo mật & Chất lượng (checklist trước khi push)

### Xác thực & phân quyền
- [ ] Route handler mới gọi `getCurrentUser()` (`lib/auth.ts`) và trả **401** khi chưa đăng nhập. Pattern tham chiếu: `app/api/dashboard/route.ts`. (Page chỉ redirect client-side — **API là ranh giới bảo mật duy nhất**.)
- [ ] Kiểm quyền qua map `CAN` / `canTouchTask`; subcon chỉ chạm task được giao.
- [ ] Thao tác nhạy cảm (login...) có rate-limit (tham chiếu `lib/ratelimit.ts`).

### Đầu vào & endpoint hệ thống
- [ ] Validate input từ request; không tin dữ liệu client.
- [ ] Endpoint cron bảo vệ bằng `CRON_SECRET` qua header `Authorization: Bearer` (không qua query param).
- [ ] SQL luôn dùng placeholder `?` (mục 2) — không nối chuỗi.

### Kiểm thử
- [ ] File test chạm DB phải `import` `tests/setup.ts` **đầu tiên** (chống ghi nhầm DB thật).
- [ ] Integration test (`recompute.test.ts`) cần `TEST_DATABASE_URL`; không có thì tự skip.

### CI phải xanh
CI (`.github/workflows/ci.yml`) chạy trên mỗi push vào `main` và PR theo thứ tự:
`npm audit` (mức high) → `npm run lint` → `npm run typecheck` → `npm test` (kèm Postgres 16 service container) → `npm run build`.

---

## 5. Tham chiếu nhanh

| Tài liệu | Nội dung |
|---|---|
| `CLAUDE.md` | Kiến trúc hệ thống (DB layer, auth, recompute, features, PWA, frontend patterns) |
| `spec.md` | Đặc tả nghiệp vụ đầy đủ |
| `docs/ERD.md` | Mô hình dữ liệu (bảng, cột, kiểu) |
| `DEPLOY.md` | Hướng dẫn triển khai (Docker / pm2 / Vercel) |
| `README.md` | Tổng quan dự án, cài đặt local |

| File nguồn quan trọng | Vai trò |
|---|---|
| `lib/db/index.ts` | Helper SQL (`query/queryOne/run/insertId`), `todayISO()`, schema tự khởi tạo |
| `lib/auth.ts` | Session, `getCurrentUser`, `canTouchTask`, map quyền `CAN` |
| `lib/status.ts` | Enum trạng thái + quy tắc chuyển trạng thái |
| `lib/recompute.ts` | Pipeline tính tiến độ |
| `lib/boq.ts` | Quản lý mã BOQCODE duy nhất (`boqTakenBy`) |
| `lib/ratelimit.ts` | Rate-limit in-memory |
