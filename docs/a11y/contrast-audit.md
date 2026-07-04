# Audit tương phản màu (WCAG AA) — toàn UI XBoss

> Mục tiêu: dọn **nợ a11y tương phản màu** (PROGRESS.md › Nợ kỹ thuật) một cách **có bằng chứng, theo từng trang**, không sửa hàng loạt mù (tránh big-bang). Tài liệu này là **backlog remediation có thứ tự** + **quy trình ground-truth**.
>
> Trạng thái: **audit xong** + **hạ tầng axe sau-auth xong** (2026-06-30). Đã sửa & verify bằng axe: `/login` + footer (PR #43), **Dashboard `/` + `AppHeader`** (desktop + mobile). Phần còn lại: xếp ưu tiên bên dưới, dọn dần từng trang qua axe E2E.

## 1. Phương pháp & vì sao "grep" chỉ là ứng viên

Lệnh `grep "text-zinc-500\|text-zinc-600"` cho **399 occurrences** và `bg-{accent}-500/600` cho **109 occurrences**. Đây là **ứng viên**, không phải lỗi đã xác nhận. Có hai tầng kiểm chứng:

1. **Tính tỉ lệ tương phản WCAG** (công thức 2.x, script `scripts/contrast-check.ts` — chạy `npx tsx scripts/contrast-check.ts`, xem §2) trên giá trị hex đã giải của thang `zinc` trong **cả 6 theme** (`dark`, `light`, `kingblue`, `darkblue`, `navy`). Đây mới biến "ứng viên" thành "khả năng lỗi cao", và quan trọng hơn: cho ra **quy tắc thay thế đúng cho mọi theme** (đổi `zinc-500`→`zinc-400` chỉ đúng nếu pass ở _tất cả_ theme — xem §2).
2. **axe-core trên trình duyệt (ground-truth cuối)** — chạy qua Playwright E2E (`e2e/*.spec.ts`) trên **bản production** (`npm run start`). Chỉ axe mới thấy màu render thật (Tailwind v4 dùng `oklch`), DOM xếp chồng, opacity, và phân biệt text thật vs icon/đồ hoạ.

**Grep over-count vì 4 lý do** (đã kiểm chứng bằng đọc code thật):

| Loại ứng viên                                 | Có phải lỗi WCAG?                               | Ví dụ thật                                                                                                           |
| --------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Body text tĩnh** trên nền tối               | ✅ Lỗi (nếu ratio < 4.5)                        | `text-[11px] text-zinc-500` (`app/page.tsx:221`)                                                                     |
| **Trạng thái hover/idle của icon/affordance** | ❌ Thường không (icon trang trí, hoặc state ẩn) | `text-zinc-700 group-hover:text-zinc-500` (`app/page.tsx:252`), `text-zinc-600 hover:text-zinc-400` (`my-tasks:156`) |
| **Code chỉ chạy ở dev**                       | ❌ Không (axe chạy bản production không render) | khối "Tài khoản demo" `text-zinc-500` (`login:94`, trong `NODE_ENV==='development'`)                                 |
| **Accent đã đủ tương phản**                   | ❌ Không                                        | `text-white bg-red-600` đạt 4.83:1 (xem §3)                                                                          |

> ⇒ **Không** chạy `sed` thay thế hàng loạt. Mỗi trang: sửa các ứng viên _body-text tĩnh_ theo quy tắc §2/§3, rồi **bật axe cho trang đó** để chốt (§5).

## 2. Bảng tương phản tính được — `text-zinc-N` trên nền `zinc-*`

Ngưỡng AA text thường = **4.5:1** (text lớn ≥18.66px bold / ≥24px = 3.0:1). Ô **FAIL** = dưới 4.5.

Nền card phổ biến nhất trong app (đếm thật): `bg-zinc-800` (160), `bg-zinc-900` (94), `bg-zinc-950` (45), `--background`.

| theme        | text       | trên `--bg` | `zinc-950` | `zinc-900` | `zinc-800` | `zinc-700` |
| ------------ | ---------- | ----------- | ---------- | ---------- | ---------- | ---------- |
| **dark**     | `zinc-600` | 2.56 ❌     | 2.57 ❌    | 2.29 ❌    | 1.93 ❌    | 1.35 ❌    |
|              | `zinc-500` | 4.10 ❌     | 4.12 ❌    | 3.67 ❌    | 3.08 ❌    | 2.16 ❌    |
|              | `zinc-400` | 7.72 ✅     | 7.76 ✅    | 6.91 ✅    | 5.81 ✅    | 4.07 ❌    |
|              | `zinc-300` | 13.4 ✅     | 13.5 ✅    | 12.0 ✅    | 10.1 ✅    | 7.07 ✅    |
| **light**    | `zinc-600` | 2.56 ❌     | 2.46 ❌    | 2.33 ❌    | 2.02 ❌    | 1.73 ❌    |
|              | `zinc-500` | 4.83 ✅     | 4.63 ✅    | 4.40 ❌    | 3.81 ❌    | 3.27 ❌    |
|              | `zinc-400` | 7.73 ✅     | 7.41 ✅    | 7.03 ✅    | 6.09 ✅    | 5.23 ✅    |
| **kingblue** | `zinc-600` | 3.19 ❌     | 2.97 ❌    | 2.46 ❌    | 1.92 ❌    | 1.44 ❌    |
|              | `zinc-500` | 4.55 ✅     | 4.23 ❌    | 3.51 ❌    | 2.74 ❌    | 2.05 ❌    |
|              | `zinc-400` | 6.93 ✅     | 6.45 ✅    | 5.35 ✅    | 4.18 ❌    | 3.12 ❌    |
|              | `zinc-300` | 9.56 ✅     | 8.90 ✅    | 7.38 ✅    | 5.76 ✅    | 4.31 ❌    |
| **darkblue** | `zinc-600` | 2.70 ❌     | 2.51 ❌    | 2.21 ❌    | 1.78 ❌    | 1.35 ❌    |
|              | `zinc-500` | 4.01 ❌     | 3.73 ❌    | 3.28 ❌    | 2.64 ❌    | 2.00 ❌    |
|              | `zinc-400` | 7.33 ✅     | 6.81 ✅    | 5.99 ✅    | 4.83 ✅    | 3.66 ❌    |
| **navy**     | `zinc-600` | 2.59 ❌     | 2.47 ❌    | 2.25 ❌    | 1.89 ❌    | 1.42 ❌    |
|              | `zinc-500` | 4.13 ❌     | 3.93 ❌    | 3.58 ❌    | 3.01 ❌    | 2.25 ❌    |
|              | `zinc-400` | 7.66 ✅     | 7.30 ✅    | 6.64 ✅    | 5.59 ✅    | 4.18 ❌    |

### Quy tắc rút ra (đúng mọi theme)

- **`text-zinc-600` (body text): luôn FAIL** mọi theme/mọi nền → **phải sửa**. Thay bằng `zinc-400` (nền `≥ zinc-900`/`--bg`/`950`) hoặc `zinc-300` (nền sáng hơn `zinc-800`/`zinc-700`).
- **`text-zinc-500` (body text): FAIL ở `dark`/`darkblue`/`navy`** trên hầu hết nền; ở `light`/`kingblue` chỉ pass mỏng trên `--bg`. Vì app **dark-first** → coi như **phải sửa** → `zinc-400`.
- **`text-zinc-400`: an toàn** trên `--bg`/`950`/`900`/`800` mọi theme; **FAIL trên `zinc-700`** (và `zinc-800` ở kingblue). Trên nền `zinc-700`/`zinc-800-sáng` → dùng `zinc-300`.
- **`text-zinc-300`: an toàn** gần như tuyệt đối (chỉ sát ngưỡng trên `zinc-700` kingblue 4.31 — vẫn pass).

> ⚠️ `dark`/`zinc-500` = **4.10** và `darkblue`/`navy`/`zinc-500-trên-bg` ≈ **4.0–4.1**: sát ngưỡng. Hex tính ở đây là xấp xỉ v3; Tailwind v4 render `oklch` có thể lệch nhẹ → **axe là trọng tài cuối** cho ca sát ngưỡng.

## 3. Nút accent chữ trắng (`text-white` trên `bg-{accent}-N`)

Các mức `-500/-600/-700` **không bị theme nào ghi đè** (chỉ `-300/-400` đảo ở light) → tương phản chữ trắng **giống nhau mọi theme**, tính 1 lần:

| accent  | `-500`  | `-600`      | `-700`  |
| ------- | ------- | ----------- | ------- |
| emerald | 2.54 ❌ | **3.77 ❌** | 5.48 ✅ |
| sky     | 2.77 ❌ | 4.10 ❌     | 5.93 ✅ |
| amber   | 2.15 ❌ | **3.19 ❌** | 5.02 ✅ |
| green   | 2.28 ❌ | 3.30 ❌     | 5.02 ✅ |
| teal    | 2.49 ❌ | 3.74 ❌     | 5.47 ✅ |
| cyan    | 2.43 ❌ | 3.68 ❌     | 5.36 ✅ |
| blue    | 3.68 ❌ | **5.17 ✅** | 6.70 ✅ |
| violet  | 4.23 ❌ | 5.70 ✅     | 7.10 ✅ |
| rose    | 3.67 ❌ | 4.70 ✅     | 6.29 ✅ |
| red     | 3.76 ❌ | **4.83 ✅** | 6.47 ✅ |
| indigo  | 4.47 ❌ | 6.29 ✅     | 7.90 ✅ |

### Quy tắc rút ra

- **`bg-{accent}-500` + `text-white`: luôn FAIL** → sửa lên `-700`.
- **`bg-{accent}-600` + `text-white`: FAIL** với `emerald, sky, amber, green, teal, cyan`; **PASS** với `blue, violet, rose, red, indigo` → chỉ sửa nhóm đầu lên `-700`.
- **Mặc định an toàn cho nút accent chữ trắng = `-700`** (mọi accent pass ≥5.0). PR #43 đã làm đúng (`emerald-600`→`emerald-700`).

### Nút accent chữ trắng — lỗi đã xác nhận (cùng element `text-white`)

Quét `text-white` cùng `className` với `bg-accent-500/600`: **16 occurrences**, theo §3 chỉ **~10 thực sự FAIL**:

| class            | ratio | đếm | trạng thái      |
| ---------------- | ----- | --- | --------------- |
| `bg-emerald-600` | 3.77  | 6   | ❌ sửa → `-700` |
| `bg-emerald-500` | 2.54  | 2   | ❌ sửa → `-700` |
| `bg-amber-600`   | 3.19  | 2   | ❌ sửa → `-700` |
| `bg-red-600`     | 4.83  | 5   | ✅ đạt — giữ    |
| `bg-blue-600`    | 5.17  | 1   | ✅ đạt — giữ    |

File chứa nút FAIL: `payments/page.tsx`, `materials/reports/page.tsx` + `_components/ReportsTab.tsx`, `my-tasks`, `materials/page.tsx`, `OnlineUsers`, `NotificationBell`, `FloorHeatmap`, `approvals`, `report`, `payments/print`, `order/OrderContent`.

> Ước tính cũ "~43 nút" (PROGRESS) đếm cả badge/border/icon. Lọc theo `text-white` cùng element → còn ~10 lỗi thật. (Vẫn cần soi nút có chữ trắng đặt ở **element con** — axe bắt được.)

## 4. Inventory ứng viên `text-zinc-500/600` theo trang (xếp ưu tiên remediation)

Đếm thật (`zinc-500` + `zinc-600`). Ưu tiên = **độ phủ người dùng × mật độ**. Global chrome (header/footer/dialog) hiển thị **mọi trang** → ưu tiên cao nhất.

| #     | Trang / Component                                                                                                                                                       | z-500 | z-600 |     Σ | Ghi chú remediation                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ P0 | `app/layout.tsx` (footer) + `/login`                                                                                                                                    |     — |     — |     — | **Xong** (PR #43), axe color-contrast đã bật làm cổng cứng                                                                                        |
| 🟡 P1 | **Global chrome**: `AppHeader` (✅ link-name + qua axe trên Dashboard), `NotificationBell` (3+1), `GlobalSearch` (4), `ThemeToggle` (1), `OnlineUsers` (3+1), `dialogs` |    11 |     3 |    14 | AppHeader xong; còn lại verify khi phủ trang chứa                                                                                                 |
| ✅ P1 | `app/page.tsx` (Dashboard — landing sau login)                                                                                                                          |    13 |     5 |    18 | **Xong** — axe desktop+mobile xanh (contrast + link-name + select-name)                                                                           |
| ✅ P2 | `app/tracking/[sheet]/page.tsx` (lưới chính)                                                                                                                            |    46 |    28 |    74 | **Xong** — axe desktop+mobile xanh, gate quét cả khi mở nhóm (phủ lưới bung: th header/nhãn cột/checkbox/select lý do trễ). Không đụng hover/icon |
| P2    | `app/payments/page.tsx`                                                                                                                                                 |    25 |    21 |    46 | + 2 nút accent chữ trắng                                                                                                                          |
| P2    | `app/my-tasks/page.tsx`                                                                                                                                                 |    15 |    18 |    33 | + 1 nút; nhiều `hover:text-zinc-400`                                                                                                              |
| P2    | `app/materials/page.tsx` (+ `_components/*`)                                                                                                                            | 26+19 |   6+5 | 32+30 | + 1 nút; 3 tab con                                                                                                                                |
| ✅ P3 | `app/admin/page.tsx`                                                                                                                                                    |    18 |     5 |    23 | **Xong** — axe desktop+mobile xanh (`e2e/authed/admin.spec.ts`); + `aria-label` cho 3 `UserSelect` (thiếu accessible name)                        |
| ✅ P3 | `app/notifications/page.tsx`                                                                                                                                            |    18 |     5 |    23 | **Xong** — axe desktop+mobile xanh (`e2e/authed/notifications.spec.ts`, gồm tab Cài đặt); + `role="switch"`/`aria-label` cho toggle `PrefRow`     |
| P3    | `gantt` (7+3), `timeline` (7+3), `lookahead` (2+3)+`LookaheadTable` (1+2)                                                                                               |    17 |    11 |    28 | Trang biểu đồ/kế hoạch                                                                                                                            |
| P3    | `approvals` (7+3), `import` (5+1), `report` (4+3), `users` (2+0)                                                                                                        |    18 |     7 |    25 |                                                                                                                                                   |
| P3    | `materials/*` phụ: `reports`, `import`, `purchase-orders`, `purchase-requests`                                                                                          |    19 |     4 |    23 |                                                                                                                                                   |
| P3    | Component lẻ: `FloorHeatmap` (5+5), `SpreadsheetGrid` (6), `SpiCards` (3+1), `ForecastCards` (2+3), `EditableText` (3), `BlockedPanel` (2+1), `SCurveChart` (1)         |    22 |    10 |    32 | Theo trang chứa nó                                                                                                                                |
| —     | `payments/print` (1), `materials/purchase-requests` (1)                                                                                                                 |     2 |     0 |     2 | Đuôi dài                                                                                                                                          |

\* `AppHeader`/`dialogs` không có `text-zinc-500/600` trực tiếp nhưng thuộc global chrome — kiểm bằng axe khi phủ trang đầu tiên.

## 5. Quy trình ground-truth: mở rộng axe E2E **từng trang**

`color-contrast` đã bật trong `e2e/login.spec.ts` → cổng cứng cho `/login` + footer. Mở rộng sang trang khác:

### Bước 0 (chặn) — hạ tầng E2E có đăng nhập ✅ **ĐÃ XONG**

Hầu hết trang **sau auth** (401 → redirect `/login`), nên axe không chạm được nếu chưa đăng nhập. Đã dựng:

- `e2e/global-setup.ts` — seed dữ liệu mẫu (`scripts/seed-sample.ts`) vào DB test 1 lần khi có `E2E_DATABASE_URL`.
- `e2e/auth.setup.ts` — đăng nhập admin (tạo qua `ensureDefaultUsers` + `XBOSS_ADMIN_PASSWORD`), lưu `storageState` (`playwright/.auth/admin.json`, không commit).
- `playwright.config.ts` — tách project **public** (login, không cần DB) / **setup** / **authed-desktop|mobile** (storageState). Nhánh sau-auth chỉ bật khi có `E2E_DATABASE_URL` (mirror quy ước `TEST_DATABASE_URL`).
- `.github/workflows/e2e.yml` — thêm service Postgres 16 + `E2E_DATABASE_URL`/`XBOSS_SECRET`/`XBOSS_ADMIN_PASSWORD`.

### Bước 1..n — mỗi trang một spec, theo thứ tự §4

Cho mỗi trang (đã làm: **Dashboard `/` + AppHeader**, `e2e/authed/dashboard.spec.ts`):

1. Viết `e2e/authed/<trang>.spec.ts`: `goto` → chờ nội dung chính → `AxeBuilder().withTags([...]).analyze()` → assert **không** vi phạm `serious/critical` (như `login.spec`).
2. Chạy axe → thu **danh sách lỗi thật** (đã lọc hết nhiễu ở §1).
3. Sửa đúng các node axe báo, theo **quy tắc §2/§3**. **Không** đụng state hover/idle/icon trừ khi axe báo.
4. Axe xanh lại (**desktop + mobile**) → commit trang đó. Diff nhỏ, review nhanh.

> **axe bắt cả lỗi a11y NGOÀI contrast** (thứ grep không thấy) — đã xác nhận trên Dashboard:
> `link-name` (nút export + nav icon-only ẩn label trên mobile → thiếu tên) và `select-name`
> (select lọc thiếu `aria-label`). ⇒ **chỉ phủ axe mới là ground-truth**, không chỉ riêng contrast.
> Lưu ý render thật Tailwind v4: `emerald-600` ra `#009966` → chữ trắng chỉ 3.65:1 (khớp dự đoán §3).

### Bước cuối

Sau khi phủ axe các trang chính → **siết Lighthouse a11y `warn`→`error`** (PROGRESS › Lớp 2).

## 6. Tóm tắt hành động

1. ~~**Bước 0** (fixture login + seed)~~ → **xong**.
2. ~~**Global chrome (AppHeader) + Dashboard `/`**~~ → **xong** (axe desktop + mobile xanh).
3. ~~tracking grid~~ → **xong** (axe desktop+mobile, gate quét cả khi **đã mở nhóm** để phủ lưới bung: th header/nhãn cột dimension/checkbox/select lý do trễ). **Tiếp:** payments → my-tasks → materials…, mỗi trang một spec authed. Gộp **~10 nút accent FAIL** (§3) khi chạm trang chứa.
4. Đuôi dài P3 dọn dần → siết Lighthouse a11y `warn`→`error`.

> Nguyên tắc xuyên suốt: **axe là ground-truth, code-audit chỉ là ứng viên; dọn theo từng trang, không big-bang.**
