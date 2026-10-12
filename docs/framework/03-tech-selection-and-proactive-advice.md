# KHUNG 3 — Chọn công nghệ & Đề xuất chủ động (research-first)

> **File khung chung (master), tái sử dụng cho MỌI dự án — MỌI loại dự án.**
> Trả lời câu hỏi: *từ một ý tưởng, AI phải nghiên cứu và đề xuất gì — về công nghệ và về mọi mặt khác — TRƯỚC khi chốt và viết code.*
> Cặp đôi với KHUNG 1 (quy trình) và KHUNG 2 (luật AI). Chạy ở **Giai đoạn 0 → 1 → 2**.

> **Phạm vi khung (đọc trước):** Khung này hỗ trợ **mọi loại dự án phần mềm** — không chỉ web app.
> Phương pháp (research-first, đề xuất chủ động, cổng giữa các giai đoạn, ADR, chống ảo giác) là **bất biến cho mọi loại**.
> Cái thay đổi theo loại dự án là **hồ sơ công nghệ (profile)**: stack tham chiếu + bộ cổng chất lượng phù hợp.
> - **Dự án MỚI (greenfield):** chọn **hồ sơ loại dự án** ở PHẦN A0 → áp stack tham chiếu của hồ sơ đó (PHẦN C).
> - **Dự án CÓ SẴN (brownfield):** **KHÔNG áp đặt** hồ sơ/stack mặc định. AI đọc repo, **tư vấn & nâng cấp tăng dần**
>   trên đúng stack hiện có (xem `existing-project-adoption.md`).

---

## Nguyên tắc số 1: NGHIÊN CỨU TRƯỚC, ĐỀ XUẤT SAU (research-first)

AI **không được** đề xuất công nghệ/phiên bản/thư viện dựa trên trí nhớ. Trí nhớ của mô hình
có ngày cắt (knowledge cutoff) và **sẽ lỗi thời**. Mọi đề xuất công nghệ phải:

1. **Xác minh tồn tại & phiên bản hiện hành** bằng nguồn sống tại thời điểm khởi tạo dự án:
   - npm: `https://registry.npmjs.org/<gói>/latest` (hoặc `npm view <gói> version`).
   - Tài liệu/blog phát hành chính thức của dự án đó.
   - Node LTS: `https://nodejs.org/dist/index.json` hoặc nodejs.org.
2. **Ghi rõ "đã xác minh ngày nào"** bên cạnh mỗi phiên bản đề xuất — và nhắc xác minh lại nếu dự án bắt đầu sau đó vài tuần.
3. **Không bịa** khả năng/API của thư viện — đọc tài liệu thật trước khi khẳng định "X làm được Y".
   Công cụ hỗ trợ: **MCP Context7** (cấu hình sẵn trong `.mcp.json` của khung) trả tài liệu
   **đúng phiên bản** của thư viện ngay trong phiên — dùng cho cả xác minh API lẫn phiên bản.
   Tên tool cụ thể xem qua `/mcp` (đổi theo phiên bản server — không đoán). *Lưu ý:* đây là dịch vụ
   ngoài (Upstash) — chỉ gửi tên thư viện/câu hỏi tài liệu, **không** gửi mã nguồn hay bí mật;
   dự án không muốn phụ thuộc ngoài thì xóa `.mcp.json` là xong.

> Đây là phần mở rộng của luật chống "ảo giác" (KHUNG 2) áp riêng cho khâu chọn công nghệ.

---

# PHẦN A0 — Phân loại loại dự án & chọn hồ sơ (chạy ĐẦU TIÊN cho dự án mới)

Trước khi đề xuất chủ động (PHẦN A) hay chọn công nghệ (PHẦN B), AI **phân loại ý tưởng** vào một loại dự án để
biết áp **hồ sơ công nghệ** nào (stack tham chiếu + cổng chất lượng ở PHẦN C). Một dự án có thể gồm **nhiều thành
phần** loại khác nhau (vd web app + mobile + API) → mỗi thành phần một hồ sơ; nêu rõ và chọn cho từng phần.

| # | Loại dự án | Dấu hiệu nhận biết | Hồ sơ áp dụng (PHẦN C) |
|---|------------|--------------------|------------------------|
| 1 | **Web app** | Có giao diện chạy trên trình duyệt, CRUD + auth, SEO/realtime | C1 (mặc định) |
| 2 | **Mobile native** | App cài trên iOS/Android, dùng API thiết bị (camera, push, offline sâu) | C2 |
| 3 | **Desktop app** | Chạy trên Windows/macOS/Linux, truy cập hệ thống tệp/phần cứng | C3 |
| 4 | **Backend / API / dịch vụ** | Không UI (hoặc UI tối thiểu); REST/GraphQL/gRPC, job nền, microservice | C4 |
| 5 | **Site nội dung tĩnh / SEO nặng** | Blog/docs/landing nhiều trang, ít tương tác, ưu tiên tốc độ & SEO | C5 |
| 6 | **CLI / Thư viện / SDK** | Công cụ dòng lệnh hoặc gói tái sử dụng, không có UI người dùng cuối | C6 |
| 7 | **Data / ML / AI** | Pipeline dữ liệu, huấn luyện/triển khai mô hình, notebook, batch | C7 |
| 8 | **Game** | Vòng lặp game, đồ họa/vật lý, engine | C8 |
| 9 | **Blockchain / Web3** | Smart contract, ví, on-chain | C9 |
| 10 | **Monorepo đa thành phần** | Nhiều app/loại trong một repo (web + mobile + API + packages) | C10 (tổ hợp C1–C9) |

> **Cách dùng:** xác định loại → mở hồ sơ tương ứng ở PHẦN C để biết **stack tham chiếu** và **cổng nào áp dụng**
> (vd cổng "theme Dark blue + Light", "Core Web Vitals", "a11y WCAG" chỉ bắt buộc cho hồ sơ **có UI web**; CLI/thư
> viện/backend dùng cổng tương đương của loại đó). Sau đó vẫn chạy PHẦN A (đề xuất chủ động) + PHẦN B (chọn công nghệ,
> **xác minh phiên bản**). **Không có loại nào nằm ngoài khung** — nếu một loại chưa có hồ sơ sẵn, AI áp phương pháp
> (PHẦN A–B) để dựng stack tham chiếu mới rồi ghi ADR.

> **Ngoại lệ — dự án "cấm" (từ chối, không tư vấn/không xây):** mã độc, phá hủy dữ liệu-hệ thống, DoS, nhắm mục tiêu
> hàng loạt, tấn công chuỗi cung ứng, né tránh phát hiện vì mục đích xấu, hoặc việc vi phạm pháp luật/quyền riêng tư.
> Bảo mật **phòng thủ**, kiểm thử **có ủy quyền**, CTF, nghiên cứu & giáo dục thì hỗ trợ; công cụ lưỡng dụng cần
> **bối cảnh ủy quyền rõ ràng**. Nghi ngờ → dừng & hỏi (CLAUDE.md §0b, §9).

---

# PHẦN A — Đề xuất chủ động về MỌI mặt (ngay từ ý tưởng)

Khi người dùng đưa một ý tưởng, AI **không** im lặng chờ lệnh. AI chủ động **đi hết bảng dưới đây**,
nêu thiếu sót/rủi ro/cơ hội kèm **đề xuất cụ thể**, để người dùng quyết định. Mỗi mục: *hỏi gì → đề xuất gì*.

| # | Khía cạnh | AI phải chủ động hỏi & đề xuất |
|---|-----------|--------------------------------|
| 1 | **Vấn đề & người dùng** | Vấn đề thật chưa? Ai dùng cụ thể? Có thể thu hẹp để ra MVP nhỏ hơn không? |
| 2 | **Phạm vi MVP** | Cái gì cắt được mà vẫn giải quyết vấn đề lõi? Cảnh báo phình phạm vi. |
| 3 | **Mô hình dữ liệu** | Thực thể chính, quan hệ, ràng buộc, index, dữ liệu nhạy cảm. Lỗ hổng schema. |
| 4 | **Xác thực & phân quyền** | Cần đăng nhập? Vai trò nào? RLS/ACL ra sao? Đăng nhập xã hội/OTP/magic link? |
| 5 | **Bảo mật** | Bề mặt tấn công, dữ liệu nhạy cảm, rate limit, chống lạm dụng, secrets. |
| 6 | **Pháp lý & quyền riêng tư** | Thu thập dữ liệu cá nhân? Cần privacy policy/terms? GDPR/Nghị định 13 (VN)? Tuổi người dùng? |
| 7 | **Thanh toán** (nếu có) | Cổng nào? Lưu thẻ? Hoàn tiền? Idempotency? Webhook? Đối soát? |
| 8 | **Hiệu năng** | Ngân sách Core Web Vitals (xem Nhóm 2). Dữ liệu lớn? Cần cache/CDN/pagination? |
| 9 | **Accessibility** | Mục tiêu WCAG AA. Bàn phím, đọc màn hình, tương phản (xem Nhóm 2). |
| 10 | **Mobile-first & responsive** | Đa số dùng điện thoại? Cần PWA/offline? (xem Nhóm 2). |
| 11 | **Giao diện / theme** | Mặc định **nền Dark blue** + chế độ **Light** (xem `quality-supplements.md` PHẦN 3). Design tokens. |
| 12 | **Đa ngôn ngữ (i18n)** | Cần nhiều ngôn ngữ? Định dạng ngày/số/tiền theo locale? Hướng RTL? |
| 13 | **SEO** | Cần index? SSR/SSG? Metadata, sitemap, Open Graph, dữ liệu có cấu trúc. |
| 14 | **Observability** | Theo dõi lỗi (Sentry), log, analytics, cảnh báo (xem Nhóm 2). |
| 15 | **Khả năng mở rộng & chi phí** | Lượng người dùng dự kiến? Chi phí hosting/CSDL khi tăng? Điểm nghẽn đầu tiên? |
| 16 | **Kiểm thử** | Chiến lược test (unit/integration/E2E), dữ liệu test, môi trường (xem Nhóm 2). |
| 17 | **Triển khai & môi trường** | dev/staging/prod tách bạch? CI/CD? Rollback? Migration? |
| 18 | **Backup & khôi phục** | Lịch backup, đã thử khôi phục chưa, RPO/RTO chấp nhận được. |
| 19 | **Vận hành sau ra mắt** | Quy trình sự cố, cập nhật phụ thuộc, nợ kỹ thuật. |

> **Quy tắc vàng:** thà nêu thừa một góp ý còn hơn để người dùng phát hiện thiếu sót lúc đã code xong.
> Trình bày gọn (mỗi mục 1–2 dòng + đề xuất), không thuyết giảng. Người dùng chọn, AI không tự quyết.

---

# PHẦN B — Quy trình chọn công nghệ (từ ý tưởng → stack đề xuất)

**Mục tiêu:** đề xuất stack tối ưu *cho ý tưởng cụ thể này*, dùng **phiên bản tối ưu nhất hiện tại**,
**cân bằng giữa lượng người dùng (độ phổ biến) và công nghệ (năng lực)**.

## B1. Đầu vào để quyết định
- Loại sản phẩm (web app, mobile, API, realtime, nhiều dữ liệu, AI...).
- Yêu cầu phi chức năng (tốc độ, SEO, offline, realtime, quy mô).
- Bối cảnh đội ngũ: làm một mình? quen công nghệ gì? thời gian/ngân sách?
- Ràng buộc: chi phí, vendor lock-in chấp nhận được, yêu cầu tuân thủ.

## B2. Tiêu chí đánh giá — cân bằng "người dùng ↔ công nghệ"

Cho mỗi lựa chọn (framework, CSDL, hosting, thư viện lõi), chấm theo hai nhóm và **cân bằng**:

**Nhóm "lượng người dùng / độ phổ biến" (giảm rủi ro, dễ tìm trợ giúp & người làm):**
- Mức độ phổ biến: lượt tải npm, sao GitHub, độ sôi động cộng đồng (Discord, Stack Overflow).
- Tài liệu & hệ sinh thái: tài liệu tốt, nhiều thư viện phụ trợ, nhiều ví dụ.
- Độ trưởng thành & ổn định: tuổi đời, có LTS, lịch sử dùng trong production, tần suất breaking change *thấp*.
- Tuổi thọ & hậu thuẫn: ai bảo trợ, nguồn lực tài chính, "bus factor", giấy phép.

**Nhóm "công nghệ / năng lực" (giải đúng bài toán, trải nghiệm phát triển tốt):**
- Mức phù hợp bài toán: có giải quyết *đúng* nhu cầu này không (realtime, SEO, edge, AI...).
- Năng lực & hiệu năng: nhanh, mở rộng được, tính năng cần thiết có sẵn.
- Trải nghiệm phát triển (DX): type-safe, dễ test, tích hợp tốt với phần còn lại của stack.
- Chi phí & vận hành: giá hosting, đường nâng cấp, độ phức tạp khi mở rộng.

**Cách cân bằng (heuristic):**
- **Phần lõi (framework, CSDL, hosting): ưu tiên "đã được kiểm chứng" (proven/boring).** Đây là nơi
  lỗi đắt nhất — chọn cái phổ biến, ổn định, nhiều người dùng. Đừng cách tân ở nền móng.
- **Chỉ cách tân có chủ đích ở 1 chỗ mỗi lúc.** Nếu một thư viện mới mang lợi thế lớn cho *đúng* bài
  toán cốt lõi, có thể chọn — nhưng cô lập rủi ro, và đừng dùng đồng thời nhiều công nghệ "non".
- **Tránh "bleeding edge" ở đường đi quan trọng** (sản xuất): công nghệ < 1 năm tuổi, API còn đổi
  nhiều, ít người dùng thật → rủi ro cao. Để dành cho phần phụ, không cốt lõi.
- **Khớp với đội ngũ:** công nghệ tốt nhất *trên giấy* nhưng cả đội không biết → có thể chậm hơn cái "đủ tốt mà quen".

## B3. Phương pháp ra quyết định
1. Liệt kê **2–3 ứng viên** cho mỗi quyết định lớn (đừng chỉ có một).
2. Lập **ma trận** chấm điểm theo tiêu chí B2 (đánh trọng số theo yêu cầu dự án).
3. Chọn phương án thắng → **ghi ADR** (`docs/adr/`) nêu rõ *tại sao* và *đã loại gì, vì sao*.
4. **Xác minh phiên bản** theo Nguyên tắc số 1, ghi ngày xác minh.

## B4. Quy tắc chọn PHIÊN BẢN
- Dùng bản **ổn định mới nhất** (stable/latest), **không** alpha/beta/canary/RC cho production.
- Ưu tiên **LTS** ở những chỗ có khái niệm LTS (Node...).
- **Né bản `x.0.0`** vừa ra: chờ vài bản vá (`x.0.1+`/`x.1.0`) cho ổn định, trừ khi có lý do rõ.
- Đọc **ghi chú nâng cấp / breaking changes** trước khi chốt major mới.
- **Ghim major, cho phép patch:** dùng dải `^x.y.z` hợp lý; khóa qua lockfile; để Dependabot lo bản vá.
- Kiểm tra **tương thích chéo** (vd framework ↔ React ↔ Node ↔ thư viện chính) — không ghép đại.

---

# PHẦN C — Hồ sơ công nghệ theo loại dự án (stack tham chiếu)

> Mỗi hồ sơ dưới đây là **điểm khởi đầu hợp lý** cho một loại dự án (PHẦN A0), KHÔNG phải lựa chọn bắt buộc.
> **Không dùng máy móc:** với mỗi ý tưởng, AI phải đối chiếu PHẦN B và *biện minh lại* (hoặc đề xuất khác).
> **Mọi phiên bản bên dưới là ảnh chụp ngày 2026-06-29 — XÁC MINH LẠI tại thời điểm khởi tạo dự án** (Nguyên tắc số 1).
> Cột "Cổng chất lượng đặc thù" cho biết hồ sơ đó thay/bổ sung gì so với các cổng web trong KHUNG 1.

## C1 — Hồ sơ Web app

> **Lưu ý:** "MẶC ĐỊNH" ở đây có nghĩa đây là hồ sơ mà các **file cấu hình drop-in** (CI, hook,
> `lib/env.ts`, `styles/theme.css`, Lighthouse, Playwright) giả định — **không phải** mặc định áp đặt
> cho mọi dự án. Nếu ý tưởng không phải web app điển hình, bắt buộc phân loại lại qua PHẦN A0 trước.
> Xem thêm `TRAPS.md` §9.
>
> Mặc định cho **web app điển hình** (CRUD + auth + realtime nhẹ).

| Vai trò | Lựa chọn | Phiên bản (xác minh 2026-06-29) | Vì sao (cân bằng phổ biến ↔ năng lực) |
|---------|----------|-------------------------------|----------------------------------------|
| Runtime | Node.js LTS | 22.x ("Jod") trở lên — dùng Active LTS hiện hành | Ổn định, hệ sinh thái lớn nhất |
| Framework | Next.js (App Router) | 16.x | SSR/SSG/SEO + cộng đồng rất lớn; full-stack một repo |
| UI lib | React | 19.x | Phổ biến nhất; hệ sinh thái khổng lồ |
| Ngôn ngữ | TypeScript (`strict`) | 6.x | An toàn kiểu — bắt lỗi sớm |
| CSS | Tailwind CSS | 4.x | Năng suất cao; rất phổ biến; tokens hợp với theme |
| CSDL + Auth + Realtime | Supabase (Postgres) | client `@supabase/supabase-js` 2.x | Postgres "chuẩn vàng" + RLS + auth sẵn; ít vendor lock-in hơn (vẫn là Postgres) |
| Hosting | Vercel | — | Tích hợp Next tốt nhất; Preview làm staging miễn phí |
| Validate runtime | Zod | 4.x | Chuẩn de-facto để validate dữ liệu ngoài |
| Test unit | Vitest | 4.x | Nhanh, hợp Vite/TS |
| Test E2E | Playwright | 1.x | Đa trình duyệt + mobile; rất ổn định |
| Theo dõi lỗi | Sentry (`@sentry/nextjs`) | — | Tiêu chuẩn observability cho Next |

> **Lưu ý quan trọng:** đây là các *major* tương đối mới (Next 16, React 19, Tailwind 4, TS 6, Zod 4).
> Một số cấu hình "mẫu" trong khung viết cho thế hệ trước — khi khởi tạo, **đọc tài liệu nâng cấp**
> của từng gói (vd Tailwind 4 cấu hình theme bằng CSS, ESLint dùng flat config) và điều chỉnh cho khớp.

## C2 — Hồ sơ Mobile native

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Khung đa nền tảng | **React Native + Expo** (TS strict) | Một codebase iOS+Android; hệ sinh thái JS lớn; tái dùng kỹ năng web |
| Thay thế | Flutter (Dart) · native thuần (Swift/Kotlin) | Chọn khi cần hiệu năng/đồ họa cao hoặc tích hợp sâu nền tảng |
| State/data | TanStack Query + storage bảo mật (SecureStore/Keychain) | Đồng bộ + cache offline |
| Test | Jest/Vitest (unit) + **Maestro/Detox** (E2E thiết bị) | Thay Playwright web bằng E2E thiết bị |
| Phát hành | EAS Build/Submit + OTA update | CI build cho store |

> **Cổng chất lượng đặc thù:** thay "Lighthouse/CWV web" bằng **hiệu năng khởi động + kích thước app + 60fps**;
> a11y theo guideline nền tảng (TalkBack/VoiceOver); thay "theme web tokens" bằng design system của RN.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C2.

## C3 — Hồ sơ Desktop app

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Khung | **Tauri** (Rust + web UI) hoặc **Electron** (Node + web UI) | Tauri nhẹ/an toàn hơn; Electron trưởng thành, nhiều ví dụ |
| UI | React/Svelte + TS strict | Tái dùng kỹ năng web |
| Native/khác | .NET MAUI · Qt · Swift/WinUI | Khi cần tích hợp hệ điều hành sâu |
| Test | Vitest (unit) + WebDriver/Playwright (UI) | + kiểm thử cập nhật tự động |

> **Cổng đặc thù:** ký số (code signing) + auto-update an toàn; quyền truy cập hệ thống tệp/phần cứng tối thiểu.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C3.

## C4 — Hồ sơ Backend / API / dịch vụ

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Runtime/ngôn ngữ | **Node.js (TS) · Go · Python · Rust** | Chọn theo bài toán & năng lực đội; proven cho phần lõi |
| Khung API | NestJS/Fastify/Hono (TS) · FastAPI (Py) · Gin/Echo (Go) · Axum (Rust) | REST/GraphQL/gRPC theo nhu cầu |
| CSDL | Postgres (mặc định) + ORM (Prisma/Drizzle/SQLAlchemy/sqlc) | Migration có phiên bản, rollback được |
| Test | Unit + **integration (HTTP/DB thật qua testcontainers)** + contract test | Thay E2E trình duyệt bằng contract/integration |
| Vận hành | Docker + healthcheck + OpenAPI/Swagger | Observability: log có cấu trúc + metrics + tracing |

> **Cổng đặc thù:** thay "a11y/CWV/theme" bằng **contract API ổn định, p95 latency, rate limit, idempotency,
> bảo mật xác thực/phân quyền**; tài liệu OpenAPI là một phần DoD.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C4.

## C5 — Hồ sơ Site nội dung tĩnh / SEO nặng

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Khung | **Astro** (mặc định) · Next.js (SSG) · Hugo/Eleventy | Astro: ít JS, tốc độ & SEO tốt cho nội dung |
| Nội dung | Markdown/MDX + content collections · CMS headless (nếu cần biên tập) | |
| Cổng | **CWV + SEO (sitemap/OG/structured data)** giữ nguyên như web | Lighthouse CI áp được trực tiếp |

> **Cổng đặc thù:** giữ Lighthouse/CWV + SEO; bỏ bớt phần "auth/RLS/realtime" nếu là site thuần đọc.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C5.

## C6 — Hồ sơ CLI / Thư viện / SDK

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Ngôn ngữ | TS (Node) · Go · Rust · Python | Theo nơi người dùng cuối chạy |
| Đóng gói | tsup/unbuild (TS) · goreleaser (Go) · cargo (Rust) | Xuất bản npm/crates/PyPI/binary |
| API công khai | **SemVer nghiêm + CHANGELOG** | Phá vỡ API = major; giữ tương thích ngược |
| Test | Unit + **snapshot/CLI golden test** + ma trận đa phiên bản runtime | |

> **Cổng đặc thù:** thay "UI/theme/a11y/CWV" bằng **API ổn định + SemVer + tài liệu dùng (README/typedoc) +
> không phụ thuộc thừa**; DX của người tích hợp là tiêu chí chính.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C6.

## C7 — Hồ sơ Data / ML / AI

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Ngôn ngữ | **Python** (chuẩn ngành) | TS cho phần app/serving nếu cần |
| Xử lý/ML | pandas/Polars · scikit-learn/PyTorch · orchestration (Airflow/Dagster/Prefect) | |
| Theo dõi | MLflow/W&B (experiment) + DVC (dữ liệu/model versioning) | Tái lập được kết quả |
| Serving | FastAPI/BentoML (model API) · batch jobs | Nếu xây ứng dụng LLM, **dùng model Claude mới nhất** (xem skill `claude-api`) |
| Test | Unit + **data validation (Great Expectations/pandera)** + test tái lập | |

> **Cổng đặc thù:** thay "a11y/CWV/theme" bằng **tái lập được (seed/version dữ liệu+model), chất lượng dữ liệu,
> đánh giá mô hình (metrics/eval set), giám sát trôi dữ liệu (drift)**.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C7.

## C8 — Hồ sơ Game

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Engine | **Godot** (mã nguồn mở) · Unity (C#) · Unreal (C++) · web: PixiJS/Phaser/Three.js | Chọn theo 2D/3D & nền tảng |
| Test | Unit cho logic game + playtest | Tự động hóa giới hạn — chú trọng profiling |

> **Cổng đặc thù:** **frame budget (60fps), thời gian tải, kích thước build**; thay E2E web bằng playtest có kịch bản.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C8.

## C9 — Hồ sơ Blockchain / Web3

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Hợp đồng | Solidity + **Foundry/Hardhat** (EVM) · Rust/Anchor (Solana) | |
| Bảo mật | **Audit + test bao phủ cao + fuzzing (slither/echidna)** | Lỗi không sửa được sau deploy → bảo mật là số 1 |
| Frontend | Web app (C1) + thư viện ví (wagmi/viem) | |

> **Cổng đặc thù:** audit bảo mật bắt buộc trước mainnet; bất biến sau deploy → test/fuzz/coverage là cổng cứng.
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C9.

## C10 — Hồ sơ Monorepo đa thành phần

| Vai trò | Lựa chọn tham chiếu | Ghi chú |
|---------|---------------------|---------|
| Quản lý | **pnpm/npm workspaces + Turborepo/Nx** (JS) · Cargo workspaces · Go modules | |
| Cấu trúc | `apps/*` (mỗi app theo hồ sơ C1–C9) + `packages/*` (chia sẻ, theo C6) | Mỗi thành phần áp cổng của hồ sơ tương ứng |
| CI | Build/test **theo phần thay đổi** (affected) + cache | |

> **Cổng đặc thù:** mỗi app/package áp đúng cổng hồ sơ của nó; thêm ràng buộc biên (không import vòng/lệch tầng).
> **Chi tiết đo được:** `quality-gates-by-profile.md` §C10.

> **Khi một loại chưa có hồ sơ sẵn (vd embedded/IoT, AR/VR):** không coi là "ngoài khả năng" — AI áp **phương pháp**
> PHẦN A–B (research-first, cân bằng phổ biến↔năng lực, xác minh phiên bản) để dựng stack tham chiếu mới + ghi **ADR**.

---

# PHẦN D — Đầu ra & nối vào khung

Sau PHẦN A–C, AI sản xuất:

1. **Bản đề xuất công nghệ** (đưa vào `PROJECT.md` mục 4): mỗi lựa chọn + phiên bản + *ngày xác minh* + 1 câu lý do.
2. **ADR cho mỗi quyết định lớn** (`docs/adr/000X-...`): ứng viên đã cân nhắc, tiêu chí, vì sao chọn/loại.
   → Xem **ví dụ đã điền: `docs/adr/0001-stack-selection.md`** (áp dụng đúng phương pháp PHẦN B cho stack mặc định).
3. **Danh sách góp ý chủ động** (từ bảng PHẦN A): các mặt người dùng nên quyết trước khi code.

**Thứ tự chạy trong quy trình KHUNG 1:**
- **GĐ 0 (Ý tưởng):** chạy **PHẦN A0** (phân loại loại dự án → chọn hồ sơ) rồi **PHẦN A** để làm rõ vấn đề & lộ rủi ro sớm.
- **GĐ 1 (Kế hoạch):** chốt phạm vi + yêu cầu phi chức năng → đầu vào cho chọn công nghệ.
- **GĐ 2 (Thiết kế):** chạy PHẦN B → chốt stack + phiên bản (đã xác minh) → ghi ADR → điền `PROJECT.md` mục 4.

> Tóm lại: **không bao giờ** nhảy thẳng vào code với một stack "đoán bừa". Ý tưởng → nghiên cứu →
> đề xuất có dẫn chứng & phiên bản đã xác minh → người dùng chốt → ghi ADR → rồi mới dựng hàng rào & code.
