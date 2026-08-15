# C6 — XBoss v1.0 Release & Product Closeout

> **Trạng thái:** Draft; phase kết thúc Product Complete, không kết thúc vòng đời sản phẩm.

## 1. Điều kiện vào

- C0→C5 đạt gate; production hypercare ổn định; UAT/reconciliation/go-live đã ký.
- P0/P1=0; P2 có owner/date; C4 security/DR evidence còn hiệu lực.

## 2. Release artifacts

- Tag/release `v1.0.0`, changelog/release notes, commit/artifact/image digest.
- Release manifest cuối: CI, migrations/checksums, environments, backup/restore, SLO, known limitations.
- ERD, OpenAPI/API docs, architecture/ADR, threat model, SBOM/license/dependency snapshot.
- User/admin/ops/security/integration guides; MEPF contract version và fixtures.
- UAT, reconciliation, pilot, DR, security và go-live sign-off evidence.

Không tạo tag trước sign-off. Tag/release immutable; sửa sau release bằng patch version mới.

## 3. Documentation information architecture

- `PROJECT.md`: product scope/complete status.
- `spec.md`: behavior/modules/version.
- `PROGRESS.md`: snapshot v1.0 + archived history.
- `PLAN.md`: operations/next release; kế hoạch cũ chuyển `docs/archive/plans/` nếu cần.
- `DEPLOY.md`/`SECURITY.md`/`docs/ops`: operational truth.
- `docs/nang-cap`: specs trạng thái implemented/deferred/superseded; link PR/release.

Không xoá lịch sử cần audit; archive có index và lý do.

## 4. Ownership handover

| Domain                     | Owner phải có          |
| -------------------------- | ---------------------- |
| Product/backlog/UAT        | Product owner + PM/QA  |
| Application/API            | Engineering owner      |
| DB/migration/backup        | DB/Ops owner           |
| Deploy/monitoring/incident | Ops/on-call            |
| Auth/RLS/security/keys     | Security owner         |
| MEPF contract/connector    | Owner mỗi repo         |
| User support/training      | Support/business owner |

Handover gồm access theo least privilege, runbook walkthrough, restore/incident drill và acknowledgment. Không bàn giao secret qua tài liệu/chat.

## 5. Operational cadence

- Daily/weekly monitoring theo SLO trong giai đoạn đầu; monthly backup restore sample.
- Quarterly access/API key/permission/dependency/security review.
- Release train/maintenance window; patch policy và emergency hotfix procedure.
- Data retention/purge, audit review và MEPF contract compatibility review.

## 6. Known limitations và deferred decisions

- Ghi rõ feature flag tắt, external domain chưa xác nhận, unsupported workflows, data-quality caveats và manual steps.
- O1–O5 là roadmap có điều kiện, không được mô tả như tính năng v1.0 đã có.
- A3+ không nằm trong v1.0 và cần phê duyệt riêng.

## 7. Success metrics sau go-live

- Availability/error/SLO, restore success, security incidents.
- Adoption theo role/project; mobile/offline success.
- Data accuracy/import/export reconciliation.
- Schedule/approval/report cycle time; review backlog.
- MEPF ingest success/replay/failure, object acceptance và conflict resolution time.

Baseline trước v1.0 và target do owner ký; không tự tuyên bố ROI từ số liệu thiếu nguồn.

## 8. Closeout review

- What shipped/not shipped/why; incidents/lessons; architecture debt; budget/timeline variance.
- Xác nhận system operable không phụ thuộc developer/AI session cụ thể.
- Decision: enter operations only, start O1 discovery hoặc pause. Pause là kết quả hợp lệ.

## 9. Chia PR/change records

- **C6.1:** doc/status/archive/release manifest, chưa tag.
- **C6.2:** sign-off evidence + tag/release creation.
- **C6.3:** post-release corrections nếu có qua patch `v1.0.x`, không rewrite tag.

## 10. Definition of Done — Product Complete

- [ ] Release/tag/artifact/manifest nhất quán và tái dựng được.
- [ ] Documentation/runbooks/owners/access handover hoàn tất.
- [ ] Monitoring/support/maintenance cadence hoạt động.
- [ ] Known limitations/deferred roadmap minh bạch.
- [ ] P0/P1=0; production ổn định theo window đã ký.
- [ ] Product/UAT/Ops/Security ký Product Complete.
