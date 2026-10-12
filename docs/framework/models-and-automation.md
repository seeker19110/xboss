# MODEL & TỰ ĐỘNG — chọn model, hai pha lập kế hoạch/thực thi, chế độ chạy tự động

> **Một file duy nhất** cho bốn việc liên quan chặt: (1) **chọn model** Claude chạy khung theo quy mô & rủi ro; (2) **hai pha lập kế hoạch/thực thi** tối ưu token (ADR-0006, ADR-0007); (3) **kỷ luật vận hành** phiên (plan một lần, ngữ cảnh gọn); (4) **chế độ chạy tự động** (sơ đồ + thành phần đã bake).
> Nói về model **chạy Claude Code để làm dự án theo khung này** — KHÔNG phải chọn model *bên trong* sản phẩm bạn xây (cái đó xem kỹ năng `claude-api`).
> Đọc khi: bắt đầu/đổi quy mô dự án, cân nhắc chi phí–chất lượng, hoặc muốn hiểu nhanh hệ thống tự động.
>
> **`/model opusplan` không còn được CLI hỗ trợ (ADR-0007).** File này không còn giả định
> có một alias/chế độ tự-chuyển-model-theo-pha nào — chọn model cho từng pha là thao tác **thủ công**
> (`/model <model-id>`), mô tả ở mục 1 dưới đây.

---

## 0. TL;DR — dùng ngay

```bash
# Từ repo khung, copy cấu hình sang dự án của bạn:
bash copy-framework.sh /đường-dẫn/tới/dự-án
```
Script copy `.claude/settings.json` (model tiêu chuẩn: Sonnet 5) + hooks + agents + `scripts/` theo mục `[scripts]` của `copy-framework.manifest` + 2 file `.example.sh` **thẳng** vào dự án; file cấu hình stack khác vào `_framework-dropins/` để tự merge. Mở phiên Claude Code → khi cần lập kế hoạch việc lớn, chủ động `/model` sang model cao cấp nhất đang sẵn có trước (mục 1).

**Chọn nhanh theo quy mô:**

| Quy mô dự án | Nên dùng | Cách đặt |
|---|---|---|
| **Nhỏ** (script, landing, prototype <5k LOC) | **Sonnet 5** xuyên suốt | `"model": "claude-sonnet-5"` |
| **Tầm trung → lớn** (10–50k+ LOC) | **Sonnet 5** thực thi + **chuyển tay sang model cao cấp nhất sẵn có** cho pha lập kế hoạch | `/model claude-opus-5-5` (hoặc tương đương) lúc plan, quay lại Sonnet 5 lúc code |
| **Rất phức tạp / rủi ro cực cao** | như trên + nâng riêng lúc cần | `/model claude-fable-5-1` ở ca khó nhất |

> **Nguyên tắc vàng:** dùng model **rẻ nhất vẫn đạt chất lượng** cho phần lớn công việc; **nâng cấp có chọn lọc** đúng các mốc độ khó/rủi ro thật (CLAUDE.md §2, ADR-0010 §4); dừng và hỏi chỉ theo CLAUDE.md §9.

---

## 1. Hai pha lập kế hoạch/thực thi — vì sao tối ưu token (ADR-0006, ADR-0007)

Khung **không còn dựa vào một chế độ CLI tự-chuyển-model** (`opusplan` đã ngừng hỗ trợ). Thay vào
đó là một **chính sách hai pha làm bằng tay**, cùng ý tưởng nhưng không phụ thuộc tên lệnh cụ thể:

| Pha | Việc | Model | Cách vào |
|---|---|---|---|
| **Lập kế hoạch** (trước tác vụ tự động/lập kế hoạch lớn) | Quyết định kiến trúc, research-first, chia việc | **Model cao cấp nhất đang sẵn có** (không giới hạn một hãng — ADR-0006) | `/model <model-id>` thủ công trước khi vào plan mode |
| **Thực thi** | Code, sửa file hằng ngày | **Model tiêu chuẩn của dự án** (mặc định repo: Sonnet 5) | Quay lại bằng `/model claude-sonnet-5` (hoặc để nguyên nếu chưa đổi) |
| **Việc cơ học** (tìm kiếm, đọc file, xác minh phiên bản) | subagent | Haiku 4.5 | Giao subagent (`lookup`, `version-check`) |

→ Chỉ trả giá model cao khi thực sự cần suy nghĩ ở pha lập kế hoạch; phần còn lại chạy Sonnet/Haiku.

**So với dùng một model mạnh cho tất cả:**
- **Fable 5.1 thuần** ($10/1M): mọi token — kể cả đọc file, format, tìm kiếm — tính giá cao nhất → **lãng phí ~60–70%** ("dao mổ trâu thịt gà").
- **Opus 5.5 thuần** ($4/1M): tốt hơn Fable thuần, nhưng vẫn trả giá Opus cho cả việc cơ học Haiku làm được.
- **Hai pha thủ công**: chỉ trả giá cao ở pha lập kế hoạch → **rẻ hơn Opus thuần, rẻ hơn nhiều so với Fable thuần**, mà vẫn giữ chất lượng đúng chỗ cần — đánh đổi duy nhất so với `opusplan` cũ là phải tự gõ `/model` để chuyển pha, không tự động trong một phiên.

**Bảng giá tham khảo (nguồn platform.claude.com/docs/en/about-claude/pricing, 2026-09-23 — xác minh lại trước khi chốt ngân sách; máy đọc: `scripts/model-rates.json`):**

| Model | Ngữ cảnh | Giá /1M (in/out) | So Sonnet 5 |
|---|---|---|---|
| Haiku 4.5 | 200K | $1 / $5 | 0.5× (rẻ) |
| Sonnet 5 | 1M | $2 / $10 | 1× (baseline) |
| Opus 5.5 | 1M | $4 / $20 | 2× |
| Fable 5.1 | 1M (out 128K) | $10 / $50 | 5× |

> **Lưu ý bản chất:** hai pha đổi model theo **thao tác tay** (plan ⇄ execution), KHÔNG "đoán độ khó từng câu" và KHÔNG tự chuyển lại khi hết plan mode — người dùng phải tự `/model` quay về. Việc phân tách main (đắt) ↔ subagent (rẻ) mới là cơ chế tự động thực sự và không đổi.

---

## 2. Chọn model theo quy mô & rủi ro (các bước quyết định)

### Bước 1 — Xác định quy mô & loại dự án
Loại: web / mobile / backend-API / desktop / CLI-thư viện / data-ML / game / blockchain / monorepo (xem KHUNG-3 PHẦN A0). Quy mô: số màn hình/endpoint, LOC dự kiến, số người dùng, thời gian dự án.

### Bước 2 — Chấm 4 yếu tố rủi ro (mỗi "có" = +1)
1. **Dữ liệu/logic nhạy cảm?** (thanh toán, dữ liệu người dùng thật, quyền phức tạp)
2. **Kiến trúc nhiều đánh đổi?** (chọn giữa nhiều phương án lớn, khó đảo ngược)
3. **Migration schema phá vỡ / breaking change lan rộng?**
4. **Yêu cầu mơ hồ, nhiều cách hiểu, phạm vi dễ phình?**

### Bước 3 — Suy ra model mặc định
- **0–1 điểm** → **Sonnet 5** xuyên suốt cho toàn dự án.
- **2 điểm** → **Sonnet 5** thực thi + **chuyển tay sang Opus 5.5** đúng các mốc dính rủi ro (pha lập kế hoạch).
- **3–4 điểm** → như trên + cân nhắc **Fable 5.1** cho quyết định kiến trúc khó nhất / GĐ 0–2.

### Bước 4 — Áp chiến lược lai (tầm trung trở lên)
Không còn tự động theo chế độ — tự chuyển tay tại mốc:

| Giai đoạn / công việc | Model |
|---|---|
| GĐ 0–2: ý tưởng, chọn công nghệ, thiết kế kiến trúc, viết ADR | **Opus 5.5** (Fable 5.1 nếu rất phức tạp) — `/model` trước khi vào pha này |
| GĐ 3–7: code tính năng, UI/UX, test, refactor, docs | **Sonnet 5** — `/model claude-sonnet-5` khi quay lại |
| Cổng trước MERGE: rà bảo mật, migration, breaking change | **Opus 5.5** |
| GĐ 8: xử lý sự cố production, post-mortem; audit lớn | **Opus 5.5** |

### Bước 5 — Ghi quyết định
Ghi model đã chọn + lý do vào **PROGRESS.md** (hoặc ADR nếu coi là quyết định vận hành đáng lưu), kèm **quy tắc nâng cấp** để nhất quán qua các phiên.

## 2b. Chọn planner đa nhà cung cấp (ADR-0006, ADR-0007)

**Trước khi chạy tác vụ tự động/lập kế hoạch lớn**, đừng mặc định "luôn Opus thuần" — chọn model
cao cấp nhất **thực sự sẵn có** (CLI cục bộ đã cài + đăng nhập) cho việc đó, dựa trên 4 yếu tố rủi
ro ở Bước 2 trên:

1. Tra ứng viên: `scripts/subagent-dispatch.sh --tier planning`. Kết quả liệt kê ứng viên đa nhà
   cung cấp (Claude, và các hãng khác nếu đã có nhánh CLI thật) kèm cờ `verify_before_use`.
2. **Không còn một alias mặc định cố định** (`opusplan` đã ngừng hỗ trợ — ADR-0007): tự `/model`
   sang model cao cấp nhất sẵn có trước khi vào việc lập kế hoạch, và tự `/model` quay lại model
   tiêu chuẩn (Sonnet 5) khi xong.
3. Đổi sang hãng khác chỉ khi: Claude không khả dụng lúc đó (hết quota, CLI lỗi), hoặc việc rơi
   đúng thế mạnh đã ghi nhận của hãng khác (vd Gemini qua Hermes cho việc cần ngữ cảnh cực dài, đã
   dùng thật ở `/maintain` — xem `maintain-run.sh`).
4. Model đánh dấu `verify_before_use: true` → **bắt buộc** xác minh bằng subagent `version-check`
   hoặc nguồn sống trước khi dùng thật; không tự suy đoán phiên bản (CLAUDE.md §4).
5. Ghi lại lựa chọn + lý do vào PROGRESS.md (giống Bước 5 ở §2), kèm hãng/CLI đã dùng nếu khác
   Claude — để phiên sau biết vì sao lệch mặc định.

Sau khi planner đã lên kế hoạch (dù trên hãng nào), việc phân công Tầng 3 tra tiếp theo cấp năng
lực tương ứng (`--tier complex|spec|standard|mechanical`) — không suy luận "route X luôn là model
Y". Chi tiết luật cứng theo tầng + ví dụ dispatch: `docs/framework/orchestration-3-tier.md` mục
"Chọn đa nhà cung cấp".

### Ba kịch bản mẫu
- **A. Tầm trung, không nhạy cảm** (blog/CMS, dashboard CRUD) → **Sonnet 5** xuyên suốt, không cần chuyển pha.
- **B. Tầm trung có 1–2 điểm nhạy cảm** (SaaS nhỏ có thanh toán) → **Sonnet 5** thực thi + chuyển tay **Opus 5.5** cho luồng thanh toán, migration, rà bảo mật, sự cố.
- **C. Lớn/phức tạp** (nhiều dịch vụ, realtime, dữ liệu nhạy cảm) → **Sonnet 5** thực thi + chuyển tay **Fable 5.1** cho quyết định kiến trúc khó nhất (GĐ 0–2) và phân tích breaking change diện rộng.

---

## 3. Năng lực model theo từng khung/kỹ năng

Bảng dưới xếp hạng **model Claude** (dùng trong Claude Code). Cần so sánh xuyên nhà cung cấp
(ADR-0006, §2b) → dùng `scripts/subagent-dispatch.sh --tier <cấp>` thay vì suy diễn từ bảng này.
Dùng để chọn model **đúng đầu việc**, không phải một model cho cả dự án.
**Thang:** ✅✅ xuất sắc · ✅ đủ tốt · 🟡 làm được nhưng nên soát kỹ / cân nhắc nâng · ❌ không nên giao.

| Khung / Kỹ năng | Trọng tâm | Haiku 4.5 | Sonnet 5 | Opus 5.5 | Fable 5.1 |
|---|---|:--:|:--:|:--:|:--:|
| **KHUNG-1** — 9 giai đoạn + tiêu chuẩn | Kỷ luật giai đoạn, cổng, DoD | 🟡 | ✅ | ✅✅ | ✅✅ |
| **KHUNG-2** — luật AI + chống ảo giác | Tuân luật, không bịa API, đọc file thật | 🟡 | ✅ | ✅✅ | ✅✅ |
| **KHUNG-3** — chọn công nghệ (research-first) | Xác minh phiên bản, trade-off, đề xuất | ❌ | 🟡 | ✅ | ✅✅ |
| **`/consult`** — tư vấn phát triển | Bóc yêu cầu mơ hồ, đề xuất, đánh đổi | 🟡 | ✅ | ✅✅ | ✅✅ |
| **`/bootstrap`** — khởi tạo dự án mới | Dựng nền, cấu hình hàng rào | 🟡 | ✅ | ✅ | ✅ |
| **`/ui-ux`** — thiết kế UI/UX | Design tokens, mobile-first, WCAG AA, 4 trạng thái | 🟡 | ✅✅ | ✅✅ | ✅✅ |
| **`/gate`** — cổng commit/merge | Chạy build/lint/test, đọc diff, rà rác/bí mật | ✅ | ✅✅ | ✅✅ | ✅✅ |
| **`/adr`** — quyết định kiến trúc | So sánh phương án, hệ quả dài hạn | ❌ | 🟡 | ✅✅ | ✅✅ |
| **`/audit-optimize`** — audit & tối ưu | Đo baseline, refactor không đổi hành vi | 🟡 | ✅ | ✅✅ | ✅✅ |
| **`/incident`** — xử lý sự cố production | Giảm thiệt hại, chẩn đoán, post-mortem | ❌ | 🟡 | ✅✅ | ✅✅ |
| **`/audit-full`** — audit toàn diện 12 nhóm | Quét có bằng chứng, xếp ưu tiên toàn cục | ❌ | ✅ | ✅✅ | ✅✅ |
| **`/completion`** — hoàn thiện dự án | Kế hoạch hoàn thiện, vòng hội tụ, Definition of Complete | ❌ | 🟡 | ✅✅ | ✅✅ |
| **quality-supplements** — chống lỗi logic, race/idempotency | Ca biên, tiền tệ, async | 🟡 | 🟡 | ✅✅ | ✅✅ |
| **existing-project-adoption (brownfield)** | Đọc repo, suy ra stack thật, nâng tăng dần | 🟡 | ✅ | ✅✅ | ✅✅ |

**Đọc theo nhóm:**
- **Việc code/UI/cổng thường ngày** → **Sonnet 5 đủ tốt → xuất sắc**, chi phí thấp — ngựa thồ.
- **Việc lý luận sâu / rủi ro cao** (KHUNG-3, `/adr`, `/incident`, chống lỗi logic, audit lớn) → **Opus 5.5 xuất sắc; Sonnet chỉ 🟡** → chuyển tay sang Opus, hoặc Fable ở ca khó nhất.
- **Việc đơn giản, đơn lẻ** → Haiku gánh phần cổng/kiểm tra máy móc; **không** giao phần lý luận.
- **Fable 5.1** hầu như luôn ✅✅ nhưng **chênh lệch đáng tiền** chỉ ở nhóm lý luận sâu; việc thường ngày không hơn Sonnet/Opus đủ để bù chi phí gấp 2–3 lần.

---

## 4. Effort & thinking theo tác vụ (tối ưu token thứ 2)

Model là cần thứ nhất; **effort + thinking** là cần thứ hai. Nguyên tắc: **cần suy nghĩ thì max; việc cơ học thì hạ** — đừng để mọi task nhỏ "suy nghĩ 32k token".

> ⚠️ **Giới hạn thật (xác minh lại 2026-09-23):** `effortLevel` của `settings.json` và `MAX_THINKING_TOKENS` là **session-global** cho phiên chính — KHÔNG tự đổi giữa chừng theo task; per-task ở Tầng 1 là **đổi thủ công bằng `/effort`**. Riêng **subagent** nay đặt được effort riêng bằng khoá `effort:` trong frontmatter `.claude/agents/*.md` (Claude Code hiện hành) — khung dùng đúng cơ chế này cho Tầng 2/3 (coordinator/spec-executor/mechanical `low`, worker khác `medium`, security-reviewer `high`).

| Cần điều khiển | Giá trị | Đặt ở đâu |
|---|---|---|
| **`effortLevel`** | `low` · `medium` · `high` · `xhigh` | `settings.json` (mặc định) · `/effort <mức>` (runtime) · `--effort` (CLI) |
| **`MAX_THINKING_TOKENS`** | `0` = tắt · số cao (vd `31999`) = suy nghĩ sâu | `env` block trong `settings.json` |

**Mặc định của khung: `effortLevel: "medium"`.** Chủ động nâng/hạ theo tác vụ:

| Loại tác vụ | Effort | Ghi chú |
|---|---|---|
| Tìm kiếm, đọc file, format, đổi tên, sửa 1 dòng | **`low`** | Giao subagent Haiku càng tốt |
| Code tính năng thường, viết test | **`medium`** | Không cần đổi gì |
| **Cần suy nghĩ:** KHUNG-3 chọn công nghệ, `/adr`, `/incident`, rà lỗi logic tinh vi (async race, tiền tệ, idempotency), phân tích breaking change | **`xhigh` + thinking max** | `/effort xhigh` rồi gõ **`ultrathink`** trong prompt |

```bash
/effort xhigh   # vào việc suy nghĩ nặng (kèm "ultrathink" trong câu hỏi)
/effort medium  # xong, quay lại việc thường
/effort low     # việc cơ học hàng loạt (đổi tên, format cả loạt)
```

Tắt hẳn thinking cho việc siêu nhẹ (tùy chọn) — thêm `{ "env": { "MAX_THINKING_TOKENS": "0" } }` vào `settings.json`, bỏ khi quay lại việc cần nghĩ (Fable 5.1 không tắt được thinking).

Các skill nặng suy nghĩ (`/adr`, `/incident`, `/consult`, `/auto` plan mode) đã có **dòng nhắc 💡** ở đầu: gợi ý chuyển tay sang `/model claude-fable-5-1` (hoặc model cao cấp nhất sẵn có) + `/effort xhigh` đúng pha, rồi hạ lại. Đây là **nhắc**, không tự đổi — Claude Code không tự nâng model/effort theo độ khó.

> **Độ ưu tiên:** CLI `--effort` / env `CLAUDE_CODE_EFFORT_LEVEL` **>** `settings.json`. Môi trường chạy (vd Claude Code trên web) có thể set sẵn env → **ghi đè** `settings.json` cho phiên đó. `/effort` lúc chạy luôn thắng.

---

## 5. Kỷ luật vận hành (tối ưu token thứ 3) — plan một lần, ngữ cảnh gọn

Model (§2) là cần thứ nhất, effort (§4) là cần thứ hai; **cách vận hành phiên** là cần thứ ba — và tiết kiệm nhiều nhất, vì nó quyết định *bao nhiêu token phải nạp*, không chỉ *giá mỗi token*.

### 5.1 Plan MỘT LẦN cho cả khối việc — đừng re-plan lắt nhắt
- **Gom việc lớn vào một phiên plan mode duy nhất** (đúng luồng `/auto`: chuyển tay sang model cao cấp nhất sẵn có để lập kế hoạch toàn bộ → duyệt 1 cổng → quay lại Sonnet 5 chạy dài). Vào/ra plan mode nhiều lần cho từng việc nhỏ là cách đốt token model cao cấp nhanh nhất — mỗi lần vào, model đó đọc lại toàn bộ ngữ cảnh với giá cao.
- **Ghi kết quả suy nghĩ ra file** (PROGRESS.md, ADR, kế hoạch trong `docs/ops/`): phiên sau đọc lại bằng Sonnet, **không trả tiền model cao cấp suy lại từ đầu**. Đây là "cache chất lượng" rẻ nhất của khung.
- Hai lỗi ngược nhau, cùng phải tránh:

| Lỗi | Hệ quả | Cách đúng |
|---|---|---|
| Vào plan mode cho việc vặt (sửa 1 dòng, đổi tên, format) | Trả giá model cao cấp cho việc không cần suy nghĩ | Làm thẳng ở execution (Sonnet) hoặc giao subagent |
| Né plan mode khi đụng kiến trúc / nhiều đánh đổi | Phần cần lý luận sâu nhất chạy model yếu hơn → chất lượng tụt, sửa lại còn đắt hơn tiền "tiết kiệm" | Vào plan mode (Shift+Tab hoặc `/auto`) sau khi đã `/model` sang model cao cấp nhất sẵn có |

### 5.2 Ngữ cảnh gọn — token rẻ nhất là token KHÔNG nạp
- **Chỉ nạp phần cần:** CLAUDE.md giữ < 200 dòng; tài liệu dài nằm ở `docs/framework/`, đọc đúng mục đang cần (ghi chú cuối mục 1 CLAUDE.md).
- **Việc tìm kiếm/đọc dài → subagent** (`lookup`, `version-check`, `standard-worker` — bản kê §6): output dài nằm trong ngữ cảnh CỦA SUBAGENT, phiên chính chỉ nhận kết luận. Lợi kép: token rẻ hơn VÀ ngữ cảnh phiên chính không phình — ngữ cảnh gọn thì chất lượng lý luận cũng tốt hơn.
- **Đừng kéo một phiên lê thê:** phiên càng dài, mỗi lượt càng đắt (trả tiền cho cả lịch sử phía trước) và lý luận càng loãng. Hết một mảng việc → `/gate` → commit → cập nhật PROGRESS.md → **mở phiên mới** ("tiếp tục" nối lại tự động nhờ `session-resume.sh`).

#### 5.2.1 Trần ngữ cảnh chung cho mọi nhà cung cấp

Theo yêu cầu chủ repo ngày **2026-10-07**, mỗi phiên chính và mỗi subagent dùng tối đa
**500.000 token ngữ cảnh đang hoạt động**. Áp dụng cùng luật cho Claude Code, Codex,
Hermes (kể cả Gemini qua bridge), Gemini CLI, OpenCode, Cursor, Copilot và runner khác.
Đây không phải giới hạn tổng token tiêu thụ hay độ dài lịch sử lưu trên đĩa.

- Ngân sách thực tế là `min(500.000, cửa sổ model)`; không tăng giới hạn của model nhỏ hơn.
- Bắt đầu nén/checkpoint trước `min(450.000, 90% ngân sách thực tế)`; giữ phần còn lại
  cho phản hồi và lượt công cụ. Nén sớm hơn vẫn hợp lệ.
- Trước khi nén hoặc chuyển phiên, lưu mục tiêu, quyết định, nhánh/SHA, thay đổi chưa commit,
  bằng chứng kiểm thử, việc tiếp theo vào `docs/work/<id>/working.md` (contract §3e); PROGRESS trỏ hồ sơ.
  Subagent giữ bàn giao trong artifact thuộc phạm vi ghi của mình, tránh ghi đè tiến độ chung.
- Runner không tự nén phải checkpoint và chuyển phiên theo cùng luật. Không có số đo token
  thì ghi rõ chưa xác minh; không dùng số ký tự/byte như số token chính xác. Cấu hình ngưỡng
  nén không bảo đảm từng request dưới trần nếu một output lớn vượt phần dự phòng.

| Runner | Cấu hình / cách áp dụng | Bằng chứng và giới hạn |
| --- | --- | --- |
| Claude Code | `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW="500000"`, `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE="90"` trong `.claude/settings.json` và `.claude/settings-shared-default.json` | [Tài liệu Anthropic](https://code.claude.com/docs/en/env-vars): cửa sổ nén bị chặn bởi cửa sổ model; phần trăm áp cho phiên chính và subagent có hỗ trợ. Runner phải bật tự nén; bản cũ/ghi đè settings cần kiểm tra lại. Status line vẫn tính theo cửa sổ model đầy đủ. |
| Codex | `.codex/config.toml`: `model_context_window=500000`, `model_auto_compact_token_limit=450000`, scope `total` | [Tài liệu OpenAI](https://learn.chatgpt.com/docs/config-file/config-reference); cấu hình riêng repo chỉ được nạp khi repo được tin cậy. Không mở rộng khả năng model; cờ CLI hoặc cấu hình gần thư mục chạy hơn có thể ghi đè. |
| Hermes / Gemini qua Hermes | Trong profile Hermes dùng cho dự án: `compression.enabled: true`, `compression.threshold_tokens: 450000` | [Tài liệu Hermes](https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching): token cap chặn ngưỡng tỉ lệ. Repo chưa cài/kiểm chứng profile Hermes; không giả định `.hermes/config.yaml` trong repo tự được nạp. Đọc `AGENTS.md` và thực hiện checkpoint khi chưa có cấu hình runtime. |
| Gemini CLI | `GEMINI.md` hiện có dẫn tới luật chung; nếu cấu hình tự nén, đặt `model.compressionThreshold` theo cửa sổ model đã xác minh | [Tài liệu Gemini CLI](https://geminicli.com/docs/reference/configuration/): ngưỡng là tỉ lệ, không phải token cap tuyệt đối. Chọn tỉ lệ ≤ `min(450000, 0.9 × min(500000, W)) / W`, với `W` là cửa sổ model; kiểm lại khi đổi model. Repo chưa đặt tỉ lệ cố định cho mọi model. |
| OpenCode | Đọc `AGENTS.md`; chỉ đặt `provider.<id>.models.<id>.limit.context` ≤ 500000 sau khi xác minh model/provider thực tế và bật tự nén | [Tài liệu OpenCode](https://docs.opencode.ai/docs/config/): cấu hình model phụ thuộc provider; không có cấu hình token cap chung đã xác minh trong repo. Tuân thủ checkpoint/chuyển phiên cho tới khi kiểm chứng runtime. |
| Cursor / Copilot / runner khác | Cầu nối luật hiện có → `AGENTS.md` → `CLAUDE.md`; lưu bàn giao rồi nén hoặc chuyển phiên trước ngưỡng | Luật chung có hiệu lực cho agent đọc chỉ dẫn; chưa có bằng chứng cưỡng chế tự động ở các runner này. Không suy ra đã cấu hình runtime từ việc thêm một dòng luật. |

Các phiên đang mở cần nạp lại luật/cấu hình; khởi động lại runner khi không xác minh được
hot reload. Khi copy khung, settings Claude đã tồn tại được giữ nguyên: so/merge bản
`settings.json.framework-new` để nhận ngưỡng mới. Cấu hình Codex hiện áp tại repo này;
runner ở dự án đích phải được cấu hình và kiểm chứng riêng.

### 5.3 Một phiên chuẩn trông thế nào (checklist)
1. **Mở phiên:** hook tự nạp PROGRESS.md; `session-guide.sh` hiện model phiên hiện tại (chỉ để tham khảo, không còn so khớp đúng/sai với một alias cố định).
2. **Việc lớn/mơ hồ** → `/model` sang model cao cấp nhất sẵn có rồi vào plan mode một lần; **việc rõ phạm vi** → làm thẳng (Sonnet).
3. **Trong lúc chạy:** việc cơ học giao subagent; `/effort` chỉnh theo loại việc (§4); nâng `/model` chỉ khi độ khó thật đòi hỏi (CLAUDE.md §2) rồi tự `/model claude-sonnet-5` quay về.
4. **Đóng mảng việc:** `/gate` → commit → cập nhật PROGRESS.md → phiên mới cho mảng kế tiếp.

**Tóm một dòng:** plan một lần bằng model cao cấp nhất sẵn có (tự `/model` chuyển) → thực thi dài bằng Sonnet → việc cơ học ra subagent → effort theo việc → nâng model đúng mốc rồi tự quay về. **Token tiết kiệm nhất nằm ở kỷ luật vận hành, không nằm trong file config.**

---

## 6. Chế độ chạy tự động (sơ đồ + thành phần đã bake)

**Một câu:** Tư vấn + chuyển tay sang model cao cấp nhất sẵn có để lập kế hoạch toàn bộ → bạn duyệt 1 lần → tự động điều phối tới hoàn thành (Sonnet code, Haiku việc phụ, `standard-worker` việc rõ phạm vi), với auto-format + cổng chặn commit đỏ, quyền an toàn, tự nhắc dừng khi gần hết quota 5h, phiên sau "tiếp tục". Kích hoạt: gõ **`/auto`** (nhắc bạn `/model` sang model cao cấp nhất sẵn có trước khi vào plan mode).

```
                       /auto  (dự án mới hoặc có sẵn)
                                  │
                 ┌────────────────▼──────────────────┐
   PLAN MODE  →  │  Model cao cấp nhất sẵn có lên      │  research-first; giao Haiku:
   (/model tay)  │  kế hoạch TOÀN BỘ (9 giai đoạn /    │   • lookup (tìm/đọc)
                 │  nâng cấp brownfield)                │   • version-check (xác minh version)
                 └────────────────┬──────────────────┘
                                  │
                        ┌─────────▼─────────┐
                        │  1 CỔNG PHÊ DUYỆT  │  ← người dùng xác nhận (ExitPlanMode)
                        └─────────┬─────────┘
                                  │  (đã duyệt, tự /model quay lại Sonnet 5)
              EXECUTION  →  SONNET 5 viết code, chạy tự động theo kế hoạch
                                  │  (việc rõ phạm vi → subagent standard-worker: cô lập + song song)
   Trong khi chạy, các hook tự động (không cần hỏi):
     • sửa file  → PostToolUse  → auto-format.sh   → dev-task.sh format-file
                                └ ui-intelligence.sh → gợi ý UI/UX (opt-in, không chặn)
     • lệnh git  → PreToolUse   → block-dangerous-git.sh (force-push main, reset --hard… = CHẶN)
     • git commit→ PreToolUse   → pre-commit-gate.sh→ dev-task.sh gate (đỏ = CHẶN)
     • hết lượt  → Stop         → usage-guard.sh    → usage-estimate.sh (≥70% → nhắc wind-down)
                                └ telemetry-record.sh → telemetry-log.sh --record (ghi thời gian/model mỗi lượt; cả SubagentStop)
                                └ auto-complete-guard.sh → /auto-complete bật + hồ sơ còn Active → KHÔNG cho kết lượt (dừng theo file trạng thái/trần/wind-down)
     • sắp nén   → PreCompact   → precompact-checkpoint.sh → chụp git + PROGRESS trước khi nén ngữ cảnh
     • mở phiên  → SessionStart → session-resume.sh → nạp PROGRESS.md + git ("tiếp tục")
                                └ session-guide.sh  → HIỆN gợi ý "làm gì tiếp theo"
                                  │
              Chỉ DỪNG ở: cổng giai đoạn · các mốc §9 · wind-down gần hết quota
```

### Bản kê thành phần

**Model & quyền — `.claude/settings.json`**

| Khóa | Giá trị | Ý nghĩa |
|---|---|---|
| `model` | `claude-sonnet-5` | Model tiêu chuẩn cho pha thực thi; pha lập kế hoạch chuyển tay bằng `/model` (mục 1) |
| `fallbackModel` | `[haiku-4-5]` (không lặp lại model chính) | Dự phòng khi model chính bận |
| `permissions.allow` | Edit/Write/Read, git an toàn, dev-task.sh, test/format/build | Auto-mode chạy không hỏi |
| `permissions.deny` | rm -rf, force-push **vào `main`/`master`**, reset --hard, sudo, chmod 777, đọc .env/secrets | **Deny thắng allow** |
| `permissions.ask` | force-push nhánh khác (`--force`/`-f`/`--force-with-lease`) | Hỏi từng lần, không chặn cứng |
| `hooks` | SessionStart, PreToolUse, PostToolUse, Stop, SubagentStop, PreCompact | 10 hook (bảng dưới) |

> **Ba lớp cho force-push.** `deny` không chặn mọi force-push (kể cả trên nhánh do chính phiên tạo) —
> luật thật (`AGENTS.md`) chỉ cấm force-push **vào `main`/`master`**. Chia ba lớp:
>
> 1. `permissions.deny` — các cách viết nhắm thẳng `main`/`master` (`... main`, `...:main`, `-f`,
>    `--force`, `--force-with-lease`): **chặn cứng, không hỏi**; riêng dạng ngắn `-f` bị chặn cứng với **mọi** nhánh
>    (deny `git push -f*` — muốn ghi đè nhánh riêng thì dùng `--force-with-lease`). Lớp này không phụ thuộc `jq`.
> 2. `permissions.ask` — `--force`/`--force-with-lease` sang nhánh riêng: **hỏi người dùng từng lần**, không im lặng cho qua.
> 3. `.claude/hooks/block-dangerous-git.sh` — lớp hiểu NGỮ CẢNH: chặn khi có `main`/`master`,
>    chỉ **cảnh báo** với nhánh riêng, và đã loại trừ dữ liệu trong nháy/heredoc để không chặn oan.
>
> **Giới hạn nói thật:** mẫu của `deny` so khớp **chuỗi lệnh**, nên `git push --force` trống (đang
> đứng sẵn trên `main`, không ghi tên nhánh) KHÔNG khớp lớp 1 — nó rơi xuống lớp 2 (hỏi) và lớp 3.
> Mà lớp 3 (và `pre-commit-gate.sh`) **fail-open khi thiếu `jq`** (`TRAPS.md` bẫy 26), nên trên máy không có `jq` thì ca này
> chỉ còn lớp 2 canh. Đây là lý do nữa để cài `jq` (xem `README.md` → Yêu cầu môi trường).

**Subagent — `.claude/agents/`**

| File | Model | Việc (đúng thế mạnh) |
|---|---|---|
| `lookup.md` | Haiku | Tìm file, grep symbol, định vị định nghĩa/tham chiếu, trích dữ kiện — read-only |
| `version-check.md` | Haiku | Xác minh phiên bản bằng nguồn sống (npm/pypi/node) cho research-first |
| `coordinator.md` | Sonnet · low | **Tầng 2** — điều phối: nhận nguyên văn PLAN.md, tạo nhánh/worktree, dispatch theo `route:`, nghiệm thu, gọi reviewer, tích hợp. Không đổi kế hoạch, không tự code, không merge. |
| `complex-implementer.md` | Opus · medium (trần) | **Tầng 3** `route:complex` — việc phức tạp còn chỗ tự quyết trong ranh giới brief. |
| `spec-executor.md` | Sonnet · low | **Tầng 3** `route:spec` — việc phức tạp nhưng đặc tả kín, chỉ thi hành. |
| `standard-worker.md` | Sonnet | **Tầng 3** `route:standard` (kế thừa `executor`) — việc vừa, đặc tả cụ thể (test theo spec, boilerplate, cập nhật docs, sửa cơ học). Cô lập ngữ cảnh + song song, không phải "model rẻ hơn". |
| `mechanical-worker.md` | Haiku | **Tầng 3** `route:mechanical` — việc cơ học theo mẫu/thông báo, khép kín. |
| `reviewer.md` | Sonnet | Hậu kiểm bằng skill `code-review` sau khi worker xong, trước khi Tầng 1 duyệt. Ngoài bảng route. |
| `maintainer.md` | Sonnet | **Bảo trì toàn diện** theo chu kỳ (`/maintain`): chạy `scripts/maintenance-sweep.sh`, triage 🔴/🟡, viết `docs/ops/MAINTENANCE-PLAN.md` rồi dừng chờ duyệt. Ngoài bảng route. Ngoài Claude Code: `scripts/maintain-run.sh` (CLI subscription cục bộ — Claude Code/Hermes/Gemini qua Antigravity/Codex/OpenCode, không API key). |

| `tester.md` | Haiku · low | Chạy toàn bộ cổng `dev-task.sh gate` và báo kết quả thô cho Coordinator; không sửa code, không review logic. Ngoài bảng route. |
| `security-reviewer.md` | Sonnet · high | Rà bảo mật một diff bằng skill `security-review` khi chạm auth/thanh toán/dữ liệu người dùng; chỉ báo cáo, không sửa. Ngoài bảng route. |

> Chi tiết vận hành 3 tầng (luật cứng từng tầng + định dạng PLAN.md): `orchestration-3-tier.md`.

**Hook — `.claude/hooks/`**

| Hook | Sự kiện | Làm gì |
|---|---|---|
| `session-resume.sh` | SessionStart | Nạp PROGRESS.md + git → "tiếp tục" nối lại; xóa marker wind-down |
| `session-guide.sh` | SessionStart | Hiện gợi ý "làm gì tiếp theo"; hiện model phiên hiện tại + nhắc chính sách hai pha (không so khớp đúng/sai với một alias cố định — ADR-0007) |
| `block-dangerous-git.sh` | PreToolUse(Bash) | Chặn git nguy hiểm theo ngữ cảnh (force-push/xoá `main`, `reset --hard`, `clean -f`…); đã bỏ dữ liệu trong nháy/heredoc, soi cả `bash -c`/`eval` (TRAPS 62) |
| `pre-commit-gate.sh` | PreToolUse(Bash) | `git commit` → chạy cổng; **đỏ = chặn** (bỏ qua: `--no-verify`); diff staged lớn (≥80 dòng hoặc ≥5 file) → nudge chạy `/code-review`/`/simplify` (không chặn — cổng máy móc không bắt lỗi logic/trùng lặp); chuỗi đỏ **cùng chữ ký** đếm ở `.claude/.gate-red-streak`: lần 2 nhắc ghi lỗi ở tầng (§3b), ≥ 3 nhắc §8 BLOCKED; chữ ký khác về 1, xanh xoá |
| `auto-format.sh` | PostToolUse(Edit\|Write) | Tự format đúng file vừa sửa |
| `ui-intelligence.sh` | PostToolUse(Edit\|Write) | Gợi ý UI/UX khi sửa file giao diện — opt-in, không chặn |
| `usage-guard.sh` | Stop | Ước tính % quota 5h; ≥ ngưỡng → nhắc wind-down (1 lần/phiên) |
| `auto-complete-guard.sh` | Stop | Khi `/auto-complete` bật (marker `.claude/.auto-complete-loop`) và `docs/work/<id>/working.md` còn Active → `decision: block` (không kết lượt), nhắc mục "Bàn giao"; cho dừng khi Blocked/Waiting/done.md, wind-down, trần `AUTO_COMPLETE_MAX_CONTINUES` (20), lời cuối lặp, chuỗi đỏ ≥ 3 đã nhắc §8 — tín hiệu từ file trạng thái, không từ câu model |
| `telemetry-record.sh` | Stop + SubagentStop | Tự gọi `telemetry-log.sh --record` (harness/model/thời lượng ước từ transcript) — đảm bảo §5 (kỷ luật vận hành) luôn có dữ liệu thật để đối chiếu, không chỉ mô tả trên giấy. Transcript không có `usage` → token `null` (unknown), không ghi 0. Mỗi bản ghi là một **lần thử**; công việc chỉ tính là **được nghiệm thu** khi có bản ghi `--outcome accepted --evidence <gate-evidence PASS>` (gom bằng `--work-id`). `--summary` báo chi phí gồm cả lần thất bại, usage unknown đếm riêng và tổng thành cận dưới `≥` (LD-07) |
| `precompact-checkpoint.sh` | PreCompact | Chụp nhánh/diff/PROGRESS vào checkpoint trước khi Claude Code nén ngữ cảnh (resume không mất việc dở) |

**Script — `scripts/`**

| Script | Vai trò |
|---|---|
| `dev-task.sh` | **Điểm vào ổn định** `format\|lint\|typecheck\|test\|build\|gate\|format-file`; tự dò stack (node/python/go/rust/make) hoặc theo khai báo; **no-op an toàn** |
| `usage-estimate.sh` | Ước tính % quota 5h = token thật (transcript) ÷ budget khai báo; `% = MAX` theo model |
| `_stack-detect.sh` | Dò stack/lockfile/venv + đọc lệnh khai báo — `dev-task.sh` và `maintenance-sweep.sh` cùng `source` |
| `_dev-task-verify.sh` | `evidence-check` (bằng chứng gate khớp phiên bản hiện tại) + `review-check` (finding có căn cứ) — `dev-task.sh` `source` |
| `_commit-guard.sh` | MỘT nguồn mẫu bí mật + ngưỡng file lớn cho `pre-commit-gate.sh`, `githooks/pre-commit`, sweep; **thiếu → chặn commit** |
| `githooks/pre-commit` | Hook git chuẩn (bật `core.hooksPath scripts/githooks`) — cổng cho harness ngoài Claude Code |

### Hai file cấu hình bạn tự điền (đã `.gitignore`)

| Copy từ | Thành | Để làm gì | Bắt buộc? |
|---|---|---|---|
| `.claude/project-commands.example.sh` | `.claude/project-commands.sh` | Khai báo lệnh format/lint/test THẬT (nếu tự-dò chưa đúng) | Không — tự dò trước |
| `.claude/usage-budget.example.sh` | `.claude/usage-budget.sh` | Budget token/5h (gợi ý gói **Pro**) để bật ước tính % + nhắc wind-down | Chỉ khi muốn nhắc quota |

Không có 2 file này: dev-task tự dò/no-op an toàn, ước tính quota tự tắt.

### "Mọi dự án đều khác nhau" — giải quyết bằng LỚP TRUNG GIAN
Template hỗ trợ **mọi loại dự án** nên **không hardcode** lệnh (`npm`/`ruff`/`go`…) vào hook/settings:

```
hook (cố định) → scripts/dev-task.sh <task> → ┌ 1) lệnh KHAI BÁO (.claude/project-commands.sh)
                                              ├ 2) TỰ DÒ hệ sinh thái (node/python/go/rust/make)
                                              └ 3) NO-OP (exit 0) nếu chưa có gì
```
Nhờ vậy hook GATE-trước-commit + auto-format bake sẵn mà vẫn đa-loại — vào GĐ 0–2 chọn stack, chỉ cần điền `project-commands.sh`, automation tự có hiệu lực, **không phải sửa hook/settings**.

---

## 7. Áp dụng, tùy chỉnh & kiểm tra

**Áp dụng (mới hoặc có sẵn):**
1. `bash copy-framework.sh /đường-dẫn/tới/dự-án` — copy `.claude/settings.json` + hooks + agents + `scripts/` + 2 file `.example.sh` thẳng; file lớp 2 vào `_framework-dropins/`.
2. (tùy chọn) soát `_framework-dropins/`: merge config khớp stack (eslint, prettier, playwright…), hoặc `rm -rf _framework-dropins/` nếu không cần.
3. `git add .claude/ && git commit -m "chore: apply framework config"`.
4. Mở phiên Claude Code → AI nạp `.claude/settings.json`, chạy model tiêu chuẩn (Sonnet 5); tự `/model` sang model cao cấp nhất sẵn có khi cần lập kế hoạch việc lớn (mục 1).

**Đổi model:**
- Dự án nhỏ (tiết kiệm nhất): `{ "model": "claude-sonnet-5", "fallbackModel": ["claude-haiku-4-5"] }`.
- Nâng riêng lúc cần (không đổi file): `/model claude-opus-5-5` hoặc `/model claude-fable-5-1` cho ca kiến trúc khó nhất — xong tự `/model claude-sonnet-5` quay lại.

**Tùy chỉnh:**
- Thêm permission: `{ "permissions": { "allow": ["Bash(make *)", "Bash(docker *)", "Bash(kubectl *)"] } }`.
- Bỏ hook không cần: xóa khối `PreToolUse`/`PostToolUse` trong `settings.json`. Xem skill `update-config`.

**Kiểm tra đã áp đúng** (mở phiên lần đầu):
- ✅ Dòng trạng thái hiển thị model tiêu chuẩn (**Sonnet 5**, hoặc Haiku nếu fallback).
- ✅ `session-resume.sh` chạy (đọc PROGRESS.md); `session-guide.sh` in thông báo + model phiên hiện tại.
- ✅ Mỗi lần Edit/Write, file tự format.
- ❌ Nếu sai: `ls -la .claude/settings.json`, `grep '"model"' .claude/settings.json`, đóng/mở lại phiên.

> **Chọn model lúc mở phiên:** picker hiển thị model thật (Sonnet 5/Opus 5.5/Fable 5.1/Haiku 4.5) — không còn alias chế độ nào (`opusplan` đã ngừng hỗ trợ). Chọn **"Default"** để repo tự áp model tiêu chuẩn (Sonnet 5), hoặc gõ **`/model <model-id>`** để chuyển tay theo pha (mục 1). **Tránh chọn Opus/Fable cho mọi việc** — chạy model cao cấp cho mọi thứ đốt hết quota 5h nhanh hơn nhiều (Pro ~1h nếu dùng Opus thuần).

---

## 8. Ranh giới & sự thật kỹ thuật (trung thực)

- **Hai pha lập kế hoạch/thực thi** đổi model theo **thao tác tay** (plan⇄execution) — không tự động trong một phiên, không "đoán độ khó từng câu". Phân tách main (đắt) ↔ subagent (rẻ) mới là cơ chế tự động thực sự, không đổi.
- **`standard-worker` cùng Sonnet** với pha-code thực thi — lợi ích là **cô lập ngữ cảnh + song song**, không phải model rẻ hơn.
- Claude Code **không** cấp % quota 5h cho hook/agent → % là **ước tính tự hiệu chỉnh** (token thật ÷ budget khai báo), chỉ tính **phiên hiện tại**.
- "Dừng ở ~70%" = **ngừng khởi động chu kỳ mới** rồi wind-down (commit phần xong + ghi PROGRESS), **không** chặn lệnh commit — near-limit càng phải lưu việc.
- **Quyền:** allow-list an toàn; thao tác nguy hiểm vẫn hỏi. Muốn bỏ mọi xác nhận → tự chạy chế độ bypass (cân nhắc rủi ro), không bake vào template.
- Auto-format/gate **đa-loại dự án** nhờ mọi lệnh nằm sau `dev-task.sh`; template không hardcode lệnh stack nào. Hook cần `scripts/` theo mục `[scripts]` của `copy-framework.manifest`; thiếu `dev-task.sh` → bỏ qua cổng **có nhắc** (không lỗi); thiếu `_commit-guard.sh` → **chặn commit** (không kiểm được bí mật thì không cho qua im lặng).
- Hook viết bằng **bash** — trên **Windows** cần Git Bash (đi kèm Git for Windows; Claude Code dùng nó chạy hook). Thiếu bash → hook không chạy (automation tắt, không lỗi).
- **Đừng downgrade ở chỗ rủi ro cao** — chi phí một quyết định kiến trúc/bảo mật sai lớn hơn nhiều tiền tiết kiệm model. CLAUDE.md §2 yêu cầu đổi model theo độ khó thật (ADR-0010 §4) cho đúng chỗ này.
- **Haiku 4.5 không dùng làm model chính** — thiếu chiều sâu lý luận đa vai trò; chỉ hợp việc phụ, đơn lẻ.
- **Ngữ cảnh 1M** ở Sonnet/Opus/Fable đủ cho gần như mọi dự án; **chất lượng lý luận** mới là yếu tố quyết định giữa ba model, không phải ngữ cảnh.

---

## 9. Q&A nhanh

- **Còn `opusplan` không?** Không — CLI không còn hỗ trợ (ADR-0007). Thay bằng hai pha chuyển **tay**: `/model` sang model cao cấp nhất sẵn có lúc lập kế hoạch, `/model claude-sonnet-5` lúc thực thi.
- **Sao không để Fable 5.1 mặc định cho chắc?** "Dao mổ trâu thịt gà": Fable tính $10/1M mọi token (kể cả việc Haiku $1 làm được) → lãng phí ~60–70%. Nâng Fable **có chọn lọc** đúng ca kiến trúc khó nhất mới đáng.
- **Dự án nhỏ có cần chuyển pha không?** Không bắt buộc. <5k LOC → Sonnet 5 xuyên suốt đủ tốt và rẻ hơn.
- **Tương thích mọi loại dự án?** Có. Permissions phủ Node/Python/Go/Rust/Makefile; hooks không phụ thuộc stack (thiếu `dev-task.sh` → bỏ qua cổng có nhắc; thiếu `_commit-guard.sh` → chặn commit).
- **Nhiều dự án nhiều cấu hình?** Để nhiều file cạnh nhau trong `.claude/` (vd tự tạo `settings-sonnet.json` cạnh `settings-shared-default.json`) → `cp … .claude/settings.json` khi đổi.
- **Vận hành thế nào để rẻ nhất mà chất lượng cao nhất?** Plan một lần bằng model cao cấp nhất sẵn có (tự `/model` chuyển) cho cả khối việc → Sonnet chạy dài → việc cơ học ra subagent → effort theo việc (§4) → ngữ cảnh gọn + phiên mới sau mỗi mảng (§5). Kỷ luật vận hành tiết kiệm hơn mọi tinh chỉnh config.

---

> **Kết luận cho dự án tầm trung:** **hai pha lập kế hoạch/thực thi là điểm ngọt** — model cao cấp nhất sẵn có lập kế hoạch (chuyển tay), Sonnet code, Haiku/subagent việc phụ; đủ năng lực cho gần như toàn bộ khung với chi phí thấp. **Nâng Opus/Fable có chọn lọc** ở các mốc kiến trúc / bảo mật / migration, rồi tự `/model` quay về. Nếu cần chọn model **cho tính năng AI bên trong sản phẩm** → đó là việc khác, dùng kỹ năng `claude-api`.
