# Kiến trúc điều phối 3 tầng

> **Chế độ tùy chọn cho mức L — không phải mặc định.** Một PR có thể do phiên chính tự làm;
> từ hai PR phải giao subagent đủ năng lực, độc lập thì song song, phụ thuộc thì tuần tự
> (`standard-delivery.md` §3c). Mặc định gọn: phiên chính → worker; thêm coordinator chỉ khi cần.
> **Tối đa 5 subagent đang chạy trong toàn cây**, gồm coordinator/reviewer/tester/agent lồng.
> **Giới hạn harness đã kiểm 2026-10-09:** trong Claude Code, subagent KHÔNG có tool `Agent` (không tạo được agent lồng) →
> `coordinator` gọi như subagent sẽ BLOCKED ngay; Tầng 2 phải do **phiên chính** đảm nhiệm (mặc định ADR-0010), hoặc chạy ở
> harness ngoài có nested agent. Bằng chứng: `docs/reports/2026-10-09-agent-acceptance.md` đợt 3.

> Mô hình vận hành tự động của khung: tách bạch **NGHĨ** (lập kế hoạch) — **CHẠY** (điều phối) —
> **LÀM** (thực thi), định tuyến worker theo 2 trục *độ phức tạp × độ kín đặc tả*.
> Đây là bản mở rộng của `models-and-automation.md`: nền vẫn là hai pha lập kế hoạch/thực thi (chuyển
> `/model` bằng tay — ADR-0007, `opusplan` đã ngừng hỗ trợ), 3 tầng là cách tổ chức khi một thay đổi
> đủ lớn để cần điều phối nhiều worker song song.
> **Đa model, đa nhà cung cấp (ADR-0006):** cả 3 tầng đều có thể chạy trên nhà cung
> cấp AI khác Claude khi CLI cục bộ đã có nhánh xử lý thật (`scripts/subagent-dispatch.py`,
> `scripts/maintain-run.sh`). `route:` là **cấp năng lực** (capability tier), không phải tên một
> model Claude cụ thể — xem PHẦN "Chọn đa nhà cung cấp" bên dưới.

## Sơ đồ tổng thể

```
TẦNG 1 — NGƯỜI LẬP KẾ HOẠCH  (phiên chính · mặc định Sonnet 5; đổi model khi độ khó thật đòi hỏi, ADR-0010 §4) — phần "NGHĨ"
   Hiểu yêu cầu → thiếu đặc tả thì HỎI (AskUserQuestion; theo ủy quyền contract §3d (phiên chính tự duyệt và ghi căn cứ khi quyết định đã được ủy quyền)) → viết đặc tả chi tiết
   (schema DDL, API, điểm chạm code, tiêu chí chấp nhận) → gắn nhãn `route:` từng việc
   → NHÓM việc thành các ĐƠN VỊ PR (1 PR/đơn vị) + khai phụ thuộc giữa đơn vị
   → ghi working.md + xuất PLAN.md khi cần → cấp slot/phạm vi → (cuối) DUYỆT kết quả.
                                  │  PLAN.md (đã duyệt theo quyền/contract §3d)
                                  ▼
TẦNG 2 — NGƯỜI ĐIỀU PHỐI  (coordinator · Sonnet · low) — phần "CHẠY"
   Nhận NGUYÊN VĂN PLAN.md → git fetch đồng bộ → với MỖI đơn vị PR: tạo nhánh/worktree
   riêng (phát hiện cô lập sẵn có trước khi tạo mới → baseline verification trước khi
   dispatch → dọn worktree an toàn sau khi merge, không bao giờ force-delete khi còn
   file chưa commit — chi tiết từng bước: `.claude/agents/coordinator.md`)
   → dispatch việc trong đơn vị theo `route:` (trần effort **medium**, kể cả `route:complex`)
   → nghiệm thu (tiêu chí chấp nhận, gọi `tester` chạy cổng) → gọi `reviewer` soát diff
   (đụng bảo mật/dữ liệu thật → thêm `security-reviewer`) → mở PR cho đơn vị → cổng
   `/gate` xanh thì **bật auto-merge** (CLAUDE.md §8) → đơn vị kế theo đúng phụ thuộc
   (song song nếu độc lập, tuần tự nếu phụ thuộc) → báo cáo tổng hợp về Tầng 1.
   CỨNG: không đổi kế hoạch/đặc tả · không tự code · không tự tay merge (chỉ BẬT
   auto-merge, để CI xanh mới thật sự merge) · gặp mốc dừng-và-hỏi (CLAUDE.md §9; vd không hoàn tác/breaking
   lan rộng) thì DỪNG đơn vị đó, không bật auto-merge, báo lên Tầng 1.
                                  │  dispatch theo nhãn, 1 PR/đơn vị
                                  ▼
TẦNG 3 — WORKERS  (định tuyến 2 trục: độ phức tạp × độ kín đặc tả)
   route:complex     → complex-implementer  (Opus · medium)
   route:spec        → spec-executor        (Sonnet · low)
   route:standard    → standard-worker      (Sonnet · medium)  [kế thừa coder cũ]
   route:mechanical  → mechanical-worker    (Haiku)            [kế thừa mechanical cũ]

   reviewer (Sonnet) — hậu kiểm bằng skill `code-review` sau khi worker xong,
   trước khi Tầng 1 duyệt cuối. KHÔNG nằm trong bảng route.
   tester (Haiku) — chạy `scripts/dev-task.sh gate`, báo kết quả thô (build/type/lint/test).
   security-reviewer (Sonnet) — skill `security-review`, chỉ gọi khi việc đụng
   auth/thanh toán/dữ liệu người dùng thật hoặc reviewer nghi ngờ có lỗ hổng.
   Cả hai KHÔNG nằm trong bảng route, KHÔNG tự sửa code.
```

## Bảng định tuyến (2 trục)

| `route:` | Agent | Model · effort | Khi nào |
|---|---|---|---|
| `complex` | `complex-implementer` | Opus · **medium** | Phức tạp, còn chỗ **tự quyết** trong ranh giới brief (thuật toán, cấu trúc dữ liệu, tổ chức module chưa chốt) |
| `spec` | `spec-executor` | Sonnet · low | Phức tạp nhưng **đặc tả kín** — chỉ thi hành, zero phán đoán (cần Opus thật → gắn `complex`) |
| `standard` | `standard-worker` | Sonnet · medium | Việc **vừa**, có đặc tả cụ thể (test theo spec, boilerplate, cập nhật docs, sửa cơ học nhiều file) |
| `mechanical` | `mechanical-worker` | Haiku | **Cơ học** theo mẫu/thông báo, khép kín, gần như không phán đoán |

Hai trục quyết định nhãn:
- **Độ phức tạp** (cần chiều sâu lý luận?) → Opus vs Sonnet/Haiku.
- **Độ kín đặc tả** (còn chỗ tự quyết?) → effort vừa (`complex`) vs effort thấp/chỉ-thi-hành (`spec`).

**Tiêu chí ĐẾM ĐƯỢC để hai planner khác nhau gắn cùng một nhãn** (audit 2026-09-23, T9):
- `mechanical` = brief chứa **khuôn cuối cùng từng ký tự** + **danh sách file tường minh** + **0 quyết định để ngỏ**. Thiếu một → `standard`.
- `standard` = có **≥ 1 quyết định cục bộ** (đặt tên, chọn ca test, chỗ đặt) nhưng **không tạo hàm/luồng mới có nhánh điều kiện**.
- `complex` = **tạo hàm/luồng mới hoặc có nhánh điều kiện cần test ca biên** (CLAUDE.md §3A.6) và còn chỗ tự quyết.
- `spec` = như `complex` về độ khó nhưng **mọi quyết định đã chốt trong PLAN.md** (DDL, chữ ký, thuật toán, điểm chạm).

**Cột "Model · effort" là cấu hình MÁY ĐỌC, không phải ý định:** từ 2026-09-23 mỗi file `.claude/agents/*.md` khai `effort:`
(và `memory:`/`maxTurns:` khi cần) trong frontmatter — Claude Code áp cho subagent đó, độc lập với `effortLevel` của phiên
chính (nguồn: code.claude.com/docs/en/sub-agents). Bảng này chỉ là bản chiếu; nguồn sự thật là frontmatter.

**Trần effort = `medium` cho MỌI worker Tầng 3, kể cả `route:complex`** (không phải "complex = effort
cao"). Model (Opus vs Sonnet vs Haiku) vẫn là trục phân biệt năng lực chính;
không worker nào được tự nâng `/effort` quá `medium` để tiết kiệm token — việc thật sự cần effort
cao hơn (`xhigh`/`ultrathink`) không giao worker, giữ lại ở Tầng 1 (quyết định kiến trúc khó đảo — CLAUDE.md §2 đổi model theo độ khó thật; "nhiều đánh đổi
lớn/quyết định kiến trúc" — Tầng 1 tự làm, không route xuống).

## Chọn đa nhà cung cấp (ADR-0006)

Bảng trên là **mặc định trong Claude Code** (subagent `.claude/agents/*.md`). Khi phiên chính cần
chọn động theo độ phức tạp/độ khả dụng, hoặc chạy ngoài Claude Code (qua `maintain-run.sh`-style
CLI cục bộ), tra ứng viên đa nhà cung cấp trước khi dispatch:

```bash
scripts/subagent-dispatch.sh --tier planning     # Tầng 1: model cao cấp nhất đang sẵn có
scripts/subagent-dispatch.sh --tier complex       # ~ route:complex
scripts/subagent-dispatch.sh --tier spec          # ~ route:spec
scripts/subagent-dispatch.sh --tier standard      # ~ route:standard
scripts/subagent-dispatch.sh --tier mechanical    # ~ route:mechanical
```

Nguồn dữ liệu: `scripts/model-capability-tiers.json` (khuôn giống `model-rates.json` — có
`_verified_on`/`_source`, sửa số phải sửa cả hai). Mỗi ứng viên gắn `harness` (giá trị hợp lệ cho
`--harness` của `subagent-dispatch.sh`/`maintain-run.sh`: `claude`, `hermes [--provider P]`,
`codex`, `opencode`, `generic`) và cờ `verify_before_use` — **`true` thì bắt buộc** tra lại bằng
subagent `version-check` hoặc nguồn sống trước khi dùng thật (CLAUDE.md §4, không bịa phiên bản).

**Luật cứng khi dùng nhà cung cấp khác Claude ở Tầng 1/2/3:**
- Tầng 1 (planner) vẫn phải xuất `PLAN.md` đúng định dạng bên dưới, dù chạy trên model/hãng nào —
  định dạng là hợp đồng giữa các tầng, không đổi theo nhà cung cấp.
- Tầng 2 (coordinator) dispatch việc Tầng 3 trên nhà cung cấp khác Claude vẫn theo đúng luật cứng
  ở mục dưới (không đổi kế hoạch, không tự code, không merge) — nhà cung cấp thực thi không nới
  ranh giới vai trò.
- CLI của nhà cung cấp khác cần đã cài + đăng nhập subscription cục bộ trên máy đang chạy (như
  `maintain-run.sh` yêu cầu); không có CLI đó → dùng `--harness generic` in prompt ra dán tay,
  hoặc quay lại Claude.
- Không tự ý đổi model Routine/CI đang chạy dựa trên gợi ý trong `model-capability-tiers.json` —
  đổi model của một Routine/session cụ thể là quyết định của người dùng (xem ràng buộc
  `update_trigger`/`create_trigger` nếu đang chạy trong môi trường Claude Code Remote).

## Luật cứng theo tầng

**Tầng 1 (Người lập kế hoạch):**
- Thiếu đặc tả → **hỏi người dùng** bằng `AskUserQuestion` (theo ủy quyền contract §3d (phiên chính tự duyệt và ghi căn cứ khi quyết định đã được ủy quyền)). **Không tự chế đặc tả**; **không** hạ nhãn xuống `complex` chỉ để né phải hỏi.
- Đặc tả phải đủ để Tầng 2/3 thi hành: schema DDL, chữ ký API, điểm chạm code (`path`), tiêu chí chấp nhận, và nhãn `route:` cho từng việc.
- Tự làm phần lõi/cần suy luận sâu (không giao xuống); không giám sát worker từng bước — duyệt kết quả cuối.

**Tầng 2 (Người điều phối):**
- Thi hành **đúng** PLAN.md: không đổi kế hoạch/đặc tả, không tự code, không merge.
- Worker vướng đặc tả → **dừng việc đó và báo lên** Tầng 1. Không tự vá spec, không route lại để né chỗ khó.
- FIFO/không nhảy cóc, đánh số migration tuần tự, rebase nhánh sau lên phần đã tích hợp.

**Tầng 3 (Workers):**
- Làm đúng phạm vi việc; gặp spec thiếu/mâu thuẫn/mơ hồ → **dừng, nêu rõ, trả lại** (không tự đoán).
- Không quyết định kiến trúc-cấp-dự-án, không chọn công nghệ, không đụng §9 (đẩy lên).
- Không commit/merge (do `/gate` điều phối). Chống ảo giác §4.

## Định dạng PLAN.md và cổng khoá brief trước khi dispatch

Mẫu đầy đủ: `docs/framework/templates/PLAN.template.md` (copy, điền, giữ đúng khuôn dòng vì cổng đọc máy).
Khối "Luật chung cho mọi việc" trong mẫu dán nguyên vào brief từng worker: chỉ sửa file trong Điểm chạm,
test đỏ-trước + nộp output đỏ/xanh, chạy cổng trước khi báo xong, không hoàn tác lịch sử, mơ hồ thì dừng.

**Cổng (bắt buộc, Tầng 1 chạy trước khi giao việc đầu tiên):**

```bash
scripts/subagent-dispatch.sh --check-plan PLAN.md   # 0 = kín; 1 = liệt kê lỗi, KHÔNG dispatch; 2 = file thiếu/rỗng/không UTF-8
```

Cổng chặn đúng khuôn lỗi đã mắc thật ở nghiệm thu 2026-10-09 đợt 3 (brief `route:mechanical` tự nhận "0 quyết định
để ngỏ" nhưng mâu thuẫn với fence → worker dừng đúng, Tầng 1 mất một vòng — TRAPS mục 59): mỗi việc có route hợp lệ +
đủ 4 trường (Điểm chạm · Đặc tả · Phụ thuộc · Tiêu chí chấp nhận), không còn placeholder `<…>`, phụ thuộc có thật và
không tạo vòng, mỗi việc thuộc đúng một đơn vị PR; `route:mechanical` phải có khuôn trong fence và điểm chạm là đường
dẫn tường minh (không glob). Cổng kiểm **hình thức kín** của brief, không kiểm nội dung đúng — Tầng 1 vẫn tự soát khuôn
(dòng trống, đầu/cuối) trước khi giao.

## Ranh giới với phần còn lại của khung
- **"Tầng" ở đây là tầng ĐIỀU PHỐI (nghĩ/chạy/làm).** 5 *tầng vòng đời* (Product & UX → Design →
  Engineering → Verify & Operate → Knowledge, ADR-0008) là bản đồ ở `standard-delivery.md` §3b: tầng ①②⑤
  là vai của Tầng 1; tầng ③ = Tầng 2+3; tầng ④ = `tester`/`reviewer`/`security-reviewer` + `/gate` + CI.
- **Không thay** `PROJECT.md` (cái-gì), các cổng `/gate` (commit/merge), hay ADR (`/adr`). 3 tầng chỉ là **cách điều phối thực thi**.
- **Một PR có thể tự làm; từ hai PR giao subagent** (`standard-delivery.md` §3c), kể cả tuần tự. Ba tầng tùy chọn; coordinator chiếm một trong ba slot toàn cây. Đổi `/model` chỉ khi năng lực cần, không phải nghi thức.
- **Đa nhà cung cấp là mở rộng, không phải thay thế**: mặc định không đổi gì vẫn chạy đúng như trước (Claude Sonnet 5 xuyên suốt cho thực thi); `--tier` chỉ dùng khi có lý do chọn khác (độ phức tạp, chi phí, tính khả dụng) — xem ADR-0006.
- Subagent read-only `lookup` (Haiku) và `version-check` (Haiku) vẫn phục vụ Tầng 1 ở bước research-first; chúng không nằm trong bảng route (chỉ tra cứu, không thực thi thay đổi).
- Subagent `maintainer` (Sonnet · medium) cũng **ngoài bảng route**: phục vụ Tầng 1 theo chu kỳ (`/maintain`) — quét bằng `scripts/maintenance-sweep.sh`, triage, viết `docs/ops/MAINTENANCE-PLAN.md` (mỗi mục một PR có nhãn `route:`) rồi dừng chờ duyệt. Sau duyệt, Tầng 1 có thể đưa các mục đó vào PLAN.md cho `coordinator` dispatch như việc thường; `maintainer` không tự commit/merge. Ngoài Claude Code chạy qua `scripts/maintain-run.sh` (CLI subscription cục bộ của mọi nhà cung cấp).
