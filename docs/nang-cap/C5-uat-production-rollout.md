# C5 — UAT, Data Reconciliation & Production Rollout

> **Trạng thái:** Draft; chỉ bắt đầu khi C4 release gate đạt.

## 1. Mục tiêu

Xác nhận sản phẩm đúng nhu cầu thực tế theo vai trò/dự án, dữ liệu khớp nguồn và rollout production theo cohort có thể dừng/rollback.

## 2. UAT governance

- UAT owner, tester đại diện 7 vai trò, environment/data, lịch, channel lỗi và sign-off.
- Mỗi case có ID, prerequisite, steps, expected, evidence, severity và tester.
- Lỗi không sửa phải có risk acceptance bởi đúng owner; developer không tự hạ severity.
- UAT không dùng tài khoản chung hoặc dữ liệu production nhạy cảm ngoài môi trường được phép.

## 3. UAT theo vai trò

### Admin

- Project/org/user/role/permission/module/API key; import/export; audit; integration health; backup/restore visibility.

### PM

- Dashboard/S-curve/lookahead; tracking/baseline; QA/approval; BOQ/cost/contract/VO/IPC; report; ENG object/suggestion/workflow/conflict.

### Engineer

- Mobile tracking, assigned work, dimension/photo/document/diary, offline/reconnect, QA gates và engineering view nếu được cấp.

### Sub-con

- Chỉ assigned scope; không thấy/ghi project/task khác; offline workflow dễ dùng tại công trường.

### BCH/CDT/Viewer

- Read-only đúng ma trận; dữ liệu thương mại/claim bị ẩn đúng; export/action write bị chặn API.

## 4. End-to-end acceptance journeys

1. Excel AVIO → preview/confirm → WBS/tracking → delayed/dashboard → export Excel/PDF.
2. Tạo baseline → update progress → S-curve/lookahead → report daily/weekly.
3. Procurement/material → site usage → cost/contract/payment lineage.
4. QA inspection/hold point → nghiệm thu → handover/warranty.
5. MEPF source/object/relation → human review → suggestion → ENG-3 gate → conflict resolution; không execution.
6. Project switch/org isolation và audit “ai/khi nào/vì sao”.

## 5. Data reconciliation

### Excel/WBS

- Sheet/package/task/dimension counts, codes, floor, start/end date, progress, delayed, package average.
- Sample 100% cho exceptional/warning rows; sample thống kê cho phần còn lại.
- Export round-trip và formula/style acceptance của chủ báo cáo.

### Commercial

- BOQ qty/unit price/totals, VO/IPC/cost/cashflow/vat/payroll theo source docs và rounding rules.
- Sai lệch tiền không được “accepted by tolerance” nếu chưa có policy bằng văn bản.

### Engineering

- Source/revision hash, external keys, object/relation counts, quantity/evidence/calculation version, review/workflow/conflict lineage.

Mọi reconciliation tạo report machine-readable + sign-off; exception có owner/decision/date.

## 6. Production preflight

- Main/RC SHA frozen; CI/C4 evidence; migration/checksum; DB/storage backup; disk/pool capacity.
- Environment validation không in secret; cron/webhook/email/push/Sentry/storage endpoints.
- Feature flags/project cohort; API key staging không tồn tại production; production key chưa gửi qua chat/git.
- Rollback/forward-fix command, owner và decision deadline.

## 7. Rollout sequence

1. Deploy code backward-compatible trước migration lock nếu cần.
2. Maintenance/read-only window cho migration/backfill nhạy cảm.
3. Apply migration; integrity queries; app smoke theo role.
4. Bật core cho internal admins/PM; theo dõi error budget.
5. Bật ENG cho đúng pilot project/key; chạy canary fixture + một hồ sơ thật đã duyệt.
6. Mở engineer/sub-con cohort; theo dõi mobile/offline/realtime.
7. Mở rộng dự án/người dùng sau mỗi checkpoint; không big-bang.

## 8. Rollback/stop conditions

Stop rollout khi có P0/P1, cross-project, sai tiền/progress diện rộng, migration integrity fail, error/SLO vượt budget, audit mất hoặc restore không tin cậy.

- Feature disable/revoke key trước khi rollback code nếu giảm blast radius.
- Migration destructive không rollback bằng drop; dùng restore/forward-fix đã diễn tập.
- Giữ evidence và incident timeline; không tiếp tục rollout khi nguyên nhân chưa rõ.

## 9. Training và adoption

- User guide theo vai trò; video/quick reference mobile; admin/ops integration runbook.
- Training có bài thực hành và checklist đạt; office hours/support channel.
- Metrics: active users, task updates, offline sync success, review backlog, time-to-approve, export/report usage, support cases.
- Feedback được phân loại defect/change/training; change không chen vào RC nếu không P0/P1.

## 10. Hypercare

- Thời gian tối thiểu do owner chốt; đề xuất 1–2 chu kỳ báo cáo tuần.
- Daily review error/SLO/data reconciliation/support; owner và response target.
- Freeze thay đổi không cấp thiết; hotfix qua PR/CI/smoke và change record.

## 11. Definition of Done

- [ ] UAT tất cả role/journey ký nhận; P0/P1=0.
- [ ] Reconciliation Excel/commercial/engineering đạt và exceptions được phê duyệt.
- [ ] Production rollout/canary/hypercare đạt error budget.
- [ ] Training/support/owner/runbooks sẵn sàng.
- [ ] Rollback/stop drill và post-deploy smoke có evidence.
- [ ] Go-live sign-off cho phép chuyển C6.
