# KHUNG 3 — Chọn công nghệ & Đề xuất chủ động (research-first)

> **File khung chung (master), tái sử dụng cho MỌI dự án.**
> Trả lời câu hỏi: *từ một ý tưởng, AI phải nghiên cứu và đề xuất gì — về công nghệ và về mọi mặt khác — TRƯỚC khi chốt và viết code.*
> Cặp đôi với KHUNG 1 (quy trình) và KHUNG 2 (luật AI). Chạy ở **Giai đoạn 0 → 1 → 2**.

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

> Đây là phần mở rộng của luật chống "ảo giác" (KHUNG 2) áp riêng cho khâu chọn công nghệ.

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
| 11 | **Giao diện / theme** | Mặc định **nền Dark blue** + chế độ **Light** (xem `BO-SUNG-chat-luong.md` PHẦN 3). Design tokens. |
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

# PHẦN C — Stack tham chiếu mặc định (đã xác minh 2026-06-29)

> Đây là **mặc định hợp lý cho web app điển hình** (CRUD + auth + realtime nhẹ), cũng là stack mà
> các file cấu hình trong bộ khung này (CI, hook, env, theme) đang giả định.
> **Không dùng máy móc:** với mỗi ý tưởng, AI phải đối chiếu PHẦN B và *biện minh lại* (hoặc đề xuất khác).
> **Phiên bản bên dưới là ảnh chụp ngày 2026-06-29 — XÁC MINH LẠI tại thời điểm khởi tạo dự án.**

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
> Khi nào nên đổi stack mặc định: cần mobile native → React Native/Expo; nặng SEO tĩnh/nội dung →
> Astro; realtime/đồng tác nặng → cân nhắc thêm; cực ít logic server → có thể bỏ bớt.

---

# PHẦN D — Đầu ra & nối vào khung

Sau PHẦN A–C, AI sản xuất:

1. **Bản đề xuất công nghệ** (đưa vào `PROJECT.md` mục 4): mỗi lựa chọn + phiên bản + *ngày xác minh* + 1 câu lý do.
2. **ADR cho mỗi quyết định lớn** (`docs/adr/000X-...`): ứng viên đã cân nhắc, tiêu chí, vì sao chọn/loại.
   → Xem **ví dụ đã điền: `docs/adr/0001-chon-stack.md`** (áp dụng đúng phương pháp PHẦN B cho stack mặc định).
3. **Danh sách góp ý chủ động** (từ bảng PHẦN A): các mặt người dùng nên quyết trước khi code.

**Thứ tự chạy trong quy trình KHUNG 1:**
- **GĐ 0 (Ý tưởng):** chạy PHẦN A để làm rõ vấn đề & lộ rủi ro sớm.
- **GĐ 1 (Kế hoạch):** chốt phạm vi + yêu cầu phi chức năng → đầu vào cho chọn công nghệ.
- **GĐ 2 (Thiết kế):** chạy PHẦN B → chốt stack + phiên bản (đã xác minh) → ghi ADR → điền `PROJECT.md` mục 4.

> Tóm lại: **không bao giờ** nhảy thẳng vào code với một stack "đoán bừa". Ý tưởng → nghiên cứu →
> đề xuất có dẫn chứng & phiên bản đã xác minh → người dùng chốt → ghi ADR → rồi mới dựng hàng rào & code.
