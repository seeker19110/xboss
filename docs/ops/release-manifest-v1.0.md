# XBoss Release Manifest — v1.0.0 (Draft - Chưa đạt gate)

> **Phiên bản:** `1.0.0`  
> **Trạng thái:** Draft/Dự thảo chưa đạt gate  
> **Căn cứ:** `docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md` (Hoàn thành chuỗi C0→C6)

---

## 1. Tóm tắt Phát hành (Release Summary)

XBoss v1.0.0 đánh dấu cột mốc hoàn thiện toàn diện sản phẩm Quản lý Dự án Thi công Cơ điện (MEP) và Xây dựng đa dự án, thay thế hoàn toàn hệ thống Excel thủ công:

- **Kiến trúc:** Next.js App Router (React 19) + TypeScript Strict + PostgreSQL Raw SQL (không ORM).
- **Bảo mật & Phân quyền:** Xác thực JWT có chữ ký HMAC + cơ chế vô hiệu hóa phiên tức thì; RBAC 7 vai trò có kiểm soát override; Row-Level Security (RLS) cách ly đa dự án; Redaction lọc secret 2 lớp qua log.
- **Toàn vẹn Dữ liệu & Audit:** Chuỗi hash-chain `audit_log` chống chỉnh sửa trực tiếp trên DB; 132 migration append-only đã qua kiểm tra số thứ tự và kiểm thử tự động.
- **Hệ thống Kỹ thuật & Tích hợp Agent:** Chuẩn hóa trục Engineering OS (ENG-1 đến ENG-5) với hợp đồng ingest lũy đẳng, OpenAPI 3.1, bộ fixtures và cơ chế điều phối xung đột đa agent theo trật tự thẩm quyền.

---

## 2. Chỉ số Chất lượng & Cổng Kiểm tra (Quality Metrics & Gates)

| Tiêu chí                 | Mục tiêu            | Kết quả thực tế                | Trạng thái |
| ------------------------ | ------------------- | ------------------------------ | ---------- |
| TypeScript Typecheck     | 0 errors            | 0 errors                       | ✅ ĐẠT     |
| ESLint Rules             | 0 errors            | 0 errors                       | ✅ ĐẠT     |
| Migrations Integrity     | 132 files liên tục  | 132 files liên tục             | ✅ ĐẠT     |
| Service Worker Exclude   | Đồng bộ 100%        | 8/8 routes khớp                | ✅ ĐẠT     |
| Unit & Integration Tests | 100% file pass      | 134/134 files pass             | ✅ ĐẠT     |
| Mutation Testing         | Bắt đủ 9/9 bất biến | 9/9 bất biến có test canh      | ✅ ĐẠT     |
| Next.js Build            | 0 warning/error     | Static & Dynamic routes tối ưu | ✅ ĐẠT     |

---

## 3. Điều kiện chưa đạt (Gate Conditions Not Met)

Mặc dù code đã hoàn thành các tiêu chí tĩnh (lint, typecheck, test, mutation), nhưng v1.0.0 chưa sẵn sàng đưa vào sản xuất thực do:

- **Không có traffic thật từ MEPF-Agents**: tính năng ingest dữ liệu từ agent BIM/CAD chưa được thử nghiệm với dữ liệu thực tế quy mô lớn.
- **Staging migration chưa hoàn tất**: `0089` (backfill SCurve) và `0091` (baseline norms) chưa chạy qua staging sản phẩm.
- **Các tầng quản lý rủi ro (C0→C6) chưa thi hành**: chỉ mới code khung, chưa có quy trình vận hành thực tế.
- **UAT người thật chưa diễn ra**: chưa có kiểm chứng chức năng từ đội kỹ sư/PM thật trên dữ liệu dự án cụ thể.

**Khuyến cáo:** deploy v1.0.0 vào **staging/pilot** trước, chạy smoke test, kiểm tra hiệu năng, mới nâng lên production.

---

## 4. Danh mục Hồ sơ & Tài liệu Vận hành (Documentation Inventory)

1. **Lộ trình & Mục tiêu:** [`docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md`](file:///c:/Users/liend/xboss/docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md), [`docs/goals/goal-2026-c-v1-release.md`](file:///c:/Users/liend/xboss/docs/goals/goal-2026-c-v1-release.md).
2. **Quy tắc Tác nhân & Đóng góp:** [`AGENTS.md`](file:///c:/Users/liend/xboss/AGENTS.md), [`docs/AI_DELIVERY_LOOP.md`](file:///c:/Users/liend/xboss/docs/AI_DELIVERY_LOOP.md), [`CONTRIBUTING.md`](file:///c:/Users/liend/xboss/CONTRIBUTING.md).
3. **Mô hình Dữ liệu & Kiến trúc:** [`docs/ERD.md`](file:///c:/Users/liend/xboss/docs/ERD.md), [`docs/adr/`](file:///c:/Users/liend/xboss/docs/adr/).
4. **Hợp đồng API & Tích hợp:** [`docs/api-v1.md`](file:///c:/Users/liend/xboss/docs/api-v1.md), [`docs/api/engineering-ingest.openapi.json`](file:///c:/Users/liend/xboss/docs/api/engineering-ingest.openapi.json), [`docs/api/mepf-connector-pilot-guide.md`](file:///c:/Users/liend/xboss/docs/api/mepf-connector-pilot-guide.md).
5. **Vận hành, DR & Rollout:** [`docs/ops/uat-checklist-and-rollout-plan.md`](file:///c:/Users/liend/xboss/docs/ops/uat-checklist-and-rollout-plan.md), [`DEPLOY.md`](file:///c:/Users/liend/xboss/DEPLOY.md), [`SECURITY.md`](file:///c:/Users/liend/xboss/SECURITY.md).
