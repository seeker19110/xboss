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
| Sổ tay thuật ngữ (`CONTEXT.md`) | Người dùng & AI trôi dạt từ vựng → đặt tên/hội thoại không nhất quán | Xuyên suốt, nhất là GĐ 0–1 |
| Tách nhật ký đợt việc khỏi `PROGRESS.md` (`docs/changelog/`) | Nhiều PR song song cùng sửa đầu `PROGRESS.md` → xung đột git lặp lại | Xuyên suốt |
| Đồng bộ trạng thái duyệt ngoài git về file trong repo | Cổng CI/merge đọc trạng thái duyệt lệch với nguồn ngoài git (dashboard/CSDL) | GĐ 4 — mọi merge |

---

## 1. Xác thực biến môi trường (file `lib/env.ts`)

Ví dụ đặt tại `lib/env.ts` (hồ sơ Node/TS — hồ sơ khác đổi tên file cho khớp). Cần cài Zod nếu chưa có:

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

DoR đầy đủ (9 mục) nằm ở **`docs/framework/standard-delivery.md` §5 "Definition of Ready"** — nguồn khai duy nhất, không chép lại ở đây.

Vì sao có DoR: đối trọng với Definition of Done (khi nào một việc *xong*) — DoR là khi nào một việc *sẵn sàng bắt đầu*, để không lao vào việc còn mơ hồ rồi phải làm lại. Có thể yêu cầu AI kiểm DoR trước mỗi task: chưa "ready" thì hỏi cho rõ trước, không code ngay.

---

## 8. Sổ tay thuật ngữ nghiệp vụ (`CONTEXT.md`)

Vấn đề: người dùng và AI dần trôi dạt sang từ vựng khác nhau cho cùng một khái niệm ("đơn hàng" vs "giao dịch" vs "order"), khiến code đặt tên không nhất quán và hội thoại vòng vo. `CONTEXT.md` là một **bảng thuật ngữ ngắn** — không phải spec, không phải sổ tay quyết định (đó là việc của ADR) — chỉ ghi *khái niệm nghiệp vụ này gọi là gì*.

**Nguyên tắc:**
- **Tạo lười.** Không tự sinh file rỗng lúc khởi tạo dự án; chỉ tạo `CONTEXT.md` ở gốc repo khi thuật ngữ đầu tiên cần chốt (thường trong lúc chạy `/grill` hoặc `/consult`).
- **Có chủ kiến.** Nhiều từ cùng nghĩa → chọn một từ chuẩn, liệt kê các từ còn lại vào `_Tránh dùng_`.
- **Ngắn gọn.** Mỗi thuật ngữ 1–2 câu, định nghĩa nó **LÀ GÌ**, không phải nó làm gì.
- **Chỉ thuật ngữ đặc thù dự án.** Khái niệm lập trình chung (timeout, retry, cache...) không thuộc về đây dù dùng nhiều.
- **Cập nhật ngay lúc chốt**, không dồn cuối phiên — nếu AI phát hiện người dùng dùng từ mâu thuẫn với `CONTEXT.md` đã có, phải **nêu ra ngay** trước khi tiếp tục (tương tự tinh thần "chủ động góp ý" ở mục 2).

**Định dạng:**
```md
# CONTEXT.md

## Ngôn ngữ nghiệp vụ

**Đơn hàng**:
Một yêu cầu mua hàng đã được khách xác nhận, gắn với đúng một khách hàng.
_Tránh dùng_: giao dịch, order, phiếu mua

**Khách hàng**:
Cá nhân hoặc tổ chức đặt đơn hàng.
_Tránh dùng_: người dùng, client, tài khoản
```

**Dự án nhiều module/bounded-context riêng biệt** (monorepo, nhiều domain rõ rệt): dùng `CONTEXT-MAP.md` ở gốc, trỏ tới một file `CONTEXT.md` đặt riêng trong thư mục từng module; dự án thường (một domain) chỉ cần một `CONTEXT.md` ở gốc.

→ **Gắn vào khung:** `/grill` (xem `.claude/commands/grill.md`) cập nhật `CONTEXT.md` ngay khi một thuật ngữ chốt trong lúc phỏng vấn; `/consult` và mọi skill khác nên đọc `CONTEXT.md` (nếu có) trước khi đặt tên biến/hàm/tính năng để khớp ngôn ngữ đã chốt.

---

## 9. Tách nhật ký đợt việc khỏi `PROGRESS.md` (thư mục `docs/changelog/`)

Sự cố thật: nhiều PR chạy song song thường cùng sửa đúng phần đầu `PROGRESS.md` — mục "Giai đoạn hiện tại", các dòng "Mốc ..." — vì mỗi PR đều muốn ghi lại việc mình vừa làm. Kết quả là xung đột git ở đúng chỗ đó, lặp lại hầu như mỗi lần merge, dù các PR không đụng chung code.

**Quy ước:**
- `PROGRESS.md` **chỉ sửa TẠI CHỖ** phần "Giai đoạn hiện tại" — thay thế nội dung cũ bằng nội dung mới, **không chèn thêm dòng lịch sử dài** vào đó qua từng PR.
- Nhật ký chi tiết của **một đợt việc/PR** (bối cảnh, quyết định đã ra, file đã đổi) ghi ra một file riêng:
  `docs/changelog/<số thứ tự 4 chữ số>-<ngày YYYY-MM-DD>-<slug>.md`

  Ví dụ: `docs/changelog/0012-2026-09-19-them-xac-thuc-2fa.md` (số minh họa, chưa tồn tại trong repo khung — file thật sinh ở dự án đích khi cần).

- `PROGRESS.md` chỉ cần **trỏ link tới file đó bằng một dòng ngắn**, không chép lại nội dung:
  ```md
  ## Giai đoạn hiện tại
  GĐ 6 — Kiểm thử & tinh chỉnh. Đợt việc gần nhất: xem docs/changelog/0012-2026-09-19-them-xac-thuc-2fa.md.
  ```

**Lợi ích:** mỗi PR chỉ tạo/động vào **một file changelog riêng của nó** (file mới, không ai khác đụng vào) — phần "Giai đoạn hiện tại" của `PROGRESS.md` vẫn có thể đổi, nhưng tần suất và độ dài thay đổi giảm hẳn so với việc dồn cả nhật ký chi tiết vào đó, nên xung đột git giảm đáng kể.

→ **Gắn vào khung:** áp dụng cùng lúc với quy tắc "Cập nhật `PROGRESS.md` NGAY sau khi quay về `main`" ở mục 8 (Quy ước Git) của `CLAUDE.md` — cập nhật ở đây nghĩa là thay tại chỗ + trỏ link, không phải chèn thêm dòng.

---

## 10. Đồng bộ trạng thái duyệt ngoài git về file trong repo

Sự cố thật: khi một quy trình duyệt/chấp thuận (review, approval) được thao tác ở nơi **khác ngoài git** — một bảng trong CSDL, một dashboard nội bộ, một form ngoài — mà cổng CI/merge lại đọc trạng thái từ một file trong repo, hai nguồn trạng thái dễ lệch nhau: CSDL nói "đã duyệt", repo nói "còn draft" (hoặc ngược lại), và cổng merge dựa vào file cũ nên quyết định sai.

**Nguyên tắc:**
- Nếu một trạng thái duyệt được thao tác ở ngoài git, **phải có một bước đồng bộ** (script hoặc CI job) ghi trạng thái đó **về một file trong repo**.
- File trong repo đó — **không phải nguồn ngoài** — là **nguồn sự thật cuối cùng** mà cổng CI/merge đối chiếu. Cổng không bao giờ gọi thẳng ra nguồn ngoài để quyết định merge hay không.
- Bước đồng bộ mặc định chạy ở **chế độ an toàn (dry-run/xem trước)** trước khi ghi thật vào file, để tránh ghi nhầm trạng thái do lỗi kết nối hay dữ liệu tạm thời từ nguồn ngoài.
- Sau khi ghi, có **bước tự kiểm lại** (CI chạy lại một lần) để xác nhận file trong repo đang khớp đúng với nguồn ngoài tại thời điểm ghi — phát hiện sớm trường hợp đồng bộ nửa chừng hoặc ghi sai.
- Không có công cụ cụ thể bắt buộc — đây là nguyên tắc chung; dự án tự chọn cách triển khai (webhook, script định kỳ, CI job thủ công...) theo đúng stack đang dùng.

→ **Gắn vào khung:** áp dụng khi dự án có quy trình duyệt nằm ngoài git (ví dụ: duyệt pháp lý, duyệt nội dung, duyệt compliance) nhưng vẫn muốn cổng merge tự động của Git/CI (mục 5–7 của `CLAUDE.md`) tôn trọng kết quả duyệt đó.

===============================================================================
