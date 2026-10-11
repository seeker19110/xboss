# S15 — Audit cuối và release candidate: ánh xạ bằng chứng 54 AC

State: **S15 — CODE_COMPLETE có điều kiện / WAITING_RELEASE**.
Spec cha: [TEST-MATRIX](AUDIT-2026-09-25/TEST-MATRIX.md), [PLAN](AUDIT-2026-09-25/PLAN.md) §S15/§S16,
[A6 Operations](AUDIT-2026-09-25/A6-OPERATIONS.md) §5-6, [APPROVAL](AUDIT-2026-09-25/APPROVAL.md) D09.

Giải thích state: phần code và test tự động (lớp U/P/H) đã đạt ở mức đo được, nhưng lớp **M** (UAT thiết bị,
Safari/iOS thật) và lớp **O** (restore/vận hành trên hạ tầng được cấp quyền) chưa có, một phần lớp **B** còn
đang bổ sung. Theo PLAN §S15, thiếu quyền/bằng chứng release thì **không** được ghi
`RELEASE_VERIFIED`; tài liệu này cũng **không** tự ký thay reviewer, người vận hành hay chủ dự án.

## 1. Phạm vi, SHA và phương pháp

- **SHA đo (baseline):** `e5ce67b` (main sau S14). Mọi cột "@e5ce67b" bên dưới đo trên SHA này.
- **SHA nhánh vá:** `98520f6` (nhánh `claude/confident-goodall-ywps64`, 6 commit vá/test sau `e5ce67b`:
  `f43d5bb`, `048aa2c`, `124ff4d`, `a9d0c2f`, `69a4cdd`, `98520f6`). Cột "@98520f6" là verdict suy ra từ
  test mới đọc trong diff; **bằng chứng sau vá phải được xác nhận lại bằng CI của PR trên SHA cuối**
  (TEST-MATRIX §1: không nhận evidence SHA cũ sau khi đổi code/fixture).
- **Phương pháp:** 4 lượt đọc-chạy độc lập theo trụ (A1 · A2 · A3+A4 · A5+A6, kèm Q-AC tương ứng),
  mỗi lượt ánh xạ AC → test thật theo hành vi (không test nào mang ID AC trong tên) rồi chạy trên
  Postgres cục bộ. Lớp bằng chứng theo TEST-MATRIX §1: U unit/property · P PostgreSQL thật · H HTTP/auth
  thật · B browser SW/IDB/network thật · M UAT thiết bị · O restore/vận hành đích được phép.
- **Luật áp dụng:** skip/NOT_RUN ở ca critical **không** phải PASS; stub, fake IDB, VM Service Worker,
  fetch giả **không** thay lớp P/H/B; Chromium **không** thay Safari/iOS thật; AC còn lớp M/O thì tối đa
  PARTIAL (WAITING_RELEASE), không PASS.
- Không chạy Playwright trong 4 lượt đo; lớp B lấy từ đọc spec `e2e/` + CI run của PR #613. Chỉ Chromium.
- Lưu ý môi trường đo: Node 22.22 cục bộ (CI dùng Node 24); test dùng `mock.module` cần cờ
  `--experimental-test-module-mocks` (đã nằm trong `scripts/test-flags.mjs`, `npm test` tự thêm).

Quy ước tên test trong bảng (đều ở `tests/`, bỏ đuôi `.test.ts`): `MEG` = money-exact-golden,
`CR` = cost-report, `PKPI` = portfolio-kpi, `PCD` = payment-certs-dto, `PQE` = po-qty-exact.

## 2. Bảng 54 AC (46 AC nền + 8 Q-AC)

Verdict: PASS (đủ mọi lớp yêu cầu) · PARTIAL (tự động xanh, còn lớp thiếu) · GAP (thiếu cài đặt/test) · FAIL.

### A1 — Phạm vi, quyền, phiên

| AC      | Lớp   | Bằng chứng (tests/*.test.ts)                                              | @e5ce67b | @98520f6 | Còn thiếu                                            |
| ------- | ----- | ------------------------------------------------------------------------- | -------- | -------- | ---------------------------------------------------- |
| A1-AC01 | P/H/B | project-select-org; permissions-org; route-users-cach-ly-org; s02a..e     | PARTIAL  | PARTIAL  | B hai org, M                                         |
| A1-AC02 | P/H/M | project-scope-security-unit (khẳng định legacy)                           | GAP      | PARTIAL  | cờ XBOSS_STRICT_MEMBERSHIP (PR-A), bật sau duyệt gán |
| A1-AC03 | U/P/H | project-scope-security-unit; s02-import-project-id; p1-6-sheets-scope     | PARTIAL  | PASS     | — (PR-A: 23 route null-scope + rename)               |
| A1-AC04 | P     | db-scope-nested (8 ca); db-begin-read-only; rls                           | GAP      | PASS     | —                                                    |
| A1-AC05 | P/H   | permissions-fail-closed; auth-perms-project; permissions-org              | PARTIAL  | PASS     | — (PR-A: s16-stale-snapshot, 72 handler)             |
| A1-AC06 | P/H   | rls; org-rls; rls-app-role-route; permissions-org                         | PARTIAL  | PASS     | — (PR-B: 0165, s16-rls-strict); staging trước prod   |
| A1-AC07 | P/H   | auth-session-revoke-http; auth; route-auth; audit-auth-project-regression | PARTIAL  | PASS     | —                                                    |
| Q-AC01  | U/P/H | permissions-org; permissions-fail-closed; auth-perms-project              | PARTIAL  | PASS     | — (PR-A: cùng A1-AC05)                               |
| Q-AC07  | P/H/O | runtime-app-role-schema; db-runtime-migration-boundary; health            | GAP      | PASS     | — (PR-A: /api/ready + 503 login/me); O               |

Ghi chú A1:

- A1-AC02: `lib/ha-tang/projects.ts` còn nhánh `user_projects` rỗng → thấy mọi dự án cùng org; test hiện
  khẳng định hành vi legacy này. Đây là thiếu cài đặt thuộc cutover D01, **chưa sửa** (xem mục 6a).
- A1-AC03: sau vá phủ thêm số vượt safe-integer, import Excel với cookie dự án sai kiểu → 404 không ghi.
  Còn lại: `getCurrentProjectId` với cookie thiếu/sai vẫn chọn dự án đầu trong quyền (trái A1-FR02).
- A1-AC04: lồng khác dự án/actor/'*'/nâng readOnly bị từ chối; COMMIT/ROLLBACK trả connection sạch GUC;
  24 request song song qua pool max=3 không rò chéo (xem mục 5).
- A1-AC06: đã assert app role NOBYPASSRLS, không superuser, không sở hữu bảng RLS, route tài chính chạy bằng
  app role thấy đúng dữ liệu; còn nợ nhánh GUC rỗng trên các bảng org/dự án (mục 6b).
- Q-AC07: ca `db-runtime-migration-boundary` đỏ cục bộ chỉ do `mock.module("pg")` không hiệu lực trên
  Node 22.22; phải xác nhận lại trên Node 24 (CI). Lớp O (production dùng app role + job migrate
  riêng) là WAITING_RELEASE.

### A2 — Ngoại tuyến

| AC      | Lớp     | Bằng chứng (tests/*.test.ts)                                           | @e5ce67b | @98520f6 | Còn thiếu                           |
| ------- | ------- | ---------------------------------------------------------------------- | -------- | -------- | ----------------------------------- |
| A2-AC01 | B/M     | e2e offline-recovery (b); audit-s08-offline-recovery                   | PARTIAL  | PARTIAL  | M Safari/iOS                        |
| A2-AC02 | B/H/P   | offline-queue-route; audit-s08-sw-allowlist                            | PARTIAL  | PARTIAL  | SSE sau switch, B 2 tab             |
| A2-AC03 | U/B/P   | offline-queue; offline-queue-route (+3 ca S15)                         | PARTIAL  | PARTIAL  | B dedup/batch thật                  |
| A2-AC04 | P/H/B   | offline-queue-route (20 request đồng thời)                             | PARTIAL  | PARTIAL  | B 2 tab/lease/crash                 |
| A2-AC05 | B       | audit-offline-store-commit (IDB giả); e2e offline-idb-abort (IDB thật) | GAP      | PASS     | —                                   |
| A2-AC06 | U/H/B   | offline-queue; offline-queue-vault; offline-queue-route                | PARTIAL  | PARTIAL  | B hàng đợi qua mạng thật            |
| A2-AC07 | B/M     | offline-queue-vault; audit-offline-store-commit (IDB giả)              | GAP      | PARTIAL  | M Safari/iOS (B xong: offline-deep) |
| A2-AC08 | B/M     | offline-queue-vault (lease); audit-s08-sw-allowlist                    | GAP      | PARTIAL  | M (B xong: SW restart, mất ACK)     |
| A2-AC09 | H/B/M   | audit-s08-sw-allowlist; offline-vault-route                            | PARTIAL  | PARTIAL  | M Safari/iOS, B hết lease           |
| A2-AC10 | P/H/B   | offline-queue-route (If-Match/If-None-Match)                           | PARTIAL  | PARTIAL  | B diary conflict thật               |
| Q-AC02  | P/H/B/M | offline-vault-route                                                    | PARTIAL  | PARTIAL  | B KEK rotation, M                   |
| Q-AC03  | H/B/M   | offline-vault-route                                                    | PARTIAL  | PARTIAL  | B clock rollback, M                 |

Ghi chú A2: sau vá chỉ A2-AC03 (nhật ký cùng ngày khác chủ/dự án độc lập, chủ thứ hai bị conflict không đè)
và A2-AC06 (403/404/422 từ route thật → `rejected` bền vững) được bổ sung lớp P/H; không đổi verdict vì
lớp B/M vẫn thiếu. Lớp B thật hiện chỉ có `e2e/authed/offline-recovery.spec.ts` (a-d) + `e2e/offline.spec.ts`
(Chromium). Các test IDB/SW/lease dùng IDB giả hoặc VM **không** tính là B.

### A3 — Tiền exact

| AC      | Lớp     | Bằng chứng (tests/*.test.ts)                                                         | @e5ce67b | @98520f6 | Còn thiếu               |
| ------- | ------- | ------------------------------------------------------------------------------------ | -------- | -------- | ----------------------- |
| A3-AC01 | U/P/H/M | MEG; CR; s15-vo-exact (v1 tổng 2^53 xu)                                              | PARTIAL  | PARTIAL  | M số lớn trên thiết bị  |
| A3-AC02 | U/P     | MEG                                                                                  | PASS     | PASS     | —                       |
| A3-AC03 | U/P     | MEG                                                                                  | PASS     | PASS     | —                       |
| A3-AC04 | U/P     | MEG (3000 mẫu, oracle bigint)                                                        | PASS     | PASS     | —                       |
| A3-AC05 | H/B/M   | PCD; s10c-*; s15-vo-exact; e2e payment-certs-canh-bao (exact trên màn, 403 không lộ) | GAP      | PARTIAL  | M (UAT thiết bị)        |
| A3-AC06 | P/H/M   | MEG (ipc-sum-v1); s15-vo-exact                                                       | PARTIAL  | PARTIAL  | M chứng từ IPC/PDF thật |

### A4 — Báo cáo

| AC      | Lớp     | Bằng chứng (tests/*.test.ts)                                    | @e5ce67b | @98520f6 | Còn thiếu                                                       |
| ------- | ------- | --------------------------------------------------------------- | -------- | -------- | --------------------------------------------------------------- |
| A4-AC01 | P/H     | CR                                                              | PASS     | PASS     | —                                                               |
| A4-AC02 | P/H     | CR                                                              | PASS     | PASS     | —                                                               |
| A4-AC03 | P/H     | CR (+ ca NaN/±Inf)                                              | PASS     | PASS     | —                                                               |
| A4-AC04 | P/H     | CR (snapshot REPEATABLE READ)                                   | PASS     | PASS     | —                                                               |
| A4-AC05 | U/P/H/B | PKPI; e2e portfolio-kpi (10%/"Chưa có dữ liệu", không NaN/100%) | GAP      | PASS     | —                                                               |
| A4-AC06 | P/H/B   | PKPI (khớp status/visibility); CR (nhãn T1 trùng, 403)          | GAP      | PARTIAL  | B                                                               |
| A4-AC07 | P/H     | PKPI (ngày VN, kế thừa ngày KT nhóm)                            | PASS     | PASS     | —                                                               |
| A4-AC08 | P/H/M   | bao-cao-a4-ac08; `npm run bench:reports`                        | PARTIAL  | PARTIAL  | baseline đã ghi (PR-A, role app); so ±10% lần sau; dữ liệu thật |

Ghi chú A4-AC08: p95 đạt ngưỡng D09 trên fixture tổng hợp (xem
[AUDIT-A4-AC08-BENCHMARK](AUDIT-A4-AC08-BENCHMARK.md)); so baseline ±10% là NOT_RUN vì chưa có baseline trước
thay đổi; lần đo dùng role owner (không RLS).

### A5 — Chuỗi nghiệp vụ

| AC      | Lớp   | Bằng chứng (tests/*.test.ts)                                                        | @e5ce67b | @98520f6 | Còn thiếu                   |
| ------- | ----- | ----------------------------------------------------------------------------------- | -------- | -------- | --------------------------- |
| A5-AC01 | P/H   | s13a-chuoi-dong-bo-vat-tu; s15-import-route-rerun                                   | PASS     | PASS     | —                           |
| A5-AC02 | P/H   | s13a-chuoi-tien-do-nghiem-thu                                                       | PASS     | PASS     | —                           |
| A5-AC03 | P/H/B | s13a-chuoi-tien-do-nghiem-thu; s15-dong-thoi-lo                                     | PARTIAL  | PARTIAL  | B batch/approve đồng thời   |
| A5-AC04 | P/H/B | s13a-chuoi-ipc-thanh-toan; e2e payment-certs-canh-bao (409 thiếu ack, hộp xác nhận) | PARTIAL  | PASS     | —                           |
| A5-AC05 | P/H   | s13a-chuoi-ipc-thanh-toan                                                           | PASS     | PASS     | —                           |
| A5-AC06 | P/H/M | s13a-chuoi-ipc-thanh-toan; s13e                                                     | PARTIAL  | PARTIAL  | M UAT hợp đồng thật         |
| A5-AC07 | P/H/M | s13a-chuoi-ipc-thanh-toan; m128-dieu-chinh-ipc (+B e2e payment-certs-canh-bao)      | PARTIAL  | PARTIAL  | M UAT điều chỉnh HĐ thật    |
| A5-AC08 | P/H/B | s13a-chuoi-ipc-thanh-toan (+2 ca S15); m129-ipc-da-chi (9 ca)                       | GAP      | PASS     | M129 (pay_status), B        |
| A5-AC09 | B/M   | s13c; s13a; e2e payment-certs-canh-bao (retry không tự ack, bàn phím, axe)          | GAP      | PARTIAL  | M (7 vai trò thiết bị thật) |

### A6 — Vận hành, PITR, DR

| AC      | Lớp     | Bằng chứng (tests/*.test.ts)                               | @e5ce67b | @98520f6 | Còn thiếu                           |
| ------- | ------- | ---------------------------------------------------------- | -------- | -------- | ----------------------------------- |
| A6-AC01 | O/P/H   | pitr-drill; dr-recovery-verify (fixture)                   | PARTIAL  | PARTIAL  | O restore thật                      |
| A6-AC02 | O       | dr-recovery-verify; audit-recovery-files; pitr-archive     | PARTIAL  | PARTIAL  | O trên backup thật, key thật        |
| A6-AC03 | U/O     | dr-recovery-verify; pitr-drill                             | PASS     | PASS     | —                                   |
| A6-AC04 | P/O     | dr-recovery-verify (+6 ca app-role-rls); audit-dr-readonly | PARTIAL  | PARTIAL  | O bản restore thật                  |
| A6-AC05 | O/M     | pitr-drill; pitr-archive                                   | PARTIAL  | PARTIAL  | RPO/RTO thật, M runbook             |
| A6-AC06 | O       | pitr-drill; restore-check                                  | PARTIAL  | PASS     | — (PR-A: M130 retention-cleanup); O |
| Q-AC08  | O/P/H/M | pitr-archive; pitr-drill                                   | PARTIAL  | PARTIAL  | PITR thật, canary, S3 version       |

### Q-AC còn lại (nằm trong trụ A3/A4)

| AC     | Lớp     | Bằng chứng (tests/*.test.ts)     | @e5ce67b | @98520f6 | Còn thiếu |
| ------ | ------- | -------------------------------- | -------- | -------- | --------- |
| Q-AC04 | P/H/B/M | s15-vo-exact (5 ca); PCD; s10c-* | GAP      | PARTIAL  | B, M      |
| Q-AC05 | P/H     | CR (lineage lệch dự án)          | PASS     | PASS     | —         |
| Q-AC06 | P/U/H   | PQE (+3 ca); CR (NaN/±Inf)       | GAP      | PASS     | —         |

Ghi chú: `A6-AC04` không đổi verdict vì verifier nay phát hiện role app sai (BYPASSRLS, superuser, sở hữu
bảng RLS, mất FORCE RLS, thiếu role đều FAIL) nhưng lớp O trên bản restore thật vẫn NOT_RUN.
`Q-AC04` (GAP→PARTIAL): đường đọc `GET /api/variations` đã exact; thiếu B/M.

## 3. Tổng hợp

| Thời điểm               | PASS | PARTIAL | GAP | FAIL | Tổng |
| ----------------------- | ---- | ------- | --- | ---- | ---- |
| @e5ce67b (đo)           | 13   | 28      | 13  | 0    | 54   |
| @98520f6 (sau vá P/H)   | 16   | 31      | 7   | 0    | 54   |
| @5a36ff2 (sau vá lớp B) | 19   | 32      | 3   | 0    | 54   |
| @7f587bc (đo lại, §9)   | 26   | 28      | 0   | 0    | 54   |

- Chuyển GAP → PASS (2): A1-AC04, Q-AC06. Chuyển PARTIAL → PASS (1): A1-AC07 (A1-AC05/Q-AC01 giữ PARTIAL: thiếu ca stale snapshot).
- Chuyển GAP → PARTIAL (4): Q-AC07, A4-AC06, Q-AC04, A5-AC08.
- Sau lớp B: A2-AC05, A4-AC05 → PASS; A5-AC04 PARTIAL → PASS; A3-AC05, A5-AC09 → PARTIAL (còn M).
- GAP còn lại (3): A1-AC02 (cutover membership — chờ quyết định), A2-AC07, A2-AC08 (B/M offline sâu).
- Không AC nào PASS khi còn lớp M/O yêu cầu. 0 FAIL ở cả hai thời điểm.

## 4. Lỗi thật phát hiện trong S15 và cách xử lý

| #   | Lỗi                                               | Nguyên nhân gốc                                                                    | Xử lý                                                                                                        |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Q-AC04: `GET /api/variations` trả tiền float      | `json_agg` + `SUM` numeric đọc thẳng → JSON number                                 | `124ff4d`: tổng `ROUND(...)::text`, adapter `variationsToWire`, opt-in `decimal-string-v1`, ngoài biên → 422 |
| 2   | A1-AC04: transaction lồng đổi scope/actor âm thầm | `withProjectScope` lồng chỉ `set_config` tiếp trên cùng client (`lib/db/index.ts`) | `98520f6`: từ chối lồng khác dự án/actor/'*'/nâng readOnly; connection luôn trả sạch GUC                     |
| 3   | `VariationsTab` luôn rỗng                         | đọc sai khoá dữ liệu trả về                                                        | `124ff4d`: sửa cùng đợt đổi DTO                                                                              |
| 4   | Parser khối lượng: `"0.125"` bị coi mơ hồ         | phần nguyên 0 không thể là nhóm nghìn nhưng bị xử như `1.500`                      | `69a4cdd`: nhận là thập phân (`lib/nen/money.ts`), `1.500` vẫn mơ hồ                                         |
| 5   | `/commercial` không gửi header tiền v1 (legacy)   | trang vẫn đọc contracts dạng number                                                | `69a4cdd`: gửi header v1, client đọc chuỗi exact                                                             |
| 6   | A6-AC04: verifier DR không kiểm role app của đích | chỉ kiểm role audit; role bypass bị che thành NOT_RUN                              | `048aa2c`: hạng mục `app-role-rls`, vi phạm → FAIL                                                           |

Test hồi quy: `s15-vo-exact` đỏ 5/6 trên code cũ; test A6-AC04 đỏ 1 ca trên code cũ rồi xanh.

## 5. Phạm vi đã chạy tự động (tham chiếu)

Mỗi lượt đo ghi số ca pass/fail/skip: 0 skip critical; `health.test.ts` 1 ca skip có allowlist (chỉ chạy khi
không có DB); duy nhất 1 ca đỏ ở lượt A1 là hiện tượng Node 22 (mục Q-AC07). Các test sau vá nằm ở:
`db-scope-nested`, `permissions-fail-closed`, `auth-session-revoke-http`, `rls-app-role-route`,
`runtime-app-role-schema`, `s02-import-project-id`, `s15-dong-thoi-lo`, `s15-import-route-rerun`,
`s15-vo-exact`, và các ca thêm vào `cost-report`, `portfolio-kpi`, `po-qty-exact`,
`offline-queue-route`, `s13a-chuoi-ipc-thanh-toan`, `dr-recovery-verify`, `audit-dr-readonly`.

## 6. Còn mở — cần chủ dự án quyết / WAITING_RELEASE

Không mục nào dưới đây được tự quyết hoặc code trong S15.

- **(a) Cutover membership rỗng (A1-AC02) + cookie sai → dự án đầu (A1-AC03).** Lý do: D01 đòi membership
  rỗng không mở quyền và không chọn dự án đầu âm thầm, nhưng đổi hành vi này làm người dùng hiện tại có thể
  mất quyền xem. Đề xuất: chạy dry-run membership trên production (chỉ đọc), chủ dự án duyệt danh sách gán,
  rồi cutover bằng slice riêng qua staging; sau đó đảo hai ca legacy trong `project-scope-security-unit`.
- **(b) RLS nhánh "GUC rỗng cho qua" còn trên ~18 bảng org/dự án:** suppliers, users, projects,
  role_permissions, api_keys, webhooks, integrations, alert_rules, approval_flows, boq_codes, code_lists,
  custom_field_defs, feature_flags, org_cost_settings, saved_reports, baselines, floor_stage_fronts,
  construction_stages. App role không đặt GUC đọc được dữ liệu cả hai org. Lớp app vẫn lọc org (S02 sweep +
  `org-scope-invariant`) nên xếp **P2 defense-in-depth**. Sửa cần migration + đổi login/`getCurrentUser` sang
  scope `'*'` tường minh → đề xuất slice riêng, chạy qua staging (migration đụng policy).
- **(c) Tính năng adjustment (A5-AC07):** hiện chỉ chặn huỷ upstream/trả conflict, chưa có chứng từ điều chỉnh
  để kiểm quyền/audit. Cần chủ nghiệp vụ chốt luồng. → **xong (M128):** chứng từ điều chỉnh/huỷ hiệu lực
  IPC (`payment_cert_adjustments`, nháp→trình→duyệt SoD, phiếu `adjustment` ròng, luỹ kế hiệu lực, trigger
  hồ sơ chốt; xem `M128-*.md`, PROGRESS 2026-10-09). Lớp P/H (+B e2e) đủ; A5-AC07 giữ PARTIAL chỉ vì lớp M
  (UAT điều chỉnh trên hợp đồng thật) chưa chạy — theo luật "không PASS khi còn lớp M".
- **(d) Retention/cleanup diễn tập (A6-AC06):** chưa có chính sách retention evidence và quyền cleanup;
  `docs/ops/backup.md` đang giao `rm -rf` thủ công cho người vận hành.
- **(e) "approved ≠ paid" (A5-AC08):** duyệt IPC sinh phiếu thanh toán ngay nên không biểu diễn được trạng
  thái chưa-chi/đã-chi. → **xong (M129):** `payment_bills.pay_status` committed/paid, route đánh dấu chi
  (SoD), `actual` chỉ phiếu đã chi, `approvedUnpaid` tách riêng (xem `M129-*.md`, PROGRESS 2026-10-09).
- **(f) Readiness endpoint riêng và login/me trả 503 JSON khi schema thiếu (Q-AC07):** hiện chỉ có
  `/api/health`; login/me ném lỗi → 500. Cần quyết có làm không.
- **(g) PITR VPS chưa bật:** RPO thực ~24 giờ; RPO 5 phút / RTO 60 phút **NOT_RUN**; canary và archive lag
  trên hạ tầng thật NOT_RUN; cửa sổ 35 ngày FAIL cho tới khi có archive thật; `encryption-key-availability`
  luôn NOT_RUN; chưa ghi version object S3.
- **(h) Safari/iOS thật NOT_RUN;** e2e trên Turbopack NOT_RUN (chỉ Chromium).
- **(i) A4-AC08:** baseline ±10% chưa có (cần số đo trước thay đổi hoặc chủ dự án chấp nhận baseline mới
  ghi tại `e5ce67b`); chưa đo trên dữ liệu production-size.
- **(j) `.env.example`** cần thêm `XBOSS_OFFLINE_KEK` và `GOOGLE_SHEET_PROJECT_ID`; file bị khoá với agent,
  người có quyền cập nhật.
- **(k) UAT lớp M** (7 vai trò trên thiết bị, số lớn, IPC/PDF thật, hợp đồng thật) và đánh giá độc lập của
  reviewer: chưa ghi, không được tick thay.

### Cập nhật sau S15 (PR-A, 2026-10-09)

- **(a)** → cutover theo cờ `XBOSS_STRICT_MEMBERSHIP` + script dry-run + runbook
  `AUDIT-S16-MEMBERSHIP-CUTOVER.md` (mặc định TẮT, bật sau khi chủ dự án duyệt danh sách gán); phần
  "cookie sai → dự án đầu"/`projectId == null` đóng ở `AUDIT-S16-NULL-SCOPE.md` (23 route + rename).
- **(b)** → **xong (PR-B)**: migration 0165 + `withOrgScope`/cron theo từng org (`AUDIT-S16-RLS-STRICT.md`);
  **bắt buộc staging trước production**, Metabase view cần GUC/BYPASSRLS (chủ dự án quyết).
- **(c)** → **xong (M128)**: đặc tả `M128-chung-tu-dieu-chinh-ipc.md`, migration 0168.
- **(d)** → **xong** (M130, `scripts/retention-cleanup.ts`, `docs/ops/backup.md`).
- **(e)** → đặc tả `M129-ipc-da-chi-tach-cam-ket-thuc-chi.md` (Approved).
- **(f)** → **xong** (`/api/ready`, login/me 503 `schema_not_ready`).
- **(i)** → **xong**: `bench/a4-ac08-baseline.json` ghi khi máy rảnh, role `xboss_app`; lần đo sau so ±10%.
- A1-AC05/Q-AC01: ca stale snapshot đã có, mở rộng 72 handler (`AUDIT-S16-QUYEN-LUC-GHI.md`).
- A2-AC07/AC08: lớp B xong (`e2e/authed/offline-deep.spec.ts`), còn M Safari/iOS.

## 7. Checklist S16 (production do người vận hành được cấp quyền)

S16 chỉ bắt đầu khi **người vận hành được cấp quyền thực hiện**; agent không tạo automation, scheduler hay
chạy lệnh production thay họ.

Điều kiện vào:

- [ ] Release SHA cố định; CI xanh đúng SHA đó (không critical skip mới, không P0/P1 còn mở).
- [ ] Environment, secret, chi phí, quyền merge/deploy rõ; người vận hành/reviewer/người giữ key/on-call
      được ghi tên.
- [ ] Mục 6 đã được chủ dự án quyết hoặc ghi chấp nhận rủi ro cho từng mục (đặc biệt a, b, g).
- [ ] UAT lớp M (đủ vai trò, Safari/iOS thật, desktop/mobile, axe, money/export, IPC warning,
      hàng đợi mã hoá).

Thứ tự (APPROVAL D09 + A6 §5):

1. **Backup đã thử:** full backup + restore cô lập đã verify (`audit:verify-dr` PASS, key khả dụng).
2. **Preflight:** schema/migration (chạy bước migrate riêng bằng role migration, runtime chỉ kiểm bằng role
   app), membership dry-run, legacy queue; `db:migrate -- --dry-run`; staging nếu migration đụng dữ liệu.
3. **Pilot 1 dự án nội bộ 48 giờ.**
4. **Tối đa 25% dự án trong 24 giờ.**
5. **Mở rộng và quan sát 7 ngày.** Cần đủ giao dịch/tình huống, không chỉ đợi đồng hồ.

Dừng mở rộng ngay khi: rò dữ liệu liên org/dự án; sai tiền; mất draft đã ACK do app; bypass nghiệm thu/QA;
archive lag vượt guardrail; p95 vượt ngưỡng D09 (không hạ ngưỡng để lấy PASS).

Rollback ba lớp (không down-migrate phá bảng, không khôi phục cache chung/fallback dự án 1, không tự
reset admin):
(1) đưa code về bản hiểu schema/queue hiện tại; (2) đóng capability lỗi nhưng giữ fail-closed;
(3) dữ liệu đã chốt xử lý forward-fix/adjustment được duyệt. Restore production thật là hành động riêng,
có quyền và tác động dữ liệu rõ.

Kết thúc: ghi evidence (runbook/version/lệnh/target manifest/CI URL) rồi **chủ dự án xác nhận**
`RELEASE_VERIFIED`; không ai khác ký thay.

## 8. Lệnh tái lập bằng chứng

Cần `TEST_DATABASE_URL` trỏ Postgres riêng (file test chạm DB import `tests/setup.ts` đầu tiên).
Chạy thẳng từng
file bằng `tsx` thì phải thêm cờ mock-module, nếu không `mock.module is not a function`:

```bash
export TEST_DATABASE_URL=<chuỗi kết nối DB test riêng>
npm test -- --release-gate                      # đúng cờ của CI, ca skip = lỗi
FLAG=--experimental-test-module-mocks
# A1
npx tsx $FLAG --test tests/db-scope-nested.test.ts tests/permissions-fail-closed.test.ts \
  tests/auth-session-revoke-http.test.ts tests/rls-app-role-route.test.ts \
  tests/runtime-app-role-schema.test.ts tests/s02-import-project-id.test.ts \
  tests/project-scope-security-unit.test.ts tests/db-runtime-migration-boundary.test.ts
# A2
npx tsx $FLAG --test tests/offline-queue-route.test.ts tests/offline-vault-route.test.ts \
  tests/offline-receipt-route.test.ts tests/offline-queue-vault.test.ts
# A3 + A4 + Q-AC04..06
npx tsx $FLAG --test tests/s15-vo-exact.test.ts tests/cost-report.test.ts \
  tests/portfolio-kpi.test.ts tests/po-qty-exact.test.ts
# A5
npx tsx $FLAG --test tests/s13a-chuoi-ipc-thanh-toan.test.ts tests/s15-dong-thoi-lo.test.ts \
  tests/s15-import-route-rerun.test.ts
# A6
npx tsx $FLAG --test tests/dr-recovery-verify.test.ts tests/audit-dr-readonly.test.ts \
  tests/pitr-archive.test.ts tests/pitr-drill.test.ts
npm run bench:reports                           # A4-AC08, p50/p95/max trên fixture 10.000 task
npm run audit:verify-dr                         # verifier DR; cần biến DR_VERIFY_* (xem docs/ops/backup.md)
npm run test:e2e                                # lớp B (Playwright, Chromium); cần DB + .env.local
npm run gate -- --test --build                  # cổng cục bộ = job static của CI
```

## Cập nhật sau lớp B

Worker e2e (Chromium, authed-desktop + authed-mobile, 2 lượt liên tiếp + `--repeat-each=6` cho spec IPC):
35 passed / 0 failed. Helper `e2e/helpers/co-lap.ts` tạo tổ chức/dự án/người dùng riêng cho spec cần số
tuyệt đối (spec authed chạy song song trên cùng DB). CI xác nhận lại trên SHA cuối của PR.

| AC      | Spec e2e                                    | Verdict cuối | Ghi chú                                          |
| ------- | ------------------------------------------- | ------------ | ------------------------------------------------ |
| A4-AC05 | `e2e/authed/portfolio-kpi.spec.ts`          | PASS         | 10% (không 50%), rỗng → "Chưa có dữ liệu"        |
| A5-AC04 | `e2e/authed/payment-certs-canh-bao.spec.ts` | PASS         | 409 `acknowledgement_required`, hộp xác nhận     |
| A5-AC09 | `e2e/authed/payment-certs-canh-bao.spec.ts` | PARTIAL      | retry 409 không tự ack; bàn phím; axe; M NOT_RUN |
| A3-AC05 | `e2e/authed/payment-certs-canh-bao.spec.ts` | PARTIAL      | "100.50"/"9999999999999.99" exact; M NOT_RUN     |
| A2-AC05 | `e2e/authed/offline-idb-abort.spec.ts`      | PASS         | IDB thật abort → không báo "đã lưu", giữ form    |

Lỗi UI thật lộ ra khi viết e2e (đã sửa trong cùng PR, `test.fixme` đã gỡ, e2e xanh desktop+mobile):
tương phản khối cảnh báo vượt HĐ ở theme sáng (`text-rose-200` không có token sáng — đổi 3 khối IPC sang
`text-rose-300`; **không** thêm override `--color-*-200` vào `globals.css` vì `-200` là chữ nhạt trên nền
`-900/-950` của ~180 chip, override toàn cục làm CI e2e đỏ 4 shard — ADR-0010); Esc trên hộp xác nhận
đóng luôn chứng từ và mất focus; chứng từ IPC tràn ngang trên mobile 393px (lưới + select hợp đồng
`min-w-[260px]` không co). Ngoài ra `ProjectCard` dự án rỗng hiện "0% tiến độ" (COALESCE 0) — chỉ ghi nhận.

## 9. Đo lại trên main `7f587bc` (2026-10-11)

Đo lại toàn bộ lớp U/P/H trên main `7f587bc` (sau #615–#630: PR-A/PR-B, M128, M129, M130, M131, tái
kiểm quyền lúc ghi mọi miền, IPC duyệt tuần tự, tạm tính exact). Không đổi code/test.

**Môi trường:** PostgreSQL 16.15 cục bộ (cluster disposable, role `ci` superuser như CI), Node 24.21.0
(cùng major với CI — tránh hiện tượng `mock.module` của Node 22 ở Q-AC07), `npm ci` đúng lockfile.

| Lượt | Lệnh                                                                                                           | Kết quả                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | `TEST_DATABASE_URL=… npm test -- --release-gate`                                                               | 373 file · 5028 pass · 3 fail · 1 skip (allowlist)            |
| 2    | như trên + `GITHUB_ACTIONS=true`, `RESTORE_TEST_MARKER` (marker 32 hex), `RESTORE_TEST_SERVER_IP` (như job CI) | 373 file · **5031 pass · 0 fail** · 1 skip (allowlist), 309 s |

- 3 ca đỏ lượt 1 đều ở `restore-check-postgres`: smoke restore cố ý chỉ chạy khi có marker disposable
  của CI (khẳng định `GITHUB_ACTIONS === "true"`). Lượt 2 đặt đúng biến như CI → 3/3 xanh. Không phải lỗi.
- Ca skip duy nhất: `health.test.ts` (`skip: HAS_TEST_DB`, có lý do trong `scripts/test-skip-allowlist.json`).
- Hai lượt liên tiếp cùng kết quả trên mọi file bằng chứng — không thấy ca chập chờn.
- **Lớp B + mutation:** CI push main `7f587bc` ([run 38006167893](https://github.com/seeker19110/xboss/actions/runs/38006167893))
  11/11 job xanh: static, test (Postgres) + **mutation** + ERD, coverage, build, e2e 1–4/4 (Chromium desktop +
  mobile). Spec lớp B dẫn trong bảng (`offline-recovery`, `offline-idb-abort`, `offline-deep`,
  `payment-certs-canh-bao`, `portfolio-kpi`, `thiet-bi-offline-admin`) nằm trong các shard đó. Không chạy
  Playwright cục bộ.

**Số ca của file bằng chứng (lượt 2, mọi file 0 fail):** A1 — `audit-auth-project-regression` 27,
`s16-null-scope` 18, `auth`/`route-auth` 15/15, `route-users-cach-ly-org` 14, `s16-rls-strict` 12,
`s16-stale-snapshot` 10, `db-scope-nested` 9, `project-scope-security-unit` 9, `s16-quyen-ghi-mo-rong` 8,
`s16-readiness` 6, `s16-app-role-duong-phu` 5; A2 — `offline-vault-route` 20, `offline-recovery-route` 13,
`offline-queue-route` 7, `offline-vault-bao-tri` 4; A3/A4/Q — `money-exact-golden` 17,
`payment-certs-money-dto` 17, `cost-report` 12, `po-qty-exact` 10, `s15-vo-exact` 6, `portfolio-kpi` 6,
`bao-cao-a4-ac08` 4; A5 — `m128-dieu-chinh-ipc` 28, `s13a-chuoi-ipc-thanh-toan` 18,
`s13a-chuoi-tien-do-nghiem-thu` 13, `s13c-ipc-quyet-dinh` 11, `m129-ipc-da-chi` 11, `s13e-de-xuat-vo-quyet-dinh` 9;
A6 — `dr-recovery-verify` 24, `audit-dr-readonly` 14, `restore-check-postgres` 3. File không chạm DB
(`offline-queue*`, `audit-s08-*`, `audit-offline-store-commit`, `pitr-drill`, `pitr-archive`,
`audit-recovery-files`, `restore-check`, `retention-cleanup`, `s10c-*`…) chạy gộp 1 tiến trình: 764/764.

**Đính chính bảng §2:** viết tắt `PCD` là `payment-certs-money-dto` (không có file `payment-certs-dto`).

### 9.1 Verdict @7f587bc

Luật giữ nguyên §1: AC còn lớp M/O yêu cầu thì tối đa PARTIAL; không nâng verdict khi chưa đọc bằng
chứng lớp B tương ứng.

- **Không AC nào bị hạ:** mọi bằng chứng tự động ở cột verdict cuối của §2 (cột `@98520f6`, đã được các PR
  sau cập nhật) còn xanh trên `7f587bc`.
- **Không AC nào được nâng:** 28 AC PARTIAL đều còn lớp M (UAT thiết bị, Safari/iOS thật, hợp đồng/IPC-PDF
  thật), lớp O (restore/PITR/production) hoặc một ca B cụ thể chưa có (A1-AC01 B hai org; A2-AC02/03/04/06/10
  B 2 tab/lease/dedup/diary conflict; A4-AC06 B; A5-AC03 B approve đồng thời).
- **Tổng:** 26 PASS · 28 PARTIAL · 0 GAP · 0 FAIL. Hàng `@5a36ff2` ở §3 (19/32/3) là số trước PR-A/PR-B/
  M128/M129 — 3 GAP cũ (A1-AC02, A2-AC07, A2-AC08) đã thành PARTIAL (cờ cutover; lớp B `offline-deep`).

### 9.2 Chưa đo trong lượt này

- `npm run bench:reports -- --baseline` (A4-AC08 ±10%): cần cùng cấu hình `roleApp/cpus/tasks/concurrency`
  với `bench/a4-ac08-baseline.json`; máy đo khác → NOT_RUN.
- `npm run test:mutation` cục bộ: không chạy, dựa vào bước mutation xanh của CI push main cùng SHA.
- Lớp M/O: như §6/§7 — vẫn WAITING_RELEASE, không ký `RELEASE_VERIFIED`.
