# C0 — Release Baseline & Governance

> **Trạng thái:** Draft đặc tả thi hành. Không thay đổi runtime.
> **Mục tiêu:** tạo một nguồn sự thật và baseline có thể kiểm chứng trước mọi thay đổi C1→C6.

## 1. Phạm vi

- Đồng bộ `PROJECT.md`, `spec.md`, `README.md`, `SECURITY.md`, `DEPLOY.md`, ERD, API docs và `PROGRESS.md` với code/migration thật.
- Chốt định nghĩa Product Complete, severity P0–P3, go/no-go, owner và đường escalation.
- Sinh release manifest cho mỗi RC: commit SHA, Node/npm, lockfile hash, migration list/checksum, image/artifact ID, schema fingerprint và environment.
- Chụp baseline CI, coverage, E2E, Lighthouse, dependency/security và backup/restore.

## 2. Không làm

- Không sửa business logic, migration, permission hoặc dữ liệu production trong PR C0.
- Không đánh dấu nợ “đã xong” chỉ dựa trên tài liệu; phải có bằng chứng command/CI/DB.

## 3. Nguồn sự thật

| Nội dung         | Nguồn chuẩn                                 |
| ---------------- | ------------------------------------------- |
| Mục tiêu/phạm vi | `PROJECT.md`                                |
| Hành vi tổng hợp | `spec.md`                                   |
| Schema           | migrations + `docs/ERD.md` sinh từ schema   |
| API public       | `docs/api-v1.md` + OpenAPI                  |
| Trạng thái       | `PROGRESS.md` snapshot đầu file             |
| Kế hoạch         | `PLAN.md` + `PROJECT-COMPLETION-ROADMAP.md` |
| Deploy/DR        | `DEPLOY.md`, `docs/ops/*`                   |
| Security         | `SECURITY.md`, ADR RLS/auth                 |

## 4. Release manifest

Tạo template `docs/releases/RELEASE-MANIFEST.template.md` gồm:

- version/RC, commit, branch/PR, ngày build, người lập/người duyệt;
- checks: lint/typecheck/unit/integration/E2E/build/Lighthouse/audit/gitleaks;
- migrations mới + checksum + staging applied time;
- backup ID, restore drill ID, rollback/forward-fix;
- known limitations, feature flags, enabled projects;
- artifact/image/deployment URL và post-deploy smoke evidence.

Manifest không chứa secret, DSN, token hoặc dữ liệu khách hàng.

## 5. Severity và gate

- **P0:** mất/rò dữ liệu, bypass auth/RLS, sai tiền/safety diện rộng, production unavailable. Chặn release.
- **P1:** luồng chính không dùng được, sai project scope, migration không rollback/restore được. Chặn release.
- **P2:** lỗi có workaround, UX/a11y/performance cục bộ. Phải có owner/date/mitigation.
- **P3:** polish/nợ thấp. Được đưa backlog có thứ tự.

Go chỉ khi P0=P1=0, P2 có owner, CI chính xanh, backup/restore evidence còn hiệu lực và owner nghiệp vụ ký.

## 6. RACI tối thiểu

| Vai trò           | Trách nhiệm                                             |
| ----------------- | ------------------------------------------------------- |
| Product owner     | Phạm vi, ưu tiên, acceptance, go/no-go                  |
| PM/QA owner       | UAT nghiệp vụ, dữ liệu và workflow                      |
| Engineering owner | Code/API/schema/test                                    |
| DB/Ops owner      | Migration, backup, restore, deploy, monitoring          |
| Security owner    | Threat model, secret/key, auth/RLS, incident            |
| MEPF owner        | Connector, contract fixtures, retry/incident phía agent |

Tên/người liên lạc thật phải được điền trước C2 pilot; không để “AI/agent” làm owner.

## 7. Công việc và chia PR

### PR C0.1 — Doc truth audit

- Script/command kiểm doc drift có thể tự động hóa: migration count, API routes, module registry, versions.
- Sửa các mâu thuẫn đã biết về RLS và phiên bản.
- Xuất danh sách open debt từ `PROGRESS.md`, bỏ mục đã đóng có bằng chứng.

### PR C0.2 — Release governance

- Template manifest/go-no-go/risk/UAT sign-off.
- Link vào PR template/DEPLOY; không biến mọi PR nhỏ thành release process nặng.

## 8. Test và kiểm chứng

- `git diff --check`, Prettier/docs link check.
- Script manifest fail khi thiếu commit/check/migration/backup fields bắt buộc.
- Review chéo tối thiểu Product + Engineering/Ops cho baseline.

## 9. Definition of Done

- [ ] Không còn mâu thuẫn đã biết giữa PROJECT/spec/SECURITY với RLS/auth/code thật.
- [ ] Release manifest, go/no-go, risk register và RACI có template + owner.
- [ ] Baseline RC có link bằng chứng CI/schema/backup/restore.
- [ ] P0/P1 được phân loại và có gate tự động/thủ công rõ.
- [ ] `PROGRESS.md` và `PLAN.md` trỏ về baseline mới.
