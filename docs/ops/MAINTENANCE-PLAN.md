# MAINTENANCE-PLAN — 2026-09-21 (ĐÓNG)

Nguồn: `docs/ops/MAINTENANCE-REPORT.md` (sinh lúc 2026-09-21T09:47:28Z, nhánh `main`, sạch,
đã pull mới nhất — commit `7f5b49df`).

## Ghi chú môi trường (không phải lỗi code, không cần task sửa)

- Mục 5 báo cáo `🔴 lint đỏ` / `🔴 typecheck đỏ` ban đầu là do **`node_modules/` chưa cài** trong
  môi trường chạy sweep — không phải lỗi code (CI tự `npm ci` nên không ảnh hưởng).
- Cùng lý do, danh sách package "lỗi thời" ban đầu đa số chỉ là `MISSING` (chưa cài) chứ không
  phải nợ version thật. Sau khi `npm ci`, số liệu thật: 34 package có bản mới hơn (đa số minor/
  patch), chỉ 2 package lệch major — xem M-04.

## ✅ Đã xong

- [x] **M-01**: Chạy `npm test -- --release-gate` với `TEST_DATABASE_URL` trỏ Postgres 16 thật
      (khởi động Postgres cục bộ, tạo DB `xboss_test`) → **251 file, 4098 ca pass, 0 fail, 1 ca
      skip** (`tests/health.test.ts`, đảo điều kiện cố ý `skip: HAS_TEST_DB` — đúng khuôn đã khai
      trong `scripts/test-skip-allowlist.json`, không phát sinh SKIP lạ). Allowlist vẫn đúng lý do.
- [x] **M-02**: Sửa `scripts/maintenance-sweep.sh` — nguyên nhân là `npm outdated` cố ý thoát mã 1
      khi có package lỗi thời, kết hợp `set -o pipefail` khiến `|| echo 0` chạy thêm ngoài ý muốn,
      in dòng "0" thừa. Tách bước gọi `npm outdated` ra khỏi pipe (`|| true` riêng) trước khi đưa
      vào `node -e`. Xác nhận lại: `bash scripts/maintenance-sweep.sh` (sau `npm ci`) in đúng một
      dòng `- Số package lỗi thời (\`npm outdated\`): 34.`.

## 🟡 Hoãn — chưa chốt hướng (không code)

- [ ] **M-03**: Cụm 13 route "Lớp Engineering OS" trong `scripts/dead-routes-allowlist.json`
      (`digital-handover`, `project-health`, `multi-agent-copilot`, `compliance/audit-element`,
      `closed-loop-sync`, `mepf-predictive`, `pipe-spool-tracking`, `carbon-lca`, `taxonomy`,
      `zero-error/pour-permits`, `workflows/[id]/transition`, `swarm/debates/[id]/arguments`,
      `swarm/debates/[id]/synthesize`) vẫn ghi "chờ chốt hướng ở đề xuất #6 của audit 2026-08-25".
      **Người dùng đã quyết (2026-09-21): vẫn chưa chốt, giữ nguyên allowlist** — không giao code
      đợt này. Rà lại ở đợt `/maintain` sau nếu vẫn còn treo.

## ⛔ Đã hỏi, người dùng từ chối lúc này

- [x] **M-04**: Nâng major `nodemailer` 9→10 và `google-auth-library` 10→11 — không phải lỗ hổng
      bảo mật khẩn (`npm audit --omit=dev` sạch). **Người dùng đã quyết (2026-09-21): không nâng
      lúc này.** Rà lại ở đợt `/maintain` sau.

## Kết luận

Không có 🔴 nào còn mở. Đóng kế hoạch này; M-03/M-04 để lại cho đợt bảo trì tiếp theo nếu người
dùng đổi ý.
