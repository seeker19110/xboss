# Goal: Đối soát và xử lý nợ kỹ thuật tháng 10

| Thuộc tính            | Giá trị                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| Goal ID               | DEBT-2026-10                                                                       |
| Owner                 | Chủ dự án                                                                          |
| State                 | WAITING — lát S local VERIFIED, chờ PR/merge; phần auth/proxy cần spec và topology |
| Main SHA đã reconcile | `0f5cef55e914711a0d004411d4123c5a966e3c25`                                         |
| Bắt đầu / review      | 2026-10-26 / 2026-10-26                                                            |
| Quyền AI              | Research, sửa nhánh, kiểm thử, PR; chưa có quyền merge/deploy/Settings/production  |
| Budget/guardrails     | Tối đa3 repair attempts/failure; không nới auth/validation/gates hoặc dùng DB thật |

## Outcome và Goal DoD

- Admin/PM và người bảo trì có backlog phản ánh đúng code, quyết định cũ và trạng thái phát hành.
- Baseline bảy nhận định TD-001–007 chưa kiểm chứng → mỗi mục có bằng chứng, mức ảnh hưởng,
  outcome đã kiểm hoặc owner/dependency cụ thể. Không biến rủi ro có điều kiện thành exploit.
- Bản vá đủ regression/gate trên đúng SHA; mục auth chỉ Ready sau spec có người/ngày duyệt.
- Guardrails: giữ token/RBAC/scope, tiền/tiến độ/nghiệm thu/audit, migration append-only và lock.
- Cửa sổ đo: kiểm nhánh ngày26/10; UAT/usage/production có cửa sổ và evidence riêng khi owner bố trí.
- Completion approver: chủ dự án; không dùng lịch sử COMPLETE tháng8 thay final audit mới.

## Scope / non-goals

### In scope

TD-001–007 trong PROGRESS, trạng thái #686, goal còn mở và hướng dẫn lệch code.
Phần phát sinh có feature/security contract mới phải qua Research → Spec → Approval.

### Không làm

Khôi phục module đã gỡ; dùng production DB/secret/provider trả phí trong test; tự sửa firewall,
GitHub Settings, merge/deploy; thay người thật để ký UAT hoặc tự tính usage chưa thu.

## Milestones và slices

| ID  | Outcome/AC                                                                                   | Dependency                | Spec                                                                 | Issue | PR      | State   | Evidence                                                                                                         |
| --- | -------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- | ----- | ------- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| S1  | Đối soát7TD/#686/goals; sửa XSS/rollback build, race nháp và tương phản; kiểm HTTP/deploy/UI | Không                     | Sửa cấu hình/tài liệu mức S                                          | —     | Chưa mở | VERIFY  | [Báo cáo](../ops/technical-debt-2026-10-26.md), [checks](../ops/evidence/technical-debt-2026-10/verification.md) |
| S2  | Gom IP/cookie sau contract edge được duyệt                                                   | D1/D2, operator           | [M138](../nang-cap/M138-cung-co-ranh-gioi-proxy-cookie.md) In review | —     | —       | SPEC    | Không code trước approval                                                                                        |
| S3  | Xác minh ranh giới mạng                                                                      | Operator/topology         | M138                                                                 | —     | —       | WAITING | Required checks đã xác minh qua ruleset; firewall chưa kiểm                                                      |
| S4  | Audit authz còn lại                                                                          | Inventory/AC từng lát     | QUALITY-FINAL-1 khi áp dụng                                          | —     | —       | BACKLOG | TD-007 PARTIAL; rollback build đã có bản vá/51 test, không kết luận authz từ scan tĩnh                           |
| S5  | Bảo trì page dài theo miền                                                                   | Scope/regression từng lát | Mức rủi ro theo file                                                 | —     | —       | BACKLOG | TD-006 là rủi ro bảo trì;0 suppression TypeScript                                                                |

## Risk register

| Risk                        | Trigger                                       | Mitigation/rollback                                                                | Owner        | State   |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ | ------- |
| Giả header IP               | App trực tiếp hoặc proxy nối header client    | Chốt topology, edge overwrite và chặn app; không coi parser là biện pháp transport | Operator     | OPEN    |
| Nghiệm thu sai              | Goal/history ghi COMPLETE thiếu evidence      | Đối soát manifest/current code, giữ lịch sử có nhãn                                | Chủ dự án/AI | TRIAGED |
| Refactor rộng đổi nghiệp vụ | Tách nhiều page tài chính/nghiệm thu một lượt | Slice theo miền, audit/regression trước tích hợp                                   | Implementer  | OPEN    |

## Current truth

- Goal gap: S1 có bản vá/bằng chứng nhánh; S2 chưa Ready; S3–S5 chưa hoàn tất.
- Production/migration truth: #686 đã phát hành theo Actions cùng SHA; chưa kiểm firewall/DB thật.
- Blocker: M138 D1 topology/D2 metadata contract; operator kiểm ranh giới mạng, UAT và telemetry thực tế.
- Next best slice: review/PR S1; owner chốt topology trước duyệt M138.
- Quyền cần thêm: merge/deploy và mọi thay đổi Settings/production phải có lệnh người dùng.

## Iteration log

### Iteration 1 — 2026-10-26

- State/main: VERIFY trên nhánh, main `0f5cef55`.
- Slice: S1; có68 targeted pass/0skip,51deploy pass, fullunit5.174pass/0fail/1skip; full E2E phát hiện/vá3nguyên nhân, fullE2E1.132pass/0fail/51skip cũ,retries0, gate/build19/19; kết quả trong verification.
- Gap trước/sau: phân biệt chủ đích/historical/risk; có regression XSS và spec để review.
- Risk/decision: giữ policy CSRF và cookie hiện hành; không tự duyệt M138 hoặc đóng UAT.
- Blocker/next/permission: như Current truth; không có claim toàn bộ nợ đã giải quyết.

## Final audit

- [ ] Goal AC có bằng chứng trên main.
- [ ] Metrics đạt; guardrails không suy giảm.
- [ ] S2–S5 có disposition/approval và bằng chứng đóng phù hợp.
- [ ] Release gate + DB/E2E/audit liên quan đạt trên SHA cuối.
- [ ] UAT/production/restore hoàn tất nếu thuộc slice được duyệt.
- [x] Residual risks, owner/dependency và phần chưa đo ghi rõ.
- [ ] Owner xác nhận hoàn tất.

**Kết luận:** NOT COMPLETE — checkpoint WAITING.

**Người/ngày xác nhận:** Chưa có.
