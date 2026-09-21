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

## ✅ M-03 — chốt hướng (2026-09-21, cập nhật)

Rà lại kỹ hơn cụm 13 route: 3 route (`zero-error/pour-permits`, `pipe-spool-tracking`,
`closed-loop-sync`) có giá trị nghiệp vụ cao nhất, giữ lại chờ gắn UI sau. Trong 10 route còn lại,
phát hiện **3 route thực ra là mắt xích còn thiếu của tính năng đang sống** (không phải dead code
thuần túy) nên KHÔNG xoá:

- `workflows/[id]/transition` — sau khi workflow được duyệt qua `submit`/`gates`, đây là cách duy
  nhất đưa nó qua `executing → validating_result → completed` (trang `/engineering/workflows` có
  thật nhưng chưa gọi route này).
- `swarm/debates/[id]/arguments` + `swarm/debates/[id]/synthesize` — trang `/engineering/swarm` có
  thật, tạo debate được nhưng không tự sinh lập luận; đây là cách duy nhất thêm lập luận/tổng hợp.

**7 route còn lại xác nhận thật là dead code** (backend xong, không route/UI/lib nào khác gọi tới)
→ đã xoá cùng lib module riêng + test liên quan: `digital-handover`, `project-health`,
`multi-agent-copilot`, `mepf-predictive`, `carbon-lca` (module độc lập, xoá cả file
`lib/ky-thuat/engineering-*.ts` + test riêng); `compliance/audit-element` (hàm
`auditEngineeringElement` trong `engineering-prescriptive.ts`, module dùng chung giữ lại vì
`scanAllElementsCompliance` vẫn cần); `taxonomy` (hàm `getTaxonomy` trong `engineering-graph.ts`,
module dùng chung giữ lại vì `traverseGraph`/`getImpactAnalysis`... vẫn cần). Cập nhật
`lib/ky-thuat/engineering-suite.ts` (barrel export), `scripts/dead-routes-allowlist.json` (xoá 7
mục), và toàn bộ test file liên quan (route-eng-du-bao/mepf/zero-error, engineering-graph,
engineering-prescriptive, engineering-suite, audit-2026-09-05-guards).

3 route giữ lại (`workflows/transition`, `swarm/arguments`, `swarm/synthesize`) vẫn nằm trong
`dead-routes-allowlist.json` với lý do cũ — cân nhắc gắn nút UI gọi chúng ở đợt sau thay vì tiếp
tục để "chờ chốt hướng".

## ⛔ Đã hỏi, người dùng từ chối lúc này

- [x] **M-04**: Nâng major `nodemailer` 9→10 và `google-auth-library` 10→11 — không phải lỗ hổng
      bảo mật khẩn (`npm audit --omit=dev` sạch). **Người dùng đã quyết (2026-09-21): không nâng
      lúc này.** Rà lại ở đợt `/maintain` sau.

## Kết luận

Không có 🔴 nào còn mở. Đóng kế hoạch này; M-04 để lại cho đợt bảo trì tiếp theo nếu người dùng
đổi ý; M-03 đã chốt hướng và xử lý xong (xoá 7 route dead code, giữ 3 route chờ gắn UI).
