# Standard Delivery Contract — nguồn vào duy nhất

Đây là **điểm vào chuẩn duy nhất** cho mọi dự án tạo từ template. Các tài liệu KHUNG, runbook,
completion, OpenSpec và quality supplements là tài liệu chuyên sâu được gọi từ contract này; chúng
không tạo quy trình song song.

## 1. Hai chế độ

- **Greenfield:** Idea → Research → Project Contract → Foundation → Feature loop → Release → Operate.
- **Brownfield:** Inventory → Baseline → Gap/Risk → Incremental adoption → Feature loop.

Không áp stack Web mặc định vào brownfield hoặc loại dự án khác. Chọn profile/tooling sau khi
research và ghi ADR; mọi quality gate phải có công cụ tương đương theo stack.

## 2. Artifact bắt buộc và nguồn sự thật

| Artifact | Vai trò | Template |
| --- | --- | --- |
| `PROJECT.md` | Outcome/phạm vi/kiến trúc/Project DoD | file gốc |
| `PROGRESS.md` | Tóm tắt trạng thái toàn dự án | `PROGRESS.template.md` |
| `docs/work/<id>/working.md` → `done.md` | Hồ sơ nối phiên của từng yêu cầu: chủ trì, checkpoint, bước tiếp theo, bằng chứng gộp | `docs/framework/templates/WORK.template.md` |
| `docs/goals/<id>.md` | Checkpoint goal nhiều PR | `docs/framework/templates/GOAL.template.md` |
| `docs/specs/<date>-<slug>.md` | Research + feature contract | `docs/framework/templates/FEATURE-SPEC.template.md` |
| ADR | Quyết định khó đảo ngược | `docs/adr/0000-template.md` |
| Issue/PR/CI | Work/evidence/review thực tế | GitHub templates |

Không sao chép cùng trạng thái vào nhiều file. `PROJECT` giữ điều tương đối ổn định; `PROGRESS`
giữ tóm tắt; Goal giữ iteration state; Spec giữ contract capability; GitHub giữ execution evidence.

## 3. Vòng đời chuẩn

| Gate | Điều kiện vào | Việc bắt buộc | Điều kiện ra |
| --- | --- | --- | --- |
| Frame | Ý tưởng/vấn đề | User, outcome, metric, guardrail, non-goal | Goal/Project draft |
| Research | Draft | Code/data/user/source/alternatives/unknowns | Evidence đủ |
| Approve | Research đủ | Project contract hoặc Feature Spec được review | Approved |
| Plan | Contract Approved | Slice/dependency/test/rollout/rollback/budget | Item Ready |
| Build | Item Ready | Một outcome, branch/PR nhỏ, test cùng code | Draft PR |
| Verify | Draft PR | Targeted + full gates + self-review + risk audit | Ready PR |
| Integrate | Review/CI xanh | Merge theo quyền, release/deploy có kiểm soát | Main/release |
| Observe | Đã release | Health/metric/cost/user feedback/reconciliation | Evidence |
| Reconcile | Có evidence | Đo goal gap, cập nhật checkpoint | Next slice/Complete |

**Feature code bị cấm trước khi spec ghi Approved for implementation, người duyệt và ngày duyệt.**

**Ánh xạ 9 cổng ↔ 9 giai đoạn (GĐ 0–8 của `01-process-and-standards.md`)** — hai bộ từ vựng cùng mô tả một vòng đời;
`PROGRESS.md` ghi GĐ, spec/goal ghi cổng:

| Cổng | GĐ tương ứng |
| --- | --- |
| Frame · Research | GĐ 0 (ý tưởng) · GĐ 1 (nghiên cứu & chọn công nghệ) |
| Approve · Plan | GĐ 2 (thiết kế, ADR, spec Approved) · GĐ 3 (dựng nền, kế hoạch) |
| Build · Verify | GĐ 4 (phát triển) · GĐ 5 (kiểm thử) |
| Integrate | GĐ 6 (tích hợp, release) |
| Observe · Reconcile | GĐ 7 (ra mắt, quan sát) · GĐ 8 (vận hành, bảo trì, đo goal gap) |

### 3b. Bản đồ 5 tầng SDLC ↔ cơ chế đang có (ADR-0008)

Cùng 9 cổng ở trên, nhìn theo **5 câu hỏi vòng đời**. "Tầng" ở đây là *tầng vòng đời*, khác "Tầng 1/2/3"
của `orchestration-3-tier.md` (*tầng điều phối*) — cột "Ai làm" nói rõ ánh xạ. Không có agent nào mới:
tầng ①②⑤ là **vai của phiên chính**; tầng ③ giao theo số PR ở §3c, tầng ④ do phiên chính nghiệm thu.

| Tầng vòng đời | Câu hỏi | Cổng | Ai làm (lệnh / agent) | Artifact ra | Cổng máy kiểm | Fail ở tầng sau → quay về đây khi |
| --- | --- | --- | --- | --- | --- | --- |
| ① Product & UX | Xây gì, tại sao? | Frame · Research · Approve | Phiên chính: `/consult`, `/grill`, `lookup`/`version-check` (tra cứu) | `docs/goals/<id>.md`, `docs/specs/<ngày>-<slug>.md` **Approved** | `pr-policy.yml` (PR `feat` chưa Approved → đỏ) | acceptance criteria sai/thiếu, scope lệch, edge case chưa nêu |
| ② Design | Hoạt động / trông thế nào? | Approve (spec §6, §10, §11) · Plan | Phiên chính: `/ui-ux` (UI) hoặc thiết kế CLI/API/DX theo hồ sơ C4/C5 | Mục journeys-mọi-state, UX/a11y, kiến trúc & điểm chạm **trong cùng spec** | axe/E2E a11y, Lighthouse CI (hồ sơ C1); cổng hồ sơ khác ở `quality-gates-by-profile.md` | thiếu state (tải/rỗng/lỗi), luồng không khớp, contract API/DDL chưa chốt |
| ③ Engineering | Xây bằng cách nào? | Plan · Build | Một PR: phiên chính có thể tự làm; ≥ 2 PR: subagent thực thi theo contract/dependency; coordinator là tùy chọn (§3c) | PR nhỏ, test cùng code (TDD đỏ-trước, ADR-0005) | hook `pre-commit-gate.sh`, `auto-format.sh`; `progress-freshness` | lỗi trong code đã có spec đúng — **mặc định là đây, nhưng phải nêu lý do** (luật dưới) |
| ④ Verify & Operate | Đúng, an toàn, chạy tốt không? | Verify · Integrate · Observe | `/gate` (§5–§7), `tester`, `reviewer`, `security-reviewer`; `release-readiness.md`; `/incident`; `/maintain` | Báo cáo xác thực §7, PR xanh + auto-merge, post-mortem, `MAINTENANCE-*.md` | `ci.yml` job `gate`, `secret-scan`, `dependency-review`, `maintenance.yml` | cổng/CI/hạ tầng sai (máy xanh giả, lockfile lệch — xem `gate.md` Bước 1) |
| ⑤ Knowledge | Hệ thống biết gì, đã đổi gì? | Reconcile (+ mọi PR, `CLAUDE.md` §8 bước 0/5) | Phiên chính: `/adr`, cập nhật `PROGRESS.md`, `CONTEXT.md`, `TRAPS.md`, `CODEMAP.md`, `docs/changelog/` | ADR, TRAPS mục mới, PROGRESS mốc + SHA, changelog đợt việc | `progress-freshness` (PF-1..4), `docs-consistency`, `maintenance-sweep` 🟡 `DEBT:` thiếu `xem lại khi:` | (không có tầng sau) — tri thức sai làm ① của chu kỳ kế lệch: sửa tại ADR/TRAPS, không sửa code |

**Luật quy lỗi về tầng (bổ sung trần "3 lần → BLOCKED" của §4):** khi Verify fail, lần sửa **đầu** được
sửa code ngay; trước lần sửa **thứ 2 cùng một failure** phải viết một dòng *"lỗi ở tầng ①/②/③/④ vì …"*
và quay về đúng tầng đó (sửa spec/design trước, rồi mới code). Lần thứ 3 vẫn fail → BLOCKED, xin quyết
định. Cross-cutting (bảo mật, hiệu năng, a11y, quyền riêng tư, chi phí, observability) **không** là tầng
riêng: mỗi tầng có cổng của mình cho chúng (spec §8/§14 → design a11y → code an toàn → scan/test → ADR).

### 3c. Mức quy trình theo rủi ro

Thủ tục tỉ lệ với **rủi ro**, không với thói quen: chọn mức theo yếu tố rủi ro cao nhất của thay đổi,
nghi ngờ thì chọn mức cao hơn. Mức chỉ đổi **lượng giấy tờ và điều phối**; sàn chất lượng giống nhau.

| Mức | Khi nào | Artifact tối thiểu | Ai làm |
| --- | --- | --- | --- |
| S | `fix`/`chore`/`docs`/`refactor`/`test`, một PR, không đổi schema, API công khai, auth hay dữ liệu thật | Issue hoặc mô tả PR (vấn đề, bằng chứng, rủi ro) — không cần spec | Agent chính tự làm |
| M | Tính năng gọn trong một PR, không chạm mốc §9 | Spec gọn Approved: mục 1, 2, 5, 9, 11 + Approval của `FEATURE-SPEC.template.md` | Agent chính tự làm |
| L | Nhiều PR/phiên, schema/API phá vỡ, auth/thanh toán/dữ liệu thật, quyết định khó đảo | Spec đầy đủ Approved + `docs/goals/<id>.md`; ADR/threat model khi §9 yêu cầu | Phiên chính lập kế hoạch/nghiệm thu; từ 2 PR giao subagent thực thi, một PR có thể tự làm |

**Không mức nào nới:** test đỏ-trước cho `fix:` và code mới có logic (ADR-0005); `scripts/dev-task.sh gate`
xanh trước commit; required checks CI; feature gate "Approved for implementation" cho mọi PR `feat`
(`pr-policy.yml`); dừng và hỏi ở mốc §9 của `CLAUDE.md`; báo cáo có bằng chứng (§7).

**Phân chia theo số PR, tách khỏi mức rủi ro:** phiên chính phân tích yêu cầu, outcome,
scope, rủi ro, số PR cần thiết và dependency trước khi làm. **Agent chính tự làm** được
phép với một PR; **từ 2 PR trở lên phải giao subagent đủ năng lực** thực thi từng đơn vị,
kể cả các PR phụ thuộc cần chạy tuần tự. Không chia PR giả tạo để kích hoạt subagent.
Giữ quyết định khó/contract và nghiệm thu ở phiên chính; không phải mọi mức L đều cần nhiều PR.

- **Tối đa 5 subagent đang chạy trong toàn cây**, tính cả coordinator, reviewer, tester
  và agent do subagent tạo. Coordinator đang chạy thì còn tối đa bốn slot cho agent khác.
  Một phiên chính quản lý ngân sách slot; không để mỗi coordinator tự cấp thêm năm slot.
- Mỗi đơn vị có owner, cấp năng lực/model đã xác minh, input/output, acceptance/test,
  phạm vi ghi, nhánh/worktree và PR riêng. Nếu brief chưa đủ kín cho worker đủ năng lực,
  phiên chính chốt thiết kế trước; không hạ chất lượng hoặc mặc định chọn model rẻ nhất.
- Đơn vị độc lập → chạy song song trong ngân sách; có dependency/chung file, migration,
  dependency cài đặt hay lockfile → tuần tự. Đợi PR phụ thuộc merge rồi reconcile base.
- Phiên chính đọc diff, tích hợp và chạy đủ cổng; lời subagent không thay bằng chứng.
  Ba tầng `orchestration-3-tier.md` là tùy chọn; phiên chính → worker là mặc định gọn.
  Runner không có subagent phù hợp phải ghi rõ giới hạn/blocked của phần phân công,
  không âm thầm giả đã giao việc. Trần ba PR mở/FIFO là cổng riêng, không phải số slot agent.

**Quyền tách bạch — quyền code ≠ quyền merge ≠ quyền deploy.** Được duyệt spec chỉ mở quyền code. Merge chỉ
khi người dùng/quy tắc repo cho phép và cổng của đúng head xanh; deploy/production luôn cần quyền riêng,
không suy ra từ hai quyền trước.

### 3d. Ủy quyền quyết định: chất lượng cao nhất, phương án tối giản nhất

**Mặc định toàn cục của khung, theo yêu cầu chủ repo ngày 2026-10-07:** phiên chính
tự quyết mọi lựa chọn trong phạm vi công việc được giao, áp cho mọi phiên, nhà cung cấp,
runner và agent. Mục tiêu là **phương án tối giản nhất đạt chất lượng cao nhất có thể**;
người dùng có thể giới hạn hoặc thu hồi ủy quyền cho công việc cụ thể.

1. **Hiểu trước, chọn sau:** lần đúng luồng thật; tự tra dữ kiện; nêu giả thuyết và cách
   kiểm chứng. Chốt outcome, ràng buộc và tiêu chí chấp nhận từ yêu cầu/ngữ cảnh đã có.
   Không thay thế bằng cảm tính, điểm số tự bịa hay lời khai của model.
2. **Chất lượng là điều kiện chọn:** giữ tính đúng, bảo mật, validate biên tin cậy,
   xử lý lỗi chống mất dữ liệu, logic nhất quán, a11y theo hồ sơ, khả năng kiểm thử,
   vận hành và bảo trì. Chứng minh bằng kiểm tra phù hợp rủi ro; không hạ tiêu chí,
   bỏ test hay bỏ cổng để đạt ít dòng code hoặc nhanh hơn.
3. **Tối giản mọi mặt trong các phương án đạt chất lượng:** theo thang `CLAUDE.md` §3.4;
   ưu tiên tái sử dụng, thư viện chuẩn, nền tảng, dependency đã cài và lời giải nhỏ đủ dùng.
   Giảm code, nhánh logic, coupling, dependency, cấu hình, artifact trùng, công cụ,
   bước bàn giao, chi phí vận hành và việc bảo trì. Ít dòng nhưng khó đọc/ẩn rủi ro
   không phải tối giản. Không thêm abstraction, tầng, tính năng hoặc nghi thức chưa cần.
4. **TDD và bằng chứng giữ nguyên:** bug/code mới có logic làm đỏ → sửa → xanh theo
   ADR-0005; ngoại lệ đóng ở `CLAUDE.md` §3.6. Research, spec Approved cho M/L,
   review diff, gate/CI, DoD và báo cáo xác thực vẫn bắt buộc. Độ sâu tỉ lệ với rủi ro;
   chất lượng cao không đồng nghĩa dùng nhiều công cụ/model/agent hay mở rộng scope.
5. **Phiên chính chốt và chịu trách nhiệm:** quyết định kỹ thuật, trade-off, kế hoạch,
   lựa chọn công nghệ, duyệt spec, nghiệm thu và chuyển giai đoạn trong scope đã giao
   được tự quyết sau khi có đủ bằng chứng. Báo ngắn phương án + lý do; ghi vào artifact
   hiện có, ADR chỉ khi đúng tiêu chí. Subagent làm trong contract được giao;
   phiên chính review và tích hợp, không dùng ủy quyền để bỏ qua kiểm tra.

**Thứ tự ưu tiên khi hai phương án đạt chất lượng xung đột nhau** (áp cho mọi quyết định tự duyệt,
kể cả `/auto-complete`; đi từ trên xuống, dừng ở bậc đầu tiên phân thắng bại — không đánh đổi bậc trên lấy bậc dưới):

1. **Đúng + bảo mật + không mất dữ liệu** — không bao giờ là món đổi; phương án nào hụt một trong ba thì loại.
2. **Ít hơn**: code, nhánh logic, dependency, cấu hình, abstraction, bước vận hành, việc bảo trì (thang `CLAUDE.md` §3.4).
3. **Kiểm được**: có bằng chứng máy (test đỏ-trước, gate, CI) rẻ hơn và rõ hơn.
4. **Nhanh và rẻ**: thời gian hoàn thành, token, chi phí model — chỉ khi ba bậc trên hoà.

Mỗi quyết định tự duyệt ghi **một dòng** vào `docs/work/<id>/working.md` mục "Quyết định và bằng chứng":
*phương án chọn · phương án loại · bậc phân thắng bại*. Không có dòng ghi = chưa quyết định, không phải "hiển nhiên".

**Cách áp dụng các cổng phê duyệt:** mọi chỉ dẫn "người dùng quyết", "dừng chờ duyệt",
"xin xác nhận" trong tài liệu/lệnh của khung phải đọc cùng §3d. Khi quyết định đã được
ủy quyền, phiên chính tự review rồi ghi **"Approved for implementation — phiên chính
duyệt theo ủy quyền của chủ repo ngày 2026-10-07"**, kèm ngày duyệt thực tế, phạm vi và
bằng chứng. Không giả người dùng đã duyệt tay. Cổng máy vẫn phải xanh; chế độ runner
bắt buộc người dùng xác nhận thật vẫn phải được tôn trọng và báo đúng giới hạn.

**Chỉ hỏi phần thực sự thiếu:** mục tiêu/dữ kiện không thể tự xác minh; không có phương án
đạt chất lượng trong scope/budget; hoặc hành động cần quyền chưa được cấp. Không suy
quyền xóa dữ liệu, thay đổi phá vỡ dữ liệu thật, thanh toán hay deploy/production từ
ủy quyền lựa chọn kỹ thuật. Quyền code/merge/deploy đã được cấp riêng tiếp tục có hiệu lực;
không hỏi lại quyền đó. Công việc bảo mật phòng thủ, sửa bug và trade-off kỹ thuật
trong scope được tự xử lý. Cổng đỏ hoặc thiếu bằng chứng → sửa/thu hẹp đúng scope;
không tự giảm chất lượng để tránh hỏi. Luật dừng sau 3 lần cùng failure vẫn giữ nguyên.

### 3e. Hồ sơ công việc bền vững: working.md → done.md

**Trước mọi công việc**, phiên chính đọc `PROGRESS.md`, liệt kê
`docs/work/*/working.md` và `docs/work/*/done.md`, đọc đầy đủ hồ sơ active và lịch sử
liên quan, đối chiếu `git status`, nhánh/SHA, PR/CI thật. Nối hồ sơ đúng ID nếu đang dở;
không tạo lại công việc đã có chỉ vì một phiên mới không nhớ. Nếu đã done nhưng hồi quy
hoặc yêu cầu thay đổi, tạo work ID mới và liên kết hồ sơ cũ, không ghi đè lịch sử.

**Một yêu cầu một thư mục** `docs/work/<ngày>-<slug>/`; tạo `working.md` từ
`docs/framework/templates/WORK.template.md` trước research/thực thi — bằng lệnh
`bash scripts/new-work.sh <slug> ["tên công việc"]` (điền sẵn Work ID, nhánh, SHA; không ghi đè ID có sẵn). Đây là hồ sơ
nối phiên, không thay Project/spec/goal/Issue/PR. Với goal nhiều PR, dẫn tới checklist
goal; không sao chép cùng checklist/trạng thái vào nhiều file. **Tên thư mục là Work ID, tên file là
trạng thái** — không lập sổ ID thứ hai: mọi PR ghi `Work ID: <id>` (cổng `pr-policy.yml`), thư mục
đúng khuôn `YYYY-MM-DD-slug` và có đúng một `working.md`/`done.md` (`check-docs-consistency.sh` mục 13);
việc còn dở = `ls docs/work/*/working.md`. `PROGRESS.md` giữ tóm tắt
và đường dẫn active; Git/PR/CI là nguồn sự thật về commit, test và merge.

- Ghi yêu cầu/outcome, scope/non-goal, owner, phân loại S/M/L, số PR dự kiến,
  kế hoạch/contract/dependency, nhánh/base SHA, quyết định, bằng chứng, failure/lần thử,
  blocker và **một bước tiếp theo cụ thể**. Chưa biết thì ghi unknown, không điền số bịa.
- Cập nhật ngay sau mốc có ý nghĩa, test quan trọng, thay đổi kế hoạch/PR, blocker;
  bắt buộc trước nén, đổi phiên, giao việc hoặc kết thúc lượt còn công việc dở.
  Bằng chứng gắn với head/base/thời điểm, không biến test của code cũ thành test code mới.
- Phiên chính là writer của hồ sơ tổng. Subagent chỉ ghi checkpoint vào hồ sơ đơn vị
  riêng `docs/work/<work-id>-<unit-id>/working.md` hoặc artifact thuộc phạm vi ghi;
  phiên chính reconcile, không để ba agent cùng sửa sổ tổng. Hồ sơ và mã phải được
  giữ trong cùng nhánh/PR hoặc commit bàn giao qua đúng cổng; không tự discard file dở.
- Trạng thái `Planned`, `Active`, `Blocked`, `Ready` đều giữ tên `working.md`.
  Worker báo xong, test xanh hoặc PR đã mở **chưa phải Done**. Không có PR cho công việc
  chỉ nghiên cứu thì phải ghi rõ no-code/no-PR và bằng chứng nghiệm thu; không bịa merge.
- Chỉ khi DoD đạt và **mọi PR của đơn vị đã MERGED**, phiên chính kiểm bằng chứng
  PR/merge SHA/base/main và unresolved review/CI trước khi rename `working.md` thành
  `done.md` trong chính thư mục đó. Không overwrite done có sẵn; giữ ID, quyết định,
  scope, link test và kết quả cuối. Hồ sơ tổng chờ đủ mọi đơn vị. PR bị đóng không merge,
  hủy việc hoặc blocked không được biến thành done.
- Reconcile sau merge trên main; ghi rename vào PR kế tiếp hoặc PR tài liệu nhỏ nếu
  cần chốt phiên. Không thể đưa bằng chứng merge thật của chính PR vào PR trước khi nó
  merge; không vì muốn khép hồ sơ mà giả trạng thái hoặc push thẳng main.

**Khôi phục đầu phiên:** SessionStart của Claude Code liệt kê hồ sơ active trước
PROGRESS trong trần byte hiện có, không nạp nội dung hồ sơ hay lịch sử done. Agent phải
đọc full file và đối chiếu Git/PR/CI; khi output bị cắt, liệt kê/đọc file trực tiếp.
Runner không có hook thực hiện cùng bước đọc theo CLAUDE/AGENTS. PreCompact hiện có
chụp Git/PROGRESS; checkpoint công việc vẫn phải ghi vào working.md trước nén.
Không hứa "không bao giờ quên": file/Git giúp phục hồi, còn mất chưa lưu, runner không
đọc chỉ dẫn hoặc bằng chứng bên ngoài không truy cập được phải được báo rõ.

## 4. AI Goal Loop

```text
while Goal DoD chưa đạt:
  reload main + PROJECT/PROGRESS/Goal/Spec + GitHub/CI
  reconcile checklist với code, test và trạng thái thật
  nếu stop condition: checkpoint BLOCKED/WAITING; xin quyết định
  chọn một slice Ready có value/risk-reduction cao nhất
  nếu feature chưa có spec Approved: chỉ research/spec; không code
  plan → implement → verify/repair (tối đa 3 lần cùng failure)
  mở/cập nhật một PR
  nếu chưa có quyền merge hoặc đang chờ CI/review: checkpoint WAITING; dừng
  sau merge/release: đo lại goal gap và checkpoint
final audit → COMPLETE
```

Một iteration = một outcome + một PR. Không xây code phụ thuộc lên base chưa merge nếu tránh được.

## 5. Definition of Ready

- problem/user/outcome/baseline/target/guardrail rõ;
- research có bằng chứng và alternatives kể cả không làm;
- scope/non-goals/dependency/owner rõ;
- UX/states và API/data/contracts đủ để không tự đoán;
- security/privacy/a11y/performance/reliability/cost/failure modes đã đánh giá;
- AC map được tới test;
- migration/rollout/telemetry/rollback cụ thể;
- không còn quyết định product/architecture blocking;
- spec Approved có người/ngày duyệt.

## 6. Definition of Done

- implementation khớp spec; deviation được review;
- AC có bằng chứng; test mới chứng minh behavior/bug (`spec-compiler.sh --trace` COMPLETE; kết quả gắn
  đúng phiên bản qua CI hoặc `dev-task.sh gate --evidence` + `evidence-check`, không qua lời tự khai);
- targeted và full quality gates xanh;
- authorization, validation, privacy, concurrency/idempotency và error recovery được xử lý;
- không secret/production data/debug/dead/generated output ngoài ý muốn;
- contract/migration/docs/ADR/telemetry/runbook cập nhật;
- rollout/rollback và residual risk rõ;
- review threads đóng; required checks xanh.

## 7. Definition of Goal/Project Complete

- mọi AC bắt buộc có bằng chứng trên default branch/release;
- target metric đạt trong cửa sổ đo; guardrail không suy giảm;
- không còn milestone bắt buộc, P0/P1, migration/reconciliation dở;
- regression/security/privacy/a11y/performance/operational gates liên quan xanh;
- UAT/production verification/restore drill hoàn tất nếu thuộc scope;
- ownership, docs, runbook, observability và rollback hoàn chỉnh;
- out-of-scope/residual risks được ghi;
- owner xác nhận completion khi cần quyết định nghiệp vụ.

Backlog trống không đồng nghĩa Project Complete; backlog ngoài scope không ngăn completion.

## 8. Repair, budget và stop conditions

Cùng failure tối đa ba lần: ghi error/giả thuyết → sửa nguyên nhân nhỏ nhất → chạy lại test lỗi và
gate liên quan. Cấm skip/xóa test, hạ threshold, nới auth/validation hoặc che lỗi để xanh.

Dừng `BLOCKED` khi thiếu approval; trade-off product/architecture; destructive/breaking change;
security/payment/user data; cần secret/production/chi phí/quyền mới; CI/review ngoài scope; vượt
budget/guardrail; main làm plan mất hiệu lực; hoặc không còn item Ready. `WAITING` khi chỉ chờ
CI/review/merge. AI không suy ra quyền merge/deploy từ quyền code.

## 9. Governance, data và supply-chain gates

- Public/multi-contributor project: instantiate Governance, Support và Code of Conduct phù hợp.
- Sensitive/personal/regulated data: tạo Data Governance artifact; review retention/export/delete.
- Auth/payment/multi-tenant/automation/high-impact change: threat model trước implementation.
- Release artifact: áp `docs/ops/supply-chain.md` và `docs/ops/release-readiness.md`.
- Repository settings: cấu hình và lưu evidence theo `docs/ops/repository-settings.md`.
- Không claim compliance/SLSA/security level nếu chưa audit đủ requirement.

## 10. Quality gate theo profile

Mỗi project phải điền command thật trong `CLAUDE.md`. Tối thiểu có format/lint/type-or-static
analysis/unit/integration/build-package/security scan; thêm E2E/a11y/performance cho UI/Web,
migration/data tests cho DB, eval/cost/safety cho AI, platform/device tests cho mobile/desktop.

## 11. Cách dùng tài liệu chuyên sâu

- Greenfield bootstrap: `new-project-runbook.md`.
- Brownfield: `existing-project-adoption.md`.
- Quy trình 9 giai đoạn: `01-process-and-standards.md`.
- Research/stack profiles: `03-tech-selection-and-proactive-advice.md`.
- Feature spec nâng cao/OpenSpec: `spec-driven-openspec.md`.
- Điều phối 3 tầng + bảng `route:`: `orchestration-3-tier.md`.
- Model, effort, chế độ tự động: `models-and-automation.md`.
- Cổng chất lượng đo được theo hồ sơ C1–C10 và ma trận bằng chứng (hành vi/UX/dữ liệu/bảo mật/release): `quality-gates-by-profile.md`.
- Mức nghiêm ngặt ngành (ASVS, SOLID, 12-Factor, GDPR/SOC2): `industry-standards.md`.
- Học từ nguồn ngoài (ba cột, cổng "tốt hơn bản hiện có"): `adopt-from-outside.md`.
- Quy trình PR → merge + giải xung đột (luật đầy đủ của CLAUDE.md §8): `pr-flow.md`.
- Hoàn thiện dự án (bản đồ tính năng, vòng hội tụ): `project-completion.md`.
- Checklist chất lượng: `quality-supplements.md`.

Nếu tài liệu chuyên sâu mâu thuẫn contract này, dừng và sửa mâu thuẫn trước khi tiếp tục.
