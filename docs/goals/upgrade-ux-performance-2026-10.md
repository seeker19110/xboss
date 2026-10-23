# Nâng cấp trải nghiệm, hiệu năng và tinh gọn XBoss

| Thuộc tính            | Giá trị                                                                    |
| --------------------- | -------------------------------------------------------------------------- |
| Goal ID               | UPGRADE-2026-10                                                            |
| Owner                 | Chủ dự án                                                                  |
| State                 | WAITING — CI/merge bản vá Zod, UAT và usage                                |
| Main SHA đã reconcile | `d413650c567fa9a515eae5081e612eea53ea8913`                                 |
| Bắt đầu               | 2026-10-23                                                                 |
| Đối soát              | 2026-10-24                                                                 |
| Spec                  | M136 — Approved for implementation, người dùng duyệt trong chat 23/10/2026 |

## Outcome và cổng hoàn thành

Hoàn thiện các luồng lưu khi mạng yếu, điều hướng mobile, dashboard và công cụ đo theo kế hoạch nâng cấp được duyệt. Bằng chứng kỹ thuật: test lỗi mạng/retry/keyboard/role, query count và hiệu năng trên cùng fixture, kiểm thử DB biệt lập, build và các cổng cần thiết. Phần sản phẩm: UAT 3–5 người, cửa sổ usage phù hợp trước bỏ capability và đo người dùng thật.

## Milestone

| ID  | Outcome                                      | State    | Evidence                                                    |
| --- | -------------------------------------------- | -------- | ----------------------------------------------------------- |
| A   | Lưu tin cậy, keyboard tracking               | VERIFIED | Browser lỗi/retry/keyboard/rollback, giữ kéo M135           |
| B   | Điều hướng mobile và nội dung đúng           | VERIFIED | Search/nav/role/flags, focus, axe và 360/393px              |
| C   | Poll có giới hạn, kiểm kê chỉ đọc đúng       | VERIFIED | Unit, browser visibility, 4 ca PostgreSQL thật              |
| D   | Dashboard tránh tính lặp, tải chính trước    | VERIFIED | Call-count, nguồn phụ độc lập, hash API khớp                |
| E   | Bằng chứng regression/performance và runbook | VERIFIED | Gate, build, test và benchmark trong verification           |
| F1  | Phát hành production và public smoke         | VERIFIED | PR #675, CI/deploy cùng SHA, release.md và release.json     |
| F2  | UAT 3–5 người, Safari/cảm ứng thật           | WAITING  | Chưa có người/thiết bị và kết quả nghiệm thu                |
| F3  | Usage và quyết định giữ/gộp/gỡ capability    | WAITING  | Chưa xác nhận nguồn/coverage/thời điểm thu và cửa sổ đủ dài |
| F4  | Vá Zod mới phát hiện trong CI và phát hành   | WAITING  | PR #676, chưa merge/deploy; chi tiết zod-repair.md          |

## Current truth

[PR #675](https://github.com/seeker19110/xboss/pull/675) đã merge thành main `d413650c`.
[CI main](https://github.com/seeker19110/xboss/actions/runs/39963366086) và
[deploy](https://github.com/seeker19110/xboss/actions/runs/39964822526) thành công trên cùng SHA.
Public smoke desktop/mobile ngày 23/10, kiểm lại 24/10 đều PASS; health/readiness tốt.
Bằng chứng và giới hạn: [release.md](../ops/evidence/m136/release.md),
[release.json](../ops/evidence/m136/release.json). Không thử ghi dữ liệu production.

Checkout gốc tại `/mnt/c/Users/liend/xboss` giữ nguyên 1.508 tệp xóa từ trước. Benchmark vẫn
so baseline `efd31ba0` với candidate M136 trên cùng fixture: dashboard p95 giảm khoảng 29%,
bản tuần khoảng 50%; ba response hash khớp. Mobile trang chủ khoảng 4,1 giây tới dữ liệu chính;
chưa chứng minh đạt Core Web Vitals ngoài thực địa.
[Bằng chứng lab](../ops/evidence/m136/verification.md).

## Iteration 1 — 2026-10-23

- A–E có bằng chứng kỹ thuật theo contract M136; chủ dự án duyệt commit/push/deploy.
- Local: 18/18 gate, build, full release gate 5.152 pass/0 fail/1 skip allowlist;
  25 unit + 4 DB mới, 45 E2E mới và các hồi quy liên quan đã qua.
- CI main là lượt khác: 5.160 pass/0 fail/1 skip allowlist; E2E 693 pass/51 skip điều kiện
  có sẵn, mutation 52/52 runnable/0 survivor. Không gộp hai bộ số local/CI.
- Production đã phát hành 20:57 UTC+7 ngày 23/10; F1 VERIFIED, F2–F3 còn chờ.

## Iteration 2 — 2026-10-24

- Đối soát main/GitHub/production, lưu evidence phát hành vào repo và sửa trạng thái rollout.
- Không tìm thấy lỗi app mới từ public smoke. CI sau đó phát hiện dependency Zod high:
  D-002 bổ sung riêng bản vá 4.6.5→4.6.6 trong #676, không mở capability hoặc nới gate.
  [Hồ sơ và giới hạn](../ops/evidence/m136/zod-repair.md); bản vá chưa merge/deploy.
- Plan: [M136-RELEASE-PLAN.md](../autopilot/M136-RELEASE-PLAN.md). [PR đối soát #676](https://github.com/seeker19110/xboss/pull/676) chờ merge theo L1; bản cập nhật hồ sơ này chưa nằm trên main trước khi PR được merge.
- F2: owner bố trí 3–5 người đại diện theo bảng tác vụ trong runbook, gồm thiết bị Safari/
  cảm ứng thật; ghi thời gian, trợ giúp, lỗi và kết luận. Không thay người thật bằng agent.
- F3: owner/operator xác nhận nguồn, scope và coverage đo trước pilot; ghi ngày bắt đầu thu
  thực, theo đủ chu kỳ nghiệp vụ rồi quyết định giữ/gộp/gỡ. Ngày deploy chưa phải ngày bắt đầu đo.
- Không xóa capability sống hoặc dữ liệu thật trước khi có usage/caller/hồ sơ và owner quyết định.

## Final audit

- [x] A–E có test và bằng chứng kỹ thuật.
- [x] Cổng repo và E2E liên quan đạt trên bản M136.
- [x] Regression quyền/scope/tiền/tiến độ/offline/kéo thả đã qua các cổng; giữ export/in.
- [x] Rollout F1 được kiểm chứng; kết quả và giới hạn được lưu trong repo.
- [ ] F2 có UAT người thật và thiết bị thực.
- [ ] F3 có cửa sổ usage phù hợp và quyết định owner về capability.
- [ ] F4 bản vá Zod qua CI, được merge/phát hành và kiểm chứng.

**Kết luận:** M136 CODE VERIFIED và DEPLOYED; toàn mục tiêu NOT COMPLETE vì F2–F4 còn mở.
