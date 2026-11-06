# AUDIT-REPORT — XBoss · 2026-11-06

> Commit quét: `8501d698` (nhánh `claude/zen-lovelace-n3t0t7` = `main` `c1791206` + PR #711 thumbnail ảnh) · Phạm vi: toàn bộ (`/audit full`, gọi từ `/complete` bước 0 theo lựa chọn của chủ repo "Audit trước, chưa đổi pha") · Người quét: 4 subagent `reviewer` read-only theo cụm · Xác minh đối kháng: `reviewer-alt` (claude-opus-5-5, effort max), độc lập với người tìm
> `xt.py audit check docs/ops/AUDIT-STATUS.md` → exit 0 (không `--strict`: còn 8 nhóm chưa quét)

## 1. Tóm tắt

| Mức |  Mở | Đã sửa | Chấp nhận | Bác bỏ |
| --- | --: | -----: | --------: | -----: |
| 🔴  |   0 |        |           |        |
| 🟠  |   1 |        |           |        |
| 🟢  |  16 |        |           |        |

Kết luận: **chưa đủ để nói "phát hành được"** — không có 🔴, nhưng 8/13 nhóm (ARCH, SEC, CODE, TEST, PERF, DEP, CI, CFG) chỉ được rà nông qua các script `check:*` có sẵn và đọc mẫu, hai cụm tương ứng tự kết luận INCONCLUSIVE nên sổ ghi `chưa quét`. "Không thấy lỗi" ở các nhóm đó **không phải** "sạch".

## 2. Phạm vi và tín hiệu

`xt.py audit plan` @ 8501d698: 2339 file · js/ts 1446, shell 27, python 1 · test 519 · UI 227 · migration/SQL 176 · CI 11 workflow. Cả 13 nhóm áp dụng.
Công cụ thiếu (→ `chưa biết`): gitleaks, semgrep, osv-scanner, actionlint, zizmor, lychee, k6, knip/jscpd (cấm `npx` gói ngoài package.json theo `.claude/rules/00-uu-tien-ecc.md` §15). Bù bằng: job CI `gitleaks`, `CodeQL`, `dependency-review`, `lighthouse`, `coverage` (xanh trên #711 cùng nội dung), và các script `check:*` của repo.

Cụm quét:

- SEC/CFG/DEP/CI — INCONCLUSIVE (chỉ script `check:*` + spot-check; chưa rà từng route, upload, IDOR, CSRF).
- ARCH/CODE/TEST/PERF — INCONCLUSIVE (lint/typecheck/lib-layers/dead-code + đọc `recompute.ts`; vùng §8 khác, route tài chính/nghiệm thu, N+1 chưa đọc).
- A11Y/DATA — rút gọn (quét tĩnh + DB test; chưa chạy axe trong trình duyệt).
- DOC/HAR/XFEAT — rút gọn.

## 3. Lệnh đã chạy

| Nhóm    | Lệnh                                                                                                                  |    Exit | Kết quả chính                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------- |
| chung   | `npm run gate`                                                                                                        |       0 | 18/18 cổng tĩnh xanh                                                                  |
| SEC     | `npm run -s check:route-perms` / `check:project-scope` / `check:db-params`                                            |       0 | whitelist 22 / 397 route quét, whitelist 8 / OK                                       |
| SEC/CFG | grep pattern khoá (`sk_live_`, `AKIA`, `BEGIN … PRIVATE KEY`, `ghp_`, `xox?-`) toàn cây (trừ node_modules/.next/.git) |       0 | 3 kết quả, đều là fixture test/chuỗi mẫu `.env.example`                               |
| DEP     | `npm audit --omit=dev --json`                                                                                         |       — | 8 moderate, 0 high/critical                                                           |
| CI      | grep `permissions:` / `uses:` ghim SHA / `pull_request_target`                                                        |       0 | 11/11 có permissions, mọi action ghim SHA 40 ký tự, không có pull_request_target thật |
| ARCH    | `npm run -s check:lib-layers`                                                                                         |       0 | 172 file, 12 miền, không chu trình                                                    |
| CODE    | `npm run lint` / `npm run typecheck` / `check:dead-code` / `check:dead-routes`                                        |       0 | 0 lỗi, 5 warning / sạch / 0 unreachable / 397/397 route có người gọi                  |
| A11Y    | `check:contrast` / `check:mau-accent` / `check:ui-ux-guard` / `check:hex-hardcode`                                    |       0 | xanh (261 file UI)                                                                    |
| DATA    | `check:migrations`; `db:migrate` 2 lần trên DB tạm; gen-erd ở scratch                                                 |       0 | 176 file; lần 2 "không có migration mới"; ERD trùng file hiện có                      |
| DOC/HAR | `xt.py progress-check`                                                                                                |       1 | 23633 byte > 8192; thứ tự mục lệch                                                    |
| HAR     | `xt.py doctor --json`                                                                                                 |       0 | 4 cảnh báo (gate-floor ×2, agent ghim model, progress)                                |
| TEST    | job CI `coverage` trên #711 (head 8501d698)                                                                           | success | ratchet `coverage-baseline.json` không tụt                                            |

## 4. Phát hiện chi tiết

### AUD-DOC-002 🟠 PROGRESS.md vượt trần, hook cắt mất phần bàn giao

- **Bằng chứng:** đo được — `python3 .xtemplates/scripts/xt.py progress-check` → exit 1, `23633 byte > 8192`; theo mục: Đang làm 18007, Nợ kỹ thuật 3046, Bàn giao 705 byte.
- **Tái hiện:** 1. chạy `.claude/hooks/session-start.sh` như lúc mở phiên → 2. khối PROGRESS dài 8250 byte, chỉ có `## Đang làm`, cắt giữa câu → phiên mới không thấy Tiếp theo / Quyết định / Bàn giao phiên. Hồi quy: T-001 (`docs/autopilot/PLAN.md:37`) đã đưa file về 2939 byte ngày 22/10; từ #687 phình lại vì CI không chạy `progress-check`.
- **Xác minh đối kháng:** reviewer-alt tái hiện được, giữ 🟠.
- **Đề xuất sửa:** chuyển các mục đã MERGED/DEPLOYED trong "Đang làm" sang `CHANGELOG.md`/`docs/ops/`, giữ mỗi mục đang làm ≤ vài dòng; quyết định giữ "Nợ kỹ thuật" (quy ước XBoss, `scripts/check-migration-numbers.ts:61` đọc nó) hay dời ra `docs/ops/technical-debt-*.md`. · **Gate:** `python3 .xtemplates/scripts/xt.py progress-check`

### Hạ mức sau xác minh (🟠 → 🟢)

- **AUD-DOC-001** blueprint 0/1152: số 0 trung thực và có chú thích (D-002 "chưa audit, NO-GO", PROGRESS bước tiếp theo); vấn đề thật là blueprint không ai bảo trì và lệch khung 3.30.1 (compose lại ra 1170 MUST, 18 ID mới, vd `LOOP-HARNESS-023`).
- **AUD-XFEAT-001** màu `tre`: ADR-0009 dòng 34–35 cho "amber/đỏ" cho trễ, đỏ đã là màu "trễ" ở StatCard/ProgressMap/payments; my-tasks luôn kèm nhãn chữ. Gốc: 3 bảng màu viết lại, `CLAUDE.md` ghi "cam" lệch ADR.
- **AUD-HAR-001** `xt.yaml` thiếu `format_check`/`coverage`: CI đã chạy cả hai (`ci.yml:78-79`, `:361-362`, rollup `ci` cần `coverage`); chỉ `xt.py loop verify` của khung đỏ → `/autopilot`/`/complete` không tới được `done`.

Các phát hiện 🟢 còn lại: xem bảng ở `AUDIT-STATUS.md` (file:dòng từng mục).

## 5. Kế hoạch sửa theo đợt (tự duyệt — ghi ở mục "Quyết định" của PROGRESS.md)

| Đợt | Phát hiện                              | PR dự kiến                                                                                         | Gate của đợt                                                                                                         |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | AUD-DOC-002, AUD-HAR-001, AUD-DOC-003  | `docs: rút gọn PROGRESS.md, khai format_check/coverage trong xt.yaml, sửa đường dẫn cũ`            | `python3 .xtemplates/scripts/xt.py progress-check` · `python3 .xtemplates/scripts/xt.py doctor` không còn gate-floor |
| 2   | AUD-A11Y-001, AUD-SEC-001, AUD-CFG-001 | `fix: spec axe /finance/cash, cookie OIDC theo isSecureCookie, khai biến env`                      | spec e2e mới xanh desktop+mobile; test route OIDC đỏ trước/xanh sau; `npm run gate`                                  |
| 3   | AUD-XFEAT-001                          | `refactor(ui): một nguồn màu trạng thái task` (+ chốt cam/đỏ với chủ repo, sửa CLAUDE.md hoặc ADR) | test khớp khoá map ↔ `StatusSlug`; spec axe các trang chạm                                                           |
| 4   | quét lại 8 nhóm `chưa quét`            | không PR mã — `/audit delta` từng nhóm, đọc từng route theo `docs/audit.md` §3/§8                  | `python3 .xtemplates/scripts/xt.py audit check docs/ops/AUDIT-STATUS.md --strict`                                    |

Mỗi đợt ≤ 1 PR; bug logic có test tái hiện đỏ trước khi sửa. Merge theo quyền của chủ repo (`merge_autonomy: L1`).

## 6. Nợ 🟢 giữ lại (chờ chủ repo chốt chủ/hạn trước khi `--strict`)

| ID                                                       | Chủ      | Hạn      | Lý do chưa sửa                                                                                           |
| -------------------------------------------------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| AUD-DATA-001, AUD-DATA-002                               | chưa gán | chưa đặt | thêm index = migration (mức M); cần đo bảng nào lớn trên production trước                                |
| AUD-DATA-003                                             | chưa gán | chưa đặt | cần xác minh `unit_price` có bị nhân trên float JS trước khi đổi kiểu (migration đụng dữ liệu → staging) |
| AUD-DEP-001                                              | chưa gán | chưa đặt | lỗ hổng moderate ở phụ thuộc gián tiếp; chờ bản vá upstream (exceljs/archiver, @sentry)                  |
| AUD-DOC-001                                              | chủ repo | chưa đặt | chọn: compose lại blueprint theo khung 3.30.1 rồi đối soát, hay ghi ADR không dùng blueprint             |
| AUD-HAR-002                                              | chủ repo | chưa đặt | ghim model là chủ ý ADR-0014 — ghi ngoại lệ                                                              |
| AUD-XFEAT-002, AUD-XFEAT-003, AUD-CODE-001, AUD-CODE-002 | chưa gán | chưa đặt | dọn nhỏ, gộp vào PR chạm file liên quan                                                                  |
