# Bổ sung chất lượng & năng lực

> **Một file thay cho 4 tài liệu bổ sung** (Nhóm 1, Nhóm 2, Theme, Nâng cao). Đọc đúng PHẦN cần —
> không nạp cả file mỗi phiên. Tham chiếu cũ kiểu "Nhóm 1/Nhóm 2 mục X" vẫn đúng (giữ nguyên số mục).

| PHẦN | Nội dung |
|------|----------|
| 1 — Nhóm 1 | env validation, migration, PR template, ADR, npm audit, Vercel staging, DoR |
| 2 — Nhóm 2 | mobile-first, hiệu năng/Lighthouse, kiểm thử E2E+a11y+coverage, UI/UX, chống lỗi logic, observability |
| 3 — Theme | Dark blue mặc định + Light, design tokens, no-flash |
| 4 — Nâng cao | i18n · PWA · Sentry · SEO · Analytics |

===============================================================================

# PHẦN 1 — Nhóm 1: nền tảng chất lượng & quy trình

> Tài liệu này gắn các bổ sung "Nhóm 1" vào bộ khung đã có (KHUNG 1, KHUNG 2, CLAUDE.md, hướng dẫn pre-commit/CI).
> Mỗi mục ghi rõ: file kèm theo (nếu có), đặt ở đâu, và nó lấp lỗ hổng nào trong khung.

## Các bổ sung gắn vào khung ở đâu

| Bổ sung | Lấp lỗ hổng | Liên quan giai đoạn |
|---------|-------------|---------------------|
| Xác thực biến môi trường (`lib/env.ts`) | "Type safety" chưa che biến môi trường thiếu/sai | GĐ 3 — Thiết lập |
| PR template (`.github/pull_request_template.md`) | DoD/cổng chưa được GitHub ép hiển thị | GĐ 4 — mọi merge |
| Quy trình migration Supabase | "Migration có phiên bản" chưa nói *làm sao* | GĐ 2 & 6 |
| ADR (`docs/adr/`) | Nguyên tắc "tài liệu hóa tại sao" chưa có công cụ | Xuyên suốt |
| CI thêm `npm audit` | "Audit bảo mật" chưa nằm trong pipeline | GĐ 6 |
| Vercel Preview làm staging | "Có staging" tưởng tốn công, thực ra miễn phí | GĐ 6 |
| Definition of Ready | Bổ trợ cho Definition of Done | GĐ 1 & 4 |

---

## 1. Xác thực biến môi trường (file `lib/env.ts`)

File code kèm theo: đặt tại `lib/env.ts`. Cần cài Zod nếu chưa có:

```bash
npm install zod
```

**Cách dùng:** thay vì gọi `process.env.X` rải rác khắp nơi, hãy import từ file này:

```ts
import { clientEnv, serverEnv } from '@/lib/env';

// Ở client (component, hook):
const url = clientEnv.NEXT_PUBLIC_SUPABASE_URL;

// Ở server (API route, server action):
const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
```

**Lợi ích:** nếu thiếu hoặc sai một biến, app dừng *ngay khi khởi động* với thông báo rõ ràng, thay vì lỗi khó hiểu lúc người dùng đang thao tác. Nhớ đổi tên biến trong file cho khớp dự án.

---

## 2. Quy trình migration Supabase (cụ thể)

Cụ thể hóa yêu cầu "migration có phiên bản, rollback được" của khung.

**Cài đặt một lần:**
```bash
npm install --save-dev supabase
npx supabase login
npx supabase init          # tạo thư mục supabase/ (commit vào Git)
npx supabase link --project-ref <mã-project-của-bạn>
```

**Phát triển trên CSDL local** (cần Docker Desktop đang chạy):
```bash
npx supabase start         # chạy Postgres + Studio local
```
> Nếu không cài được Docker, có thể tạo một Supabase project riêng cho "dev" và làm việc trên đó, tách khỏi production.

**Tạo một migration mới:**
```bash
# Cách 1: viết SQL tay
npx supabase migration new ten_thay_doi
#   → tạo file có dấu thời gian trong supabase/migrations/

# Cách 2: tự sinh từ thay đổi bạn làm trong Studio local
npx supabase db diff -f ten_thay_doi
```

**Áp dụng & kiểm tra local:**
```bash
npx supabase db reset      # chạy lại toàn bộ migration trên CSDL local (sạch)
```

**Đẩy lên production (sau khi đã test kỹ local):**
```bash
npx supabase db push
```

**Luôn commit thư mục `supabase/migrations/` vào Git** — đây chính là "phiên bản" của CSDL.

**Về rollback (quan trọng, cần hiểu đúng):** Supabase chạy migration theo chiều tiến, không tự lùi. "Rollback được" nghĩa là:
- Viết một migration *bù trừ* để hoàn tác thay đổi (ví dụ thêm cột thì viết migration xóa cột đó), **hoặc**
- Khôi phục từ backup / Point-in-Time Recovery của Supabase.

→ Vì vậy: trước mỗi migration đụng dữ liệu thật, đảm bảo đã có backup và đã nghĩ sẵn đường lùi.

---

## 3. PR template (file `.github/pull_request_template.md`)

File kèm theo: đặt đúng tại `.github/pull_request_template.md`. GitHub sẽ tự điền checklist DoD vào mọi Pull Request → biến "cổng" thành thứ bạn buộc phải nhìn thấy trước khi merge.

---

## 4. ADR — ghi lại quyết định (thư mục `docs/adr/`)

File mẫu kèm theo: đặt tại `docs/adr/0000-template.md`. Mỗi quyết định kỹ thuật quan trọng = một file mới đánh số tăng dần (`0001-...`, `0002-...`).

**Khi nào viết ADR?** Khi chọn giữa các phương án có đánh đổi đáng kể: chọn thư viện chính, cấu trúc dữ liệu cốt lõi, kiến trúc xác thực, cách tổ chức cache TTS... Không cần viết cho quyết định nhỏ.

**Đặc biệt giá trị với bạn:** vì bạn dùng AI nhiều, ADR giúp một phiên Claude Code mới (hoặc chính bạn vài tháng sau) hiểu *tại sao* mọi thứ như hiện tại, tránh vô tình lật ngược quyết định cũ. Nên trỏ `CLAUDE.md` đọc `docs/adr/` trước khi đề xuất thay đổi lớn về kiến trúc.

---

## 5. Cập nhật CI: thêm quét bảo mật

Trong file `.github/workflows/ci.yml`, thêm một bước sau bước "Cài đặt":

```yaml
      - name: Quét bảo mật phụ thuộc
        run: npm audit --audit-level=high
```

> `--audit-level=high` chỉ fail khi có lỗ hổng mức *cao* trở lên, tránh nhiễu. Nếu lúc đầu gặp lỗ hổng không có bản vá khiến CI đỏ liên tục, tạm hạ xuống `--audit-level=critical` hoặc thêm `continue-on-error: true` cho riêng bước này, rồi xử lý dần.

---

## 6. Dùng Vercel Preview làm staging (miễn phí)

Khung yêu cầu "có môi trường staging giống production". Tin tốt: **Vercel tự tạo một bản preview cho mỗi nhánh / mỗi Pull Request**, với URL riêng — bạn không phải dựng gì thêm.

Cách tận dụng:
- Mỗi PR sẽ có link preview tự động → dùng nó để smoke test trước khi merge.
- Trong Vercel dashboard, đặt biến môi trường **riêng cho Preview**, trỏ tới một Supabase project (hoặc nhánh CSDL) "staging", **không** đụng dữ liệu production.
- Chỉ nhánh `main` mới deploy lên domain production.

→ Đây chính là tầng "thử lần cuối trên môi trường giống thật" mà gần như không tốn công.

---

## 7. Bổ sung quy trình: Definition of Ready (DoR)

Khung đã có Definition of Done (khi nào một việc *xong*). Bổ sung đối trọng: Definition of Ready — khi nào một việc *sẵn sàng để bắt đầu*. Tránh lao vào việc còn mơ hồ rồi phải làm lại.

**Một task chỉ nên BẮT ĐẦU khi:**
- [ ] Có tiêu chí chấp nhận rõ ràng, đo được.
- [ ] Không còn câu hỏi mở quan trọng nào.
- [ ] Đã xác định các phần phụ thuộc (cần gì xong trước).
- [ ] Thiết kế/luồng đủ rõ để bắt tay (hoặc đã có wireframe nếu là UI).
- [ ] Phạm vi đủ nhỏ để gói gọn trong một PR.

→ Nên thêm DoR này vào KHUNG 1, ngay cạnh DoD ở Giai đoạn 1. Trong `CLAUDE.md`, có thể yêu cầu AI kiểm tra DoR trước khi bắt đầu một task: nếu chưa đủ "ready", AI phải hỏi cho rõ trước, thay vì code ngay.


===============================================================================

# PHẦN 2 — Nhóm 2: mobile, hiệu năng, kiểm thử, UI/UX, chống lỗi logic

> Tài liệu này gắn các bổ sung "Nhóm 2" vào bộ khung đã có (KHUNG 1, KHUNG 2, Nhóm 1).
> Trọng tâm Nhóm 2: **mobile-first, hiệu năng (Lighthouse/Core Web Vitals), kiểm thử mở rộng
> (E2E + accessibility tự động), UI/UX, và chống lỗi logic.**
> Triết lý xuyên suốt vẫn là *"tự động hóa thay vì kỷ luật"*: mỗi checklist dưới đây đều
> kèm một hàng rào máy chạy được (CI/lint/test) — đừng chỉ dựa vào việc "nhớ kiểm tra".

## Các bổ sung gắn vào khung ở đâu

| Bổ sung | Lấp lỗ hổng | Liên quan giai đoạn | Hàng rào tự động |
|---------|-------------|---------------------|------------------|
| Checklist mobile-first | "Mobile-first" mới có 1 dòng ở GĐ 2 | GĐ 2 & 4 | Playwright project `mobile` |
| Performance budget + Lighthouse CI | "Lighthouse ≥ 90" chưa được ép trong pipeline | GĐ 5 & 6 | `lighthouserc.json` + workflow |
| Accessibility tự động | A11y mới ở mức "nhớ kiểm tra tay" | GĐ 4 & 5 | `eslint-plugin-jsx-a11y` + `@axe-core/playwright` |
| Kiểm thử E2E (Playwright) | Kim tự tháp test thiếu tầng E2E | GĐ 5 | `playwright.config.ts` |
| Ngưỡng coverage | "Có test" chưa có mức tối thiểu | GĐ 5 | `vitest` coverage thresholds |
| Checklist UI/UX trạng thái | Loading/rỗng/lỗi mới là nguyên tắc, chưa thành checklist | GĐ 4 | PR template |
| Checklist chống lỗi logic | "Type safety" không bắt được lỗi *nghiệp vụ* | GĐ 4 & 5 | review + test biên |
| Observability (Sentry) | GĐ 6 nhắc Sentry nhưng chưa nói *làm sao* | GĐ 6 & 8 | `@sentry/nextjs` |
| Issue template + CHANGELOG | Quản lý việc & lịch sử thay đổi chưa có công cụ | Xuyên suốt | GitHub templates |

---

## 1. Mobile-first (cụ thể hóa)

Khung yêu cầu "mobile-first; responsive" nhưng chưa nói *kiểm cái gì*. Phần lớn người dùng vào
bằng điện thoại — thiết kế cho màn nhỏ trước, rồi mở rộng ra màn lớn (`sm:`, `md:`, `lg:` của Tailwind).

**Checklist mobile-first (đối chiếu cho mỗi màn hình):**
- [ ] Thiết kế ở khổ ~360px trước; không có thanh cuộn ngang ở bất kỳ breakpoint nào.
- [ ] **Vùng chạm ≥ 44×44px** cho mọi nút/link (Apple HIG; tối thiểu WCAG 2.2 AA là 24px) — ngón tay không phải con trỏ chuột.
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1" />` (Next có sẵn qua `viewport` export).
- [ ] Tôn trọng **safe-area** trên máy có tai thỏ: `env(safe-area-inset-*)` cho header/footer cố định.
- [ ] Input không gây zoom bất ngờ trên iOS: cỡ chữ input ≥ 16px.
- [ ] Ảnh dùng `next/image` (tự `srcset`, lazy-load, tránh layout shift); luôn đặt `width`/`height` hoặc `fill` + `sizes`.
- [ ] Font nạp qua `next/font` (tránh FOIT/FOUT và giảm CLS).
- [ ] Bàn phím ảo không che mất ô nhập đang gõ; nút submit không bị bàn phím che.
- [ ] Test thật trên thiết bị (hoặc Playwright project `mobile` ở mục 4) trước khi coi là xong.

> **Tự động:** Playwright chạy mọi smoke test trên cả viewport mobile (`Pixel 5`) lẫn desktop —
> xem `playwright.config.ts`. Một luồng chính gãy ở mobile sẽ làm CI đỏ.

---

## 2. Performance budget & Lighthouse CI

Khung nói "Lighthouse ≥ 90" nhưng để nó là việc *nhớ chạy tay* thì sớm muộn cũng quên.
Biến nó thành **cổng tự động** chạy trên mỗi PR.

### Ngân sách hiệu năng (đặt mục tiêu cụ thể trong `PROJECT.md` mục 3)

**Core Web Vitals** (đo trên 4G/thiết bị tầm trung — tức điều kiện thật của đa số người dùng):

| Chỉ số | Ngưỡng "tốt" | Ý nghĩa |
|--------|-------------|---------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | nội dung chính hiện nhanh |
| **INP** (Interaction to Next Paint) | ≤ 200ms | bấm/gõ phản hồi mượt (thay FID từ 2024) |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | bố cục không "nhảy" |

**Điểm Lighthouse tối thiểu (mobile):** Performance ≥ 90 · Accessibility ≥ 90 · Best Practices ≥ 90 · SEO ≥ 90.

### Cài Lighthouse CI

```bash
npm install --save-dev @lhci/cli
```

File `lighthouserc.json` (đã kèm ở gốc repo) khai báo URL cần đo + các assertion (ngưỡng).
Workflow `.github/workflows/lighthouse-ci.yml` (đã kèm) chạy build, dựng server, đo, và **fail PR nếu dưới ngưỡng**.

> Mẹo chống nhiễu: Lighthouse dao động nhẹ giữa các lần chạy. `lighthouserc.json` đặt
> `numberOfRuns: 3` (lấy trung vị). Nếu một assertion quá ngặt lúc đầu, hạ về `"warn"` thay vì
> `"error"` cho riêng chỉ số đó, siết dần sau — đừng tắt cả cổng.

---

## 3. Accessibility tự động (a11y)

A11y không chỉ là đạo đức — nó là chất lượng đo được và ảnh hưởng SEO. Tự động hóa hai tầng:

**Tầng tĩnh — ESLint:** `eslint-config-next` đã bật sẵn bộ rule **jsx-a11y cốt lõi** (thiếu `alt`,
`label` rời rạc, `onClick` trên thẻ không tương tác...) — không cần cài gói riêng. `eslint.config.mjs`
(flat config) **siết thêm** vài rule (`jsx-a11y/no-autofocus`, `jsx-a11y/label-has-associated-control`).
Cần bắt sâu hơn thì dùng tầng động (axe) bên dưới.

**Tầng động — axe trong E2E:** quét cây DOM thật (đã render) bằng axe:

```bash
npm install --save-dev @axe-core/playwright
```

Mỗi smoke test E2E nên kèm một lần quét axe (xem `e2e/smoke.spec.ts`). axe bắt được lỗi mà
linter tĩnh không thấy: tương phản màu thực tế, thứ tự heading, focus trap, ARIA sai ngữ cảnh.

**Vẫn cần kiểm tay (máy không thay được):**
- [ ] Duyệt toàn bộ luồng chính **chỉ bằng bàn phím** (Tab/Shift-Tab/Enter/Esc); focus thấy rõ.
- [ ] Thử một lượt với trình đọc màn hình (VoiceOver/TalkBack) cho luồng quan trọng nhất.
- [ ] `prefers-reduced-motion`: tắt animation lớn cho người chọn giảm chuyển động.

---

## 4. Kiểm thử mở rộng — E2E (Playwright) + coverage

Khung mô tả kim tự tháp (nhiều unit → ít integration → vài E2E) nhưng chỉ cấu hình Vitest (unit).
Bổ sung tầng đỉnh và một mức sàn cho đáy.

### E2E với Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps   # tải trình duyệt (bỏ qua nếu môi trường đã có)
```

File `playwright.config.ts` (đã kèm) định nghĩa **2 project**: `desktop` (Chromium) và
`mobile` (Pixel 5) → mọi luồng chính được kiểm trên cả hai kích thước, ép tinh thần mobile-first.

Viết E2E cho **đường đi quan trọng nhất** (đăng nhập → thao tác lõi → đạt mục tiêu), không cố phủ hết.
Mỗi E2E nên: (a) chạy được độc lập, tự dọn dữ liệu; (b) không phụ thuộc thứ tự; (c) dùng
`getByRole`/`getByLabel` (bền hơn selector CSS, lại ép a11y đúng).

### Ngưỡng coverage cho unit test

Đã thêm `coverage` vào `vitest.config.ts`. Coverage là *sàn an toàn tối thiểu*, **không phải mục tiêu** —
một số phủ cao mà toàn assert vô nghĩa thì vô dụng. Đặt sàn vừa phải (vd 70%) để bắt việc "quên viết test",
và luôn ưu tiên **chất lượng test ở đường đi quan trọng + trường hợp biên** hơn là con số.

```bash
npm install --save-dev @vitest/coverage-v8
```

Chạy: `npm run test:coverage`.

### Chiến lược dữ liệu test

- **Unit/integration:** dùng factory/fixture tạo dữ liệu tối thiểu cần cho ca test; không dùng dump production.
- **E2E:** chạy trên Supabase "staging" (Preview), **không bao giờ** chạm dữ liệu thật; mỗi test tự tạo & xóa.
- Cố định thời gian/ngẫu nhiên (mock `Date`, seed random) để test **tất định** (chạy lần nào cũng ra một kết quả).

---

## 5. UI/UX — checklist trạng thái & tương tác

Khung đã nói "xử lý trạng thái lỗi/rỗng/tải" — nâng thành checklist cụ thể để không sót.

**Mỗi màn hình hiển thị dữ liệu phải xử lý đủ 4 trạng thái:**
- [ ] **Đang tải:** skeleton hoặc spinner — *không* để màn trắng/nhảy layout.
- [ ] **Rỗng:** thông điệp rõ + hành động gợi ý ("Chưa có mục nào — Tạo mục đầu tiên").
- [ ] **Lỗi:** thông báo thân thiện (không phơi stack trace) + nút thử lại.
- [ ] **Thành công/có dữ liệu:** trạng thái bình thường.

**Form & hành động:**
- [ ] Validate inline, ngay cạnh ô lỗi; thông báo nói *cách sửa*, không chỉ "sai".
- [ ] Nút submit **disable + hiện loading** khi đang gửi → chặn double-submit.
- [ ] Sau hành động: phản hồi rõ (toast/redirect); thất bại thì giữ nguyên dữ liệu người dùng đã nhập.
- [ ] Hành động phá hủy (xóa) cần xác nhận; ưu tiên cho **hoàn tác (undo)** hơn là hỏi "chắc chưa?".

**Phản hồi & chuyển động:**
- [ ] Thao tác > ~400ms phải có chỉ báo tiến trình.
- [ ] Tôn trọng `prefers-reduced-motion`.
- [ ] Optimistic UI (nếu dùng): có **đường rollback** khi server trả lỗi (xem mục 6).

---

## 6. Chống lỗi logic (lỗi nghiệp vụ — type-checker KHÔNG bắt được)

Đây là loại bug nguy hiểm nhất: code *biên dịch sạch, type đúng*, nhưng **làm sai việc**.
TypeScript không cứu bạn ở đây — chỉ có suy nghĩ kỹ + test biên + review.

**Checklist rà soát logic (đối chiếu khi viết & khi review mọi logic nghiệp vụ):**

*Biên & rỗng:*
- [ ] Mảng/danh sách rỗng, đúng 1 phần tử, rất nhiều phần tử — đều xử lý đúng?
- [ ] `null`/`undefined`/chuỗi rỗng/số 0 — phân biệt rõ "không có" với "bằng 0/rỗng"? (`??` vs `||`).
- [ ] Off-by-one: vòng lặp, phân trang, cắt chuỗi, chỉ số mảng (`noUncheckedIndexedAccess` đã giúp một phần).

*Số & tiền:*
- [ ] Tiền tệ: **không** dùng số thực (float) — dùng số nguyên (cents) hoặc kiểu decimal. `0.1 + 0.2 !== 0.3`.
- [ ] Chia cho 0, tràn số, làm tròn — định nghĩa rõ hành vi.

*Thời gian:*
- [ ] Lưu & tính bằng **UTC**; chỉ đổi sang giờ địa phương khi hiển thị.
- [ ] Múi giờ, giờ mùa hè (DST), ranh giới ngày/tháng — test ca chuyển ngày.

*Bất đồng bộ & đồng thời:*
- [ ] **Race condition:** hai request/click đồng thời — kết quả vẫn đúng? (khóa, disable nút, idempotency).
- [ ] **Idempotency:** gửi lại cùng một thao tác (mạng chập chờn, người dùng bấm 2 lần) không tạo bản ghi trùng / tính tiền 2 lần.
- [ ] `await` đặt đúng chỗ; không có promise "trôi" (đã có `no-floating-promises`).
- [ ] Thứ tự phản hồi không đảm bảo: phản hồi cũ về sau không ghi đè dữ liệu mới (stale closure / race).

*Trạng thái & nhất quán:*
- [ ] Cập nhật một chỗ → mọi nơi phụ thuộc đồng bộ (một nguồn sự thật).
- [ ] Optimistic update có rollback khi server lỗi; UI không "kẹt" ở trạng thái lạc quan sai.
- [ ] Thao tác nhiều bước (giao dịch): hoặc xong cả, hoặc rollback cả — không để nửa vời.

> **Quy tắc:** với mỗi nhánh logic phức tạp, viết *ít nhất một test cho ca biên* trước khi coi là xong.
> Lỗi logic rẻ nhất khi bị một unit test bắt; đắt nhất khi người dùng thật gặp trên production.

---

## 7. Observability — Sentry (cụ thể hóa GĐ 6)

Khung nhắc "theo dõi lỗi (Sentry)" nhưng chưa hướng dẫn. Không có giám sát = mù trên production:
người dùng gặp lỗi, bạn không biết cho tới khi họ rời đi.

```bash
npx @sentry/wizard@latest -i nextjs
```

Wizard tự tạo config client/server/edge, gắn source map, và một route test. Sau khi cài:
- [ ] Đặt `SENTRY_DSN` qua biến môi trường (thêm vào `lib/env.ts`) — **không** hard-code.
- [ ] Tách môi trường (`environment: process.env.NODE_ENV`) để lọc lỗi dev/staging/prod riêng.
- [ ] Bật cảnh báo (email/Slack) cho lỗi mới hoặc tần suất tăng đột biến.
- [ ] Lọc dữ liệu nhạy cảm khỏi báo cáo lỗi (`beforeSend`) — đừng gửi token/PII lên Sentry.

> Tối thiểu cần: bắt lỗi chưa xử lý ở cả client lẫn server. Thêm performance tracing sau nếu cần.

---

## 8. Quản lý dự án — issue template & CHANGELOG

**Issue templates** (`.github/ISSUE_TEMPLATE/`, đã kèm): ép mọi báo lỗi/đề xuất tính năng có đủ
thông tin (các bước tái hiện, kỳ vọng vs thực tế, tiêu chí chấp nhận) → gắn với **Definition of Ready**.

**CHANGELOG.md** (đã kèm, theo chuẩn *Keep a Changelog*): ghi lại thay đổi theo phiên bản cho con người đọc.
Vì commit đã theo *conventional commits*, có thể sinh CHANGELOG tự động sau (`standard-version`/`changesets`),
nhưng bản viết tay vẫn giá trị cho mục "Unreleased".

**Nhịp nhìn lại (với người làm một mình):** cuối mỗi đợt/sprint, cập nhật `PROGRESS.md` và tự hỏi 3 câu:
gì chạy tốt, gì vướng, lần sau đổi gì. Ghi nợ kỹ thuật vào `PROGRESS.md` để không quên quay lại dọn.



===============================================================================

# PHẦN 3 — Hệ thống Theme (Dark blue + Light)

> Cụ thể hóa yêu cầu "design tokens nhất quán" của KHUNG 1 (GĐ 2) thành một hệ thống theme dùng được ngay.
> **Mặc định: nền Dark blue. Có thêm chế độ Light.** Người dùng tự chuyển; lựa chọn được nhớ lại.
> File tokens kèm theo: `styles/theme.css` (ở gốc repo).

## Nguyên tắc
- **Dùng biến (design tokens), không hard-code màu** trong component → một nguồn sự thật, đổi theme là cả app đổi.
- **Tương phản đạt WCAG AA** ở *cả hai* chế độ (đã chọn màu trong `styles/theme.css` để đạt; vẫn kiểm lại bằng axe — xem Nhóm 2).
- **Không "nháy" theme sai khi tải trang** (no flash of wrong theme): đặt theme *trước khi* trang vẽ.
- **Mặc định Dark blue**, kể cả khi máy người dùng đang để Light (trừ khi bạn bật khối tùy chọn trong `theme.css`).

## Bước 1 — Nạp tokens

Import `styles/theme.css` ở layout gốc (Next App Router: `app/layout.tsx` hoặc đầu `app/globals.css`):

```css
/* app/globals.css */
@import 'tailwindcss';
@import '../styles/theme.css';
```

## Bước 2 — Nối tokens vào Tailwind (v4)

Tailwind v4 cấu hình theme bằng CSS. Thêm khối `@theme inline` để các tiện ích Tailwind
(`bg-background`, `text-foreground`, `border-border`...) trỏ tới biến *chạy theo theme*:

```css
/* app/globals.css — sau hai dòng @import ở trên */
@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-foreground: var(--foreground);
  --color-muted-foreground: var(--muted-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger: var(--danger);
}
```

> Dùng `@theme inline` (không phải `@theme`) để Tailwind sinh ra `var(--background)` thay vì "nướng cứng"
> giá trị màu — nhờ vậy đổi `data-theme` là màu đổi theo. (Tailwind v3: thay bằng `theme.extend.colors`
> trỏ `'background': 'var(--background)'` trong `tailwind.config`.)

Giờ viết UI bằng token, ví dụ:
```tsx
<div className="bg-background text-foreground">
  <button className="bg-primary text-primary-foreground rounded-lg px-4 py-2">Lưu</button>
</div>
```

## Bước 3 — Chặn "nháy" theme (no-flash)

Theme phải được đặt **trước khi** React hydrate. Thêm script nhỏ chạy đồng bộ trong `<head>`:

```tsx
// app/layout.tsx — đặt trong <head>, trước nội dung
const noFlashTheme = `
  (function () {
    try {
      var t = localStorage.getItem('theme');     // 'light' | 'dark' | null
      if (t === 'light' || t === 'dark') {
        document.documentElement.setAttribute('data-theme', t);
      }
      // không có lựa chọn đã lưu → để mặc định Dark blue (không set gì)
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

> `dangerouslySetInnerHTML` ở đây an toàn vì nội dung là **hằng số do ta viết**, không phải dữ liệu người dùng.

## Bước 4 — Nút chuyển theme

```tsx
'use client';
import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark'); // mặc định Dark blue

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
      className="border-border text-foreground rounded-lg border px-3 py-2"
    >
      {theme === 'dark' ? '☀️ Sáng' : '🌙 Tối'}
    </button>
  );
}
```

## Checklist khi làm UI có theme
- [ ] Không hard-code mã màu (`#fff`, `bg-blue-500`...) cho nền/chữ — dùng token (`bg-background`, `text-foreground`...).
- [ ] Thử **cả hai** chế độ: không có chữ "tàng hình", không mất viền, ảnh/biểu đồ vẫn đọc được.
- [ ] Tương phản đạt **AA** ở cả hai chế độ (axe + kiểm tay phần tử quan trọng).
- [ ] Viền focus (`--ring`) thấy rõ ở cả hai chế độ (a11y bàn phím).
- [ ] Không "nháy" theme khi tải lại trang (đã có script no-flash).
- [ ] Lựa chọn theme được **nhớ** giữa các lần truy cập (localStorage).


===============================================================================

# PHẦN 4 — Năng lực nâng cao (i18n · PWA · Sentry · SEO · Analytics)

> Các năng lực giúp template **đa dụng** và sẵn sàng production. Mỗi mục kèm gói + **phiên bản đã xác minh
> (2026-06-29)** và file drop-in (nếu có). Bật mục nào tùy nhu cầu dự án (KHUNG 3 PHẦN A sẽ nhắc bạn quyết).
> Chạy theo nguyên tắc research-first: **xác minh lại phiên bản** khi khởi tạo.

| Năng lực | Gói (phiên bản 2026-06-29) | File drop-in kèm theo |
|----------|----------------------------|------------------------|
| Đa ngôn ngữ (i18n) | `next-intl` 4.x | `i18n/request.ts`, `messages/*.json` |
| PWA / offline | `@serwist/next` 9.x + `serwist` | `app/sw.ts`, `app/manifest.ts` |
| Theo dõi lỗi | `@sentry/nextjs` 10.x | (tạo bằng wizard) |
| SEO | (Next có sẵn) | `app/sitemap.ts`, `app/robots.ts` |
| Trang lỗi thân thiện | (Next có sẵn) | `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` |
| Analytics | (chọn theo nhu cầu — mục 7) | (đặt khóa qua env) |

---

## 1. Đa ngôn ngữ — next-intl

```bash
npm install next-intl
```

File `i18n/request.ts` (đã kèm) chọn locale theo cookie `locale`, mặc định `vi`, fallback `en`.
Thông điệp ở `messages/vi.json`, `messages/en.json` (đã kèm).

**Nối plugin vào `next.config`** (xem mục 6 — cấu hình tổng hợp). `createNextIntlPlugin()` tự tìm `i18n/request.ts`.

**Bọc Provider ở `app/layout.tsx`:**

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} data-theme="dark" suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Dùng trong component:**
```tsx
import { useTranslations } from 'next-intl';
const t = useTranslations('home');
return <h1>{t('title')}</h1>;
```

**Đổi ngôn ngữ:** đặt cookie `locale` (qua server action) rồi `router.refresh()`. Định dạng ngày/số/tiền
dùng `useFormatter` của next-intl để đúng theo locale.

---

## 2. PWA / offline — Serwist (kế nhiệm next-pwa)

```bash
npm install @serwist/next && npm install --save-dev serwist
```

File `app/sw.ts` (đã kèm) là service worker. Nối vào `next.config` bằng `withSerwistInit` (mục 6).

- Mặc định `@serwist/next` **tự đăng ký** service worker (không cần code thêm).
- **Tắt ở dev** (`disable: NODE_ENV === 'development'`) để tránh kẹt cache khi phát triển.
- ⚠️ **Serwist chưa hỗ trợ Turbopack** (bundler mặc định của Next 16). Để thử PWA ở dev, chạy
  `next dev --webpack`. Bản production (`next build`) không bị ảnh hưởng.
- Tạo icon `public/icon-192.png` và `public/icon-512.png` cho `app/manifest.ts`.

---

## 3. Theo dõi lỗi — Sentry

Dùng **wizard chính thức** (tự tạo file đúng phiên bản, tránh viết tay sai):

```bash
npx @sentry/wizard@latest -i nextjs
```

Wizard sẽ tạo/sửa: `instrumentation.ts`, `instrumentation-client.ts`, cấu hình server/edge, và **bọc
`next.config` bằng `withSentryConfig`**. Sau khi cài:
- [ ] Đặt `SENTRY_DSN` qua biến môi trường (đã khai trong `lib/env.ts` + `.env.example`) — không hard-code.
- [ ] `environment: process.env.NODE_ENV` để tách lỗi dev/staging/prod.
- [ ] Lọc dữ liệu nhạy cảm trong `beforeSend` (đừng gửi token/PII).
- [ ] Trong `app/error.tsx`/`global-error.tsx`: gọi `Sentry.captureException(error)` (thay `console.error`).
- [ ] Bật cảnh báo (email/Slack) cho lỗi mới / tần suất tăng.

---

## 4. SEO

- **Metadata:** dùng `export const metadata` (hoặc `generateMetadata`) trong `layout.tsx`/`page.tsx`:
  `title`, `description`, `openGraph`, `twitter`, `metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL!)`.
- **sitemap & robots:** `app/sitemap.ts` + `app/robots.ts` (đã kèm) — thêm các route quan trọng vào sitemap.
- **Dữ liệu có cấu trúc (JSON-LD):** nhúng `<script type="application/ld+json">` cho trang sản phẩm/bài viết nếu cần.
- Đặt `NEXT_PUBLIC_SITE_URL` cho cả Production và Preview.

---

## 5. Trang lỗi thân thiện (đã kèm)

`app/not-found.tsx` (404), `app/error.tsx` (lỗi cấp route), `app/global-error.tsx` (lỗi root layout).
Không phơi chi tiết kỹ thuật ra người dùng; log để theo dõi. Dùng token theme nên hợp cả Dark blue lẫn Light.

---

## 6. Cấu hình `next.config` tổng hợp

create-next-app tạo sẵn `next.config.ts` — **sửa** nó để bọc các plugin bạn dùng (bỏ plugin không cần):

```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import withSerwistInit from '@serwist/next';
import { withSentryConfig } from '@sentry/nextjs';

const withNextIntl = createNextIntlPlugin();

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

const nextConfig: NextConfig = {
  // cấu hình Next của bạn ở đây
};

// Thứ tự bọc: Sentry ngoài cùng. Bỏ lớp nào không dùng.
export default withSentryConfig(withSerwist(withNextIntl(nextConfig)), {
  silent: !process.env.CI,
  // org/project: đặt qua biến môi trường hoặc để wizard điền.
});
```

> Nếu chỉ dùng một phần (vd chỉ i18n), chỉ bọc lớp đó: `export default withNextIntl(nextConfig);`.

---

## 7. Analytics (GĐ 7 — đo hành vi người dùng thật)

Khung yêu cầu "Analytics đã cài" trước khi ra mắt nhưng để mở **nhà cung cấp** — vì lựa chọn phụ thuộc
nhu cầu (quyền riêng tư, ngân sách, độ sâu phân tích). Chọn theo **research-first** (KHUNG 3 PHẦN A mục 14).

**Ứng viên (cân nhắc theo nhu cầu — xác minh lại lúc dùng):**

| Lựa chọn | Hợp khi | Lưu ý |
|----------|---------|-------|
| **Vercel Web Analytics** (`@vercel/analytics`) | đã deploy Vercel, cần nhanh & nhẹ | tích hợp 1 dòng; không cookie; số liệu cơ bản |
| **Plausible / Umami** | ưu tiên **quyền riêng tư**, không cookie, GDPR nhẹ | nhẹ; Umami tự host được |
| **PostHog** | cần **product analytics** sâu (funnel, session, feature flag) | nặng hơn; cẩn thận PII |
| **GA4** | cần hệ sinh thái Google/quảng cáo | cần cookie consent; phức tạp về quyền riêng tư |

**Nguyên tắc bất biến khi gắn analytics:**
- [ ] Đặt khóa/ID qua **biến môi trường** (vd `NEXT_PUBLIC_ANALYTICS_ID`) — không hard-code; thêm vào `lib/env.ts` + `.env.example`.
- [ ] **Quyền riêng tư:** nếu thu thập dữ liệu cá nhân/cookie → cần **consent banner** + cập nhật privacy policy
      (KHUNG 3 PHẦN A mục 6: GDPR / Nghị định 13 VN).
- [ ] **Không gửi PII** (email, token) vào sự kiện analytics.
- [ ] Tôn trọng `Do Not Track` / lựa chọn từ chối của người dùng nếu khả thi.

**Ví dụ nhanh (Vercel Analytics):**
```bash
npm install @vercel/analytics
```
```tsx
// app/layout.tsx
import { Analytics } from '@vercel/analytics/next';
// ... <body>{children}<Analytics /></body>
```

> Phân biệt với **observability** (Sentry, mục 3): Sentry = "có lỗi gì"; analytics = "người dùng làm gì".
> Cả hai đều cần trước/ngay khi ra mắt để không "mù" trên production.

---

## Phiên bản đã xác minh (2026-06-29 — xác minh lại khi khởi tạo)

`next-intl` 4.x · `@serwist/next` 9.x · `@sentry/nextjs` 10.x · Next 16.x · Node 22 LTS.
Cách chọn & xác minh phiên bản: xem `KHUNG-3` (PHẦN B, quy tắc chọn phiên bản).
