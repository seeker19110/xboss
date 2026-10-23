# Nâng cấp trải nghiệm, hiệu năng và tinh gọn XBoss

| Thuộc tính            | Giá trị                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Goal ID               | UPGRADE-2026-10                                                            |
| Owner                 | Chủ dự án                                                                  |
| State                 | ACTIVE                                                                     |
| Main SHA đã reconcile | `efd31ba0`                                                                 |
| Bắt đầu               | 2026-10-23                                                                 |
| Spec                  | M136 — Approved for implementation, người dùng duyệt trong chat 23/10/2026 |

## Outcome và cổng hoàn thành

Hoàn thiện các luồng lưu khi mạng yếu, điều hướng mobile, dashboard và công cụ đo theo kế hoạch nâng cấp được duyệt. Bằng chứng kỹ thuật: test lỗi mạng/retry/keyboard/role, query count và hiệu năng trên cùng fixture, kiểm thử DB biệt lập, build và các cổng cần thiết. Phần sản phẩm: UAT 3–5 người, cửa sổ usage phù hợp trước bỏ capability, rollout và đo người dùng thật.

## Milestone

| ID  | Outcome                                       | State    | Evidence                                            |
| --- | --------------------------------------------- | -------- | --------------------------------------------------- |
| A   | Lưu tin cậy, keyboard tracking                | VERIFIED | Browser lỗi/retry/keyboard/rollback, giữ kéo M135   |
| B   | Điều hướng mobile và nội dung đúng            | VERIFIED | Search/nav/role/flags, focus, axe và 360/393px      |
| C   | Poll có giới hạn, kiểm kê chỉ đọc đúng        | VERIFIED | Unit, browser visibility, 4 ca PostgreSQL thật      |
| D   | Dashboard tránh tính lặp, tải chính trước     | VERIFIED | Call-count, nguồn phụ độc lập, hash API khớp        |
| E   | Bằng chứng regression/performance và runbook  | VERIFIED | 18/18 gate, build, 5.152 pass, browser và benchmark |
| F   | UAT, usage, quyết định bỏ capability, rollout | BACKLOG  | Phụ thuộc người dùng và thời gian đo                |

## Current truth

Checkout gốc tại `/mnt/c/Users/liend/xboss` vẫn giữ 1.508 tệp xóa trước khi làm. Thực thi ở
worktree tách biệt từ origin/main đã fetch. Các cải tiến private cache/vault và loại DDL
khỏi runtime đã có, không xây lại. Đã chạy production build, browser và benchmark cùng
fixture: API dashboard p95 giảm khoảng 29%, bản tuần khoảng 50%; ba response hash khớp.
Trang chủ mobile vẫn khoảng 4,1 giây tới dữ liệu chính, chưa chứng minh đạt Core Web Vitals.
Bằng chứng: `docs/ops/evidence/m136/verification.md`.

## Iteration 1 — 2026-10-23

- State: CODE VERIFIED; UAT/usage/rollout còn BACKLOG; scope/code contract ở M136.
- Người dùng đã duyệt toàn kế hoạch; quyết định triển khai thường lệ nằm trong phạm vi đó.
- Tránh xóa capability có điều kiện, schema hoặc dữ liệu thật trước khi có bằng chứng.
- Chủ dự án duyệt commit, push và deploy trong chat sau khi xem báo cáo kiểm chứng.
  Đang phát hành qua PR → CI → merge → workflow deploy; chưa xác nhận production.
- 18/18 cổng static, production build, 25 unit + 4 DB mới, 45 E2E mới xanh. Hồi quy AppShell,
  dashboard, vai trò, tracking/offline: 62 pass + 1 skip có sẵn cho nút desktop ở mobile;
  input mobile 29 pass và kéo M135 desktop 2 pass, gồm setup. Không thêm skip mới.
- Tài liệu kiểm kê/usage/UAT/rollout ở `docs/ops/upgrade-ux-performance.md`.
- Full release gate: exit 0, 383 file, 5.152 pass, 0 fail; 1 skip health theo allowlist.

## Final audit

- [x] A–E có test và bằng chứng kỹ thuật.
- [x] Cổng repo và E2E liên quan đạt.
- [x] Regression quyền/scope/tiền/tiến độ/offline/kéo thả qua các cổng đã chạy; giữ logic export/in.
- [ ] F có UAT và cửa sổ đo phù hợp.
- [ ] Rollout được kiểm chứng; rủi ro và kết quả cập nhật.

**Kết luận:** CODE VERIFIED; toàn mục tiêu NOT COMPLETE vì F chưa diễn ra.
