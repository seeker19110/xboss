# Goal: Hoàn thiện Engineering OS (Vision Complete)

| Thuộc tính            | Giá trị                                                          |
| --------------------- | ---------------------------------------------------------------- |
| Goal ID               | GOAL-2026-ENGINEERING-OS-VISION-COMPLETE                         |
| Owner                 | Seeker / Engineering Lead                                        |
| State                 | COMPLETE                                                         |
| Main SHA đã reconcile | 4cbcdbafeb765f048d0865a73d3b7cfebc359cf9                         |
| Bắt đầu / review      | 2026-08-19 / 2026-08-19                                          |
| Quyền AI              | research / branch / PR / ready / merge / deploy                  |
| Budget/guardrails     | Max 3 repair attempts/failure; No bypass RLS; No unredacted logs |

## Outcome và Goal DoD

- **Mục tiêu:** Mở rộng năng lực XBoss v1.0 từ Hệ thống quản lý công trường (Core ERP/Construction OS) sang Hệ điều hành Kỹ thuật thông minh (Engineering OS) hoàn chỉnh qua 5 phân hệ OS-1 → OS-5.
- **Baseline → target:** Product Complete (C0–C6) → Vision Complete (OS-1 → OS-5).
- **Cửa sổ đo:** 97/97 migrations hợp lệ, 138/138 files test passing, 0 typecheck/lint errors, production build thành công.
- **Guardrails:** PostgreSQL raw SQL, parameterized queries, RLS strict theo project, A3+ autonomy cấm tuyệt đối (chỉ A0–A2 có kiểm soát), Kill Switch khẩn cấp.
- **Completion approver:** Seeker

## Scope / non-goals

### In scope

- **OS-1 (O1):** Engineering Knowledge Graph & System of Record (Migration 0094, Graph Traversal BFS, Object Lineage, Data Quality Scanner & Resolver, UI `/engineering/graph`, `/engineering/data-quality`).
- **OS-2 (O2):** Digital Twin theo cấp độ L0–L3 (Migration 0095, L1 Spatial/BIM Bindings, L3 Field State Snapshots & Freshness engine, Twin Timeline, Twin Impact, UI `/engineering/twin`).
- **OS-3 (O3):** Predictive OS, Uncertainty-First (Migration 0096, Model catalog, Schedule/Cost/Clash prediction pipeline, Uncertainty Bins, Explainability, ENG-2 Suggestion gate, UI `/engineering/predictions`).
- **OS-4 (O4):** Controlled Autonomy & Safe Execution (Migration 0097, A0–A2 Capabilities, Project policies, Dry-run diff, Single-use approval tokens, Kill Switch, UI `/engineering/autonomy`).
- **OS-5 (O5):** Engineering OS Program Closeout (Release Manifest v1.0.0, Governance & Runbook, RACI, P0 Runbook).

### Không làm (Non-goals)

- Không cho phép tự động hóa mức A3+ (tự ý thực thi không thể đảo ngược hoặc can thiệp ngân sách) khi chưa có phê duyệt riêng.
- Không đưa dữ liệu chưa qua xác minh lên môi trường production thật khi chưa qua staging.

## Milestones và slices

| ID   | Outcome/AC                                              | Dependency | Spec                                   | Issue | PR  | State | Evidence                                            |
| ---- | ------------------------------------------------------- | ---------- | -------------------------------------- | ----- | --- | ----- | --------------------------------------------------- |
| OS-1 | Knowledge Graph, Traversal BFS, Lineage & Quality       | C6         | `OS-1-engineering-system-of-record.md` | -     | -   | DONE  | Commit b543853, Migration 0094, 6 APIs, UI Graph    |
| OS-2 | Digital Twin L0–L3, Bindings, States & Freshness        | OS-1       | `OS-2-digital-twin.md`                 | -     | -   | DONE  | Commit bcf3574, Migration 0095, 5 APIs, UI Twin     |
| OS-3 | Predictive OS, Uncertainty Bins, Suggestions Link       | OS-2       | `OS-3-predictive-os.md`                | -     | -   | DONE  | Commit 4cbcdba, Migration 0096, 4 APIs, UI Predict  |
| OS-4 | Controlled Autonomy A0–A2, Dry-run, Token & Kill Switch | OS-3       | `OS-4-controlled-autonomy.md`          | -     | -   | DONE  | Commit 4cbcdba, Migration 0097, 6 APIs, UI Autonomy |
| OS-5 | Program Closeout, Manifest & Governance Runbook         | OS-4       | `OS-5-engineering-os-closeout.md`      | -     | -   | DONE  | `docs/ops/engineering-os-manifest-v1.0.md`          |

## Final Audit Checklist

- [x] 1. Toàn bộ 97 migrations đều có số thứ tự duy nhất, chạy mới và chạy lặp an toàn.
- [x] 2. TypeScript strict typecheck đạt 0 lỗi trên toàn bộ dự án (`npm run typecheck`).
- [x] 3. ESLint đạt 0 lỗi, 0 cảnh báo (`npm run lint`).
- [x] 4. Service Worker exclude list được đồng bộ đầy đủ (`npm run check:sw-exclude`).
- [x] 5. Bộ kiểm thử tự động 138 file test chạy thành công 100% (`npm test`).
- [x] 6. Next.js production build biên dịch tối ưu toàn bộ trang và route (`npm run build`).
- [x] 7. Tài liệu Release Manifest và Sổ tay Quản trị & Vận hành đầy đủ và cập nhật.
- [x] 8. Đã push toàn bộ mã nguồn lên nhánh `main` trên GitHub repository.
