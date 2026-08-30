# Bộ đặc tả nâng cấp XBoss — theo nhóm module (đã triển khai xong M0–M52)

> **Trạng thái (cập nhật 2026-07-18): ĐÃ TRIỂN KHAI XONG M0–M52 (đợt "lên tầm ERP" P0–P2) + M56 (TOTP self-service PR1 + bắt buộc 2FA theo vai trò PR2).** File `M<xx>-*.md` gốc của M0–M42 (viết TRƯỚC khi code, dùng để giao việc subagent) đã được **gộp theo nhóm nghiệp vụ** thành các file `G<nn>-*.md` dưới đây — cô đọng còn lại phần tra cứu (schema/API/quyết định), bỏ phần "Chia PR"/kế hoạch giao việc không còn cần thiết sau khi đã code xong. Đặc tả M43–M52 giữ nguyên file `M<xx>-*.md` (chưa gộp). Lịch sử PR/quyết định chi tiết từng đợt vẫn nằm ở `PROGRESS.md`.
>
> **Cập nhật 2026-08-30 (rà lại code thật):** toàn bộ hàng đợi của bảng "Đặc tả chờ triển khai" bên dưới nay **đã xong** — M53 (4 PR), M54 GĐ1 (4 PR, `migrations/0078_org_axis.sql` + `0080_org_rls.sql` + `lib/nen/storage.ts` + `orgId` trong token phiên), M55, M56 (2 PR), M57 (PR1+PR2), M58 (3 PR), M59, M61, M62, M63, M64, M51 GĐ0. **Không còn mục nào ở trạng thái "chưa triển khai"** trong bảng đó; phần còn nợ là việc **vận hành**, không phải code (khoá cửa RLS org sau khi theo dõi production, chạy script di trú `data/uploads/` → MinIO/S3). Một số việc **hoãn có chủ đích** (M49 PR3 SSO OIDC merge nhưng flag tắt, M60 major deps) — xem `PROGRESS.md` mục "Việc tạm hoãn".
>
> Khi cần đặc tả cho **module mới**, viết file `M<xx>-*.md` riêng theo khung ở mục Quy ước chung bên dưới TRƯỚC khi code — chỉ gộp vào `G<nn>` cùng nhóm sau khi đã triển khai xong.

## Track `ENG-*` — tích hợp Engineering OS (MEP-Agents/MEPF-Agents), TÁCH khỏi dãy `M<xx>`

Lộ trình riêng cho hướng tích hợp với hệ multi-agent kỹ thuật ngoài (`seeker19110/MEPF-Agents`),
**không dùng chung dãy số `M<xx>` ở trên** — lý do: 2026-08-14 một commit push thẳng `main` đã lỡ
dùng nhãn "M43" cho việc này, đụng độ với `M43-audit-trail.md` (module khác hẳn, đã xong từ lâu).
Quyết định (người dùng chốt): track riêng `ENG-1..ENG-4`, không đụng số `M<xx>`.

- **`PROJECT-COMPLETION-ROADMAP.md`** — 📝 **draft chờ duyệt** (2026-08-15): đặc tả tổng từ C0 baseline → C6 XBoss v1.0/Product Complete, sau đó O1 System of Record → O5 Engineering OS/Vision Complete theo gate. Đây là nguồn trình tự/exit gate; chi tiết contract pilot nằm ở ENG-5.
- **Spec pack Product Complete:** `C0-release-baseline-governance.md` (🚧 phần sửa doc drift đã làm), `ENG-5-integration-contract-pilot.md` (C1 — 🚧 PR1 xong), `C2-mepf-connector-pilot.md` (📝 chờ — cần repo MEPF-Agents + traffic thật), `C3-data-audit-rls-hardening.md` (🚧 **§2 audit UUID** (`0089`/`0090`) và **§3 trọn vẹn** — project axis + relational invariants (`0091`) + Policy RLS cho `engineering_*` (`0092`, PR1 #347 nối ngữ cảnh trước) đã làm; **§5 denominator persistence** đã làm qua `0093` (sổ `import_batches` + đóng dấu mẫu số lên task); **§6 retention** đã có khung dọn qua `lib/ha-tang/retention.ts` + `/api/cron/retention` (mục kỹ thuật bật sẵn, mục nghiệp vụ chờ owner chốt thời hạn); còn §4 backfill ngày Excel (cần dữ liệu production)), `C4-quality-security-dr-release-gate.md`, `C5-uat-production-rollout.md`, `C6-v1-release-closeout.md` (📝 chờ — cần staging/UAT/ký nghiệm thu, không phải việc code).
- **Spec pack Vision Complete:** `OS-1-engineering-system-of-record.md`, `OS-2-digital-twin.md`, `OS-3-predictive-os.md`, `OS-4-controlled-autonomy.md`, `OS-5-engineering-os-closeout.md` — conditional draft; OS-4 A3+ vẫn cần phê duyệt riêng theo capability.

- **`ENG-0-roadmap-tich-hop-engineering-os.md`** — lộ trình tổng (Foundation Hardening → ENG-1 →
  ENG-2 → ENG-3 → ENG-4 → Engineering OS/AI-Digital-Twin/Predictive OS/Controlled Autonomy), 12
  nguyên tắc khoá kiến trúc kế thừa từ MEP-Agents, boundary chống AI tự cấp quyền, Foundation Gate.
  **Đọc file này trước** mọi đặc tả `ENG-<n>`.
- **`ENG-1-mep-agent-integration.md`** — ✅ **xong** (2026-08-14): kho nhận Engineering Object
  (`engineering_objects`/`engineering_sources`/`engineering_source_revisions`/
  `engineering_object_revisions`/`engineering_object_relations`, `migrations/0084_engineering_core.sql`)
  - cổng duyệt Admin/PM trước khi ảnh hưởng BOQ/cost + `POST /api/v1/engineering/ingest` (API key
    scope `engineering`) + trang `/engineering`. Xem `PROGRESS.md` mục "ENG-1" để biết chi tiết sự
    cố đã vá (schema thiếu migration, bug tham số Postgres, sai FK actor).
- **`ENGINEERING-OS-ENG2-ENG3-ENG4.md`** — đặc tả **kiến trúc/khái niệm** cho 3 phase còn lại
  (người dùng cung cấp): pipeline intelligence, evidence-first, 3-gate approval + 5 approval
  profile, 7-bước conflict protocol, Controlled Autonomy boundary. Là **nguồn yêu cầu**; mỗi
  phase có thêm 1 file `ENG-<n>-*.md` là bản **thi hành** (schema DDL/route/lib/test) cho XBoss.
- **`ENG-2-engineering-intelligence.md`** — ✅ **xong** (2026-08-15):
  `migrations/0085_engineering_intelligence.sql` (packages/suggestions/evidence),
  `lib/ky-thuat/engineering-intel.ts` (ranking + confidence + evidence gate, đều là hàm xác định,
  không gọi LLM), `POST /api/v1/engineering/intelligence`, trang `/engineering/suggestions`.
- **`ENG-3-engineering-workflow-os.md`** — ✅ **xong** (2026-08-15): ranh giới uỷ quyền của
  track. `migrations/0086_engineering_workflows.sql` (workflows/gates/events), risk engine +
  5 approval profile A–E + Gate 0 chặn thật + separation of duties, trang
  `/engineering/workflows`. KHÔNG đụng `lib/tien-do/approvals.ts` (M46) — xem lý do trong mục 1 của
  đặc tả.
- **`ENG-4-multi-agent-engineering-os.md`** — ✅ **xong** (2026-08-15):
  `migrations/0087_engineering_agents.sql` (sessions/claims/conflicts), giao thức 7 bước +
  5 loại xung đột + phân xử theo thẩm quyền/bằng chứng/thứ bậc ràng buộc (**không majority
  vote**, có hàm chặn cứng), 5 mức đồng thuận với `no_consensus` là kết quả hợp lệ, trang
  `/engineering/agent-sessions`. ENG-3 vẫn là ranh giới uỷ quyền.
- **`ENG-5-integration-contract-pilot.md`** — 🚧 **PR1 xong (2026-08-15), phần còn lại chờ điều
  kiện ngoài.** Hợp đồng pilot giữa MEPF-Agents và XBoss. **Đã làm (PR1):**
  `migrations/0088_engineering_ingest_contract.sql` (external key cho source/revision, unique
  logic cho relation, bảng lũy đẳng `engineering_ingest_requests`, composite FK chặn relation
  chéo dự án ở tầng DB), external-key relation (agent không cần biết UUID XBoss),
  `Idempotency-Key`/`X-Correlation-Id` + mã 200/201/409/413/422, giới hạn payload,
  `docs/api-v1.md` mục Engineering. **Chưa làm (cần điều kiện ngoài):** OpenAPI 3.1 sinh từ
  nguồn type chung (§5.1-5.2), consumer-contract test phía repo `MEPF-Agents` (§5.4),
  metrics/alert threshold (§6), pilot runbook trên staging (§7).
- **`ENGINEERING-OS-FUTURE-SYSTEMS.md`** (2026-08-15) — đặc tả **tầm nhìn kiến trúc**
  (không phải spec thi hành) cho 4 tầng sau ENG-4: Engineering OS (system-of-record +
  knowledge graph), Digital Twin (7 lớp L0–L6), Predictive OS (uncertainty-first, model
  governance, drift detection), Controlled Autonomy (6 mức A0–A5, policy envelope, kill
  switch, maturity gate A–F). **KHÔNG phải giấy phép bắt đầu code OS-1..OS-9** — đúng
  nguyên tắc #10 (`ENG-0` mục 3): mỗi giai đoạn `OS-<n>` chỉ được lập kế hoạch/code sau
  khi (1) ENG-1..ENG-4 có traffic thật từ MEPF-Agents (hiện **chưa có** — mọi đặc tả
  ENG-1..4 đều ghi "chưa có route gọi được từ phía họ"), và (2) có đặc tả **thi hành**
  riêng cho từng giai đoạn (schema DDL/API/lib/test, cùng khung đã áp dụng cho
  ENG-1..ENG-4). Riêng Controlled Autonomy mức A3 trở lên (hệ tự thực thi side effect
  nghiệp vụ) bắt buộc người dùng chốt tường minh qua `AskUserQuestion` trước khi viết
  bất kỳ đặc tả thi hành nào — không tự suy diễn quyền hạn từ tài liệu tầm nhìn này.

**Track nền tảng `ENG-1..ENG-4` hoàn tất 4/4 phase; ENG-5 đang chờ duyệt.** Các nấc tiếp theo trong lộ trình (Engineering OS →
AI/Digital Twin → Predictive OS → Controlled Autonomy) đã có tài liệu tầm nhìn (mục trên)
nhưng **chưa có đặc tả thi hành** — chờ dữ liệu vận hành thật từ MEPF-Agents, đúng nguyên
tắc #10 (đừng xây hạ tầng trước khi có tải thực tế).

## Danh mục (nhóm → module gộp bên trong)

| File                        | Nhóm nghiệp vụ                       | Module gộp bên trong                            |
| --------------------------- | ------------------------------------ | ----------------------------------------------- |
| `G00-nen-tang.md`           | Nền tảng                             | M00 (AppShell), M21 (IA đầy đủ), M22 (đa dự án) |
| `G01-tien-do-boq.md`        | Tiến độ & BOQ                        | M01, M09, M15, M35, M36                         |
| `G02-chi-phi-hop-dong.md`   | Chi phí & Hợp đồng                   | M02, M06, M07, M16, M17, M27                    |
| `G03-mua-sam-vat-tu.md`     | Mua sắm & Vật tư                     | M04, M18, M33                                   |
| `G04-chat-luong-an-toan.md` | Chất lượng & An toàn                 | M03, M11                                        |
| `G05-hien-truong.md`        | Hiện trường                          | M05, M12, M14                                   |
| `G06-ban-ve-ho-so.md`       | Bản vẽ & Hồ sơ                       | M08, M10, M13, M19, M20, M32, M34               |
| `G07-khoi-dong-to-chuc.md`  | Khởi động & Tổ chức                  | M23, M24                                        |
| `G08-moi-truong-rui-ro.md`  | Môi trường & Rủi ro                  | M25, M26                                        |
| `G09-ban-giao-van-hanh.md`  | Bàn giao & Vận hành                  | M28, M29, M30                                   |
| `G10-cong-nghe.md`          | Công nghệ                            | M31                                             |
| `G11-uiux.md`               | UI/UX xuyên suốt (không route riêng) | M37, M38, M39, M40, M41, M42                    |

> Bối cảnh lịch sử các đợt (FastCons nhóm A-E, AppShell IA N1-N4, UX 2026-07...) không còn cần thiết để tra cứu module đã xong — xem `docs/ke-hoach-*.md` nếu cần đối chiếu quyết định gốc.

## Đợt "lên tầm ERP" (M43–M52, viết 07/2026) — ĐÃ TRIỂN KHAI XONG

Xuất phát từ `docs/nghien-cuu-nang-cap-erp-2026-07.md` (nghiên cứu 9 trục + bảng điểm). Thứ tự ưu tiên P0 → P3; số migration thực tế đã dùng khác số tạm trong đặc tả (bài học M32/M33). **Toàn bộ M43–M52 đã merge vào `main`** — cột dưới ghi migration/điểm chạm thực tế để tra cứu.

| File                         | Hạng mục                                                                 | Trạng thái                                             | Migration/điểm chạm thực tế                                                                          |
| ---------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `M43-audit-trail.md`         | Ngữ cảnh request + audit trail toàn hệ (trigger + SET LOCAL)             | ✅ xong                                                | `0049_audit_log.sql`, `0059_sso_audit.sql`                                                           |
| `M44-van-hanh.md`            | Backup/DR, health, structured logging, Sentry, staging                   | ✅ xong                                                | `app/api/health`, Sentry scaffold (chờ ops đặt DSN)                                                  |
| `M45-chat-luong-du-lieu.md`  | Money helper, CHECK, ERD tự sinh, soft-delete, test bất biến scope       | ✅ xong                                                | `lib/nen/money.ts`, `0050`/`0051_checks`/`0052_soft_delete`                                          |
| `M46-approval-engine.md`     | Phê duyệt nhiều cấp cấu hình được (ngưỡng, SLA, SoD)                     | ✅ xong                                                | `0053_approvals.sql`                                                                                 |
| `M47-evm-bi.md`              | EVM (SPI/CPI/EAC), materialized views, saved reports, alert rules        | ✅ xong                                                | `0054_saved_reports`/`0055_matviews`/`0056_alert_rules`                                              |
| `M48-tich-hop-tai-chinh.md`  | Khung integrations, adapter kế toán, hoá đơn điện tử NĐ 70/2025          | ✅ xong                                                | `0057_integrations.sql`                                                                              |
| `M49-api-mo-sso.md`          | API keys `/api/v1`, webhook ra ngoài, SSO OIDC                           | ⚠️ PR1/PR2 xong; PR3 SSO OIDC merge nhưng **flag tắt** | `app/api/v1`, `0064_webhooks`/`0061_api_keys`                                                        |
| `M50-phan-quyen-nang-cao.md` | Override quyền trong DB, quyền theo trường, báo cáo SoD                  | ✅ xong                                                | `0058_role_permissions.sql`, `lib/bao-mat/permissions.ts`                                            |
| `M51-da-du-an-rls.md`        | RLS phòng tuyến 2 (kèm ADR-0005), template dự án, organizations          | ⚠️ **GĐ0 xong (PR1/PR2/PR4, #256), nợ "khoá cửa"**     | `0069_rls.sql`/`0070_organizations.sql`, `docs/adr/0005-rls.md`, `lib/db/index.ts::withProjectScope` |
| `M52-mo-rong-cau-hinh.md`    | code_lists, custom fields, module registry, feature flags, tách tracking | ✅ xong                                                | `0060_code_lists`/`0062_custom_fields`/`0063_feature_flags`                                          |

## Đặc tả ĐÃ DUYỆT chờ triển khai — đợt plugin AutoCAD giai đoạn 2 (viết + duyệt 2026-08-25)

> **M100 (`M100-xboss-ve-shop-drawing.md`)** — bộ lệnh vẽ `XBOSS_VE_*`: vẽ shop drawing MEPF đè lên thiết kế đã chuẩn hóa, sinh tuyến/phụ kiện/thiết bị **đã đúng chuẩn ngay từ đầu** (layer + block + size XData theo rule pack v4 `drawTools` + thư viện block có version), kèm trang in (`XBOSS_VE_TRANGIN`) + mặt cắt bán tự động (`XBOSS_VE_MATCAT`) + giá đỡ tự động (`XBOSS_VE_GIADO`) + sleeve/lỗ chờ (`XBOSS_VE_LOCHO`) + tag tuần tự + bảng thống kê + độ dốc. 7 PR. **Approved for implementation 2026-08-25**; tính năng để lại phiên bản sau ghi ở §20 (ngắt nét giao chéo, revision cloud, nhân bản tầng điển hình, riser…).
> **M100 tiến độ thi hành: XONG cả 7 PR (2026-08-25)** — PR1 rule pack v4 (`drawTools`+`sheetSetup`) + validator Core; PR2 thư viện block (`migrations/0139_cad_block_libs.sql`, `lib/ky-thuat/cad/block.ts`, `app/api/engineering/cad/block-lib/`, mục "Thư Viện Block" trên `/engineering/chuan-hoa-ban-ve`, `Core/Draw/BlockManifest.cs`); PR3 `XBOSS_VE_NEN`/`XBOSS_VE`/`XBOSS_VE_NHAN` + `Core/Draw/EdgeOffset.cs`; PR4 `XBOSS_VE_PHUKIEN`/`_THIETBI`/`_THUVIEN` + `BlockLibraryService` + `FittingPlacement`; PR6 `XBOSS_VE_TRANGIN`/`_MATCAT` + `SectionBuilder`/`SheetSetup`; PR7 `XBOSS_VE_GIADO`/`_LOCHO`/`_TAG`/`_THONGKE` + `SupportSpacing`/`SleeveSchedule`/`TagSchedule`/`ThongKeTable`; PR5 `XBOSS_VE_DOI` + `XBOSS_VE_BAOCAO` (báo cáo phiên vẽ `Core/Reporting/VeSessionReport.cs`) + **rule pack v7** (2 item đếm giá đỡ/lỗ chờ + `heavyFittingIds`) + tài liệu plugin. **Còn nợ:** verify tay toàn bộ Adapter trên máy có AutoCAD 2026 (không có runner Windows — M100 §18) — xem `PROGRESS.md`.
> **M101 (`M101-plugin-nang-tran.md`)** — nâng trần 3 khối M99: `XBOSS_KIEMTRA` 9→16 phép kiểm (kèm clash 2D có cảnh báo), `XBOSS_CHUANHOA` 7→11 bước (style/xref/hatch/layout), `XBOSS_BOCKL` bóc theo size/vùng/cách nhiệt + `boqCode` per-project + đối chiếu BOQ chỉ-đọc; rule pack v5. 5 PR. **Approved for implementation 2026-08-25** (open §18 chốt trong State).
> **M101 tiến độ thi hành:** PR1 (rule pack `v5.json` + 7 phép kiểm mới trong `XBoss.Cad.Core/Inspection/PhepKiemMoRong.cs` + `Geometry/Segment2D.cs`, mọi phép mặc định TẮT, Adapter chưa đụng) **đã làm 2026-08-25**; PR3 (rule pack `v6.json` + bóc theo size/vùng/cách nhiệt/hệ số quy đổi: `Core/Zoning/VungClipper.cs`, `Core/Takeoff/TakeoffSize.cs`+`TakeoffZoning.cs`, Excel cột L–Q + sheet `Tong-hop-vung`, Adapter `VungChonService` + `TakeoffScanner`) **đã làm 2026-08-25**; PR2 (rule pack `v7.json` + 4 bước chuẩn hóa mới 8/9/10/11 trong `XBoss.Cad.Core/Standardize/ChuanHoaMoRong.cs` + `XBoss.Cad.Acad/Services/StandardizePipeline.cs`, cả 4 mặc định TẮT; kèm đóng nợ gộp layer lệch hoa/thường) **đã làm 2026-08-25**; PR4 (`boqCode` per-project: migration `0140_cad_boq_code_map.sql` + `lib/ky-thuat/cad/dashboard.ts` + `lib/dich-vu/cad.ts`, `GET /api/engineering/cad/rule-pack?project=` và `GET /api/engineering/cad/boq-snapshot` (chỉ đọc), mục "Mã BOQ theo dự án" trên bảng điều khiển, sheet Excel `Doi-chieu`) **đã làm 2026-08-25** — xem `PROGRESS.md`. PR5 (XBOSS_BATCH chế độ bóc hàng loạt + XBOSS_UPLOAD gửi kèm KL bóc + web hiển thị/biểu đồ + tải Excel gộp) **đã làm 2026-08-25** (#397). **M101 XONG cả 5 PR.**
> **M102 (`M102-plugin-dong-tran-chuan-hoa.md`)** — đóng 4 khoảng trống cuối của pipeline chuẩn hóa sau M99/M100/M101: bước chuẩn hóa 12 (đóng polyline gần kín — trước đây KIEMTRA báo mà CHUANHOA không sửa), bước 13 (quy block lạc chuẩn về thư viện block 0139 — trước đây chỉ báo block nặc danh), 2 phép kiểm chéo đã hẹn ở M100 §20 (17 tag trùng, 18 mã BOQ mồ côi), và đóng phần còn lại của nợ idempotency (tài liệu `knownIssues` + test bất biến ở mức pipeline). Rule pack v8, không migration, không API mới. 2 PR. **Approved for implementation 2026-08-25.**
> **M102 tiến độ thi hành: XONG cả 2 PR (2026-08-25, PR #398 đã merge)** — PR1 rule pack `v8.json` + validator 2 tầng + phép kiểm 17/18 (`XBoss.Cad.Core/Inspection/PhepKiemMoRong.cs`) + Core bước 12/13 (`Standardize/ChuanHoaMoRong.cs`) + test xunit/node:test + gỡ dòng `knownIssues` ghi nợ đã đóng; PR2 Adapter thi hành bước 12/13 (`XBoss.Cad.Acad/Services/StandardizePipeline.cs`) + quét tag cho phép kiểm 17 (`DrawingSnapshotBuilder.cs`) + bổ sung stub API còn thiếu trong `XBoss.Cad.AcadShim/AcadStub.cs`. Mọi khóa mới **mặc định tắt/`reportOnly`** nên v8 cho kết quả y hệt v7 — merge xong không đổi hành vi trên máy kỹ sư, bật dần theo dự án sau pilot. **Điểm lệch đặc tả đã chốt:** bước 13 nối đuôi sau bước 11 (không chèn giữa 6 và 7 như bản nháp §6.2 — tránh đánh lại số hiệu bước đã vào báo cáo JSON), đổi lại báo cáo nhắc chạy lại lệnh để purge dọn định nghĩa block cũ; phần idempotency layerMap của §6.3 bỏ khỏi phạm vi vì M101 PR2 đã vá. **Còn nợ:** verify tay Adapter trên máy có AutoCAD 2026 (không có runner Windows — M99 §18) — xem `PROGRESS.md`.
>
> **⇒ Đợt plugin AutoCAD giai đoạn 2 (M99 → M102) đã đóng toàn bộ về mặt code.** Việc còn lại của cả đợt là một cổng duy nhất: verify tay trên máy có AutoCAD 2026. Hướng đi tiếp đã rà nhưng **chưa có đặc tả**: gán ngữ nghĩa sâu hơn (đồ thị kết nối tuyến–thiết bị), phối hợp xung đột 2D liên hệ (combined services), và các mục để lại ở M100 §20. **Cập nhật 2026-08-28:** toàn bộ M100 §20 nay ĐÃ CÓ đặc tả (M109–M113 dưới đây, State Draft — chờ duyệt); 2 hướng lớn còn lại (đồ thị kết nối, combined services) vẫn chưa có đặc tả theo phạm vi người dùng chốt 2026-08-28.

## Đặc tả ĐÃ DUYỆT — đóng nốt M100 §20 (viết 2026-08-28, duyệt 2026-08-29)

> Sinh từ yêu cầu người dùng 2026-08-28 ("viết nốt đặc tả cho hướng còn lại"); phạm vi + 3 ngã rẽ
> thiết kế chốt qua `AskUserQuestion` cùng ngày: **chỉ làm các mục M100 §20** (2 hướng lớn — đồ thị
> kết nối tuyến–thiết bị, combined services — để sau), revision cloud **chỉ phần CAD**, phối hợp xung
> đột (nếu làm sau) đi đường "đề xuất, kỹ sư quyết". Cả 5 tệp **Approved for implementation 2026-08-29**.
>
> **M109 (`M109-ngat-net-giao-cheo.md`)** — `XBOSS_VE_NGATNET`/`_XOA`: ngắt nét tuyến đi dưới tại
> chỗ giao (wipeout cho tuyến 2 nét biên, cầu vượt cho tuyến đơn nét), thứ tự trên–dưới theo
> `crossingPolicy.priority` + đảo tay từng điểm nhớ trong XData. Dùng lại đúng bộ dò giao cắt của
> phép kiểm 11 (M101). **Bất biến số 1: polyline tim không bao giờ bị cắt/chia/đổi tọa độ** —
> `XBOSS_BOCKL` phải ra đúng con số như trước (AC2). Rule pack +1 version, không migration. 2 PR.
> **Trạng thái: code XONG cả 2 PR** — PR1 (rule pack v13 `crossingPolicy` + validator 2 tầng +
> `CrossingGeometry` + `VaiTroVe.NgatNet` + test Core), PR2 (2 lệnh Adapter, `DrawOrder`, hộp thoại
> M106 + đảo tay theo cặp tuyến, mục báo cáo phiên vẽ). **Còn nợ verify tay trên AutoCAD thật**
> (AC1 + in PDF, AC2 tọa độ đỉnh tim) — mục `C4c` trong `plugin-autocad/VERIFY-VA-PHAT-HANH.md`.
>
> **M110 (`M110-revision-cloud.md`)** — `XBOSS_VE_REV` / `_CHOT` / `_HIENTHI`: cloud + tam giác
> revision + bảng revision trong attribute khung tên. Điểm khác `REVCLOUD` của AutoCAD: plugin ghi
> **mốc** (băm hình học của mọi đối tượng có XData) khi chốt revision, nên lần sau **đề xuất được**
> vùng thêm/xóa/đổi và cảnh báo vùng đã sửa mà chưa khoanh. Số revision append-only, cloud cũ giữ lại
> ở layer con `-R{n}`. **Chỉ CAD — không đụng server/web/`drawing_revisions`** (chốt 2026-08-28).
> Rule pack +1, không migration. 2 PR.
>
> **Trạng thái M110 (2026-08-29): ĐÃ CODE XONG cả 2 PR** (PR1 Core + rule pack v14, PR2 Adapter:
> `Commands/VeRevCommands.cs`, `Services/RevisionStore.cs`, layer con `-R{n}`, hộp thoại M106, phép
> kiểm 20 cloud/tam giác mồ côi, tài liệu). **Còn nợ: verify tay AC1–AC7/AC9/AC10 trên máy có
> AutoCAD 2026** (môi trường CI không chạy được AutoCAD) — chưa verify thì chưa phát hành rộng.
> PR2 còn thêm kind `annotation` vào thư viện block (`LOAI_BLOCK` + `BlockKind`) vì đặc tả §5 dùng
> `kind=annotation` cho tam giác revision mà enum cũ chưa có; kind này **không** nằm trong nhóm đếm
> khối lượng.
>
> **M111 (`M111-nhan-ban-tang-dien-hinh.md`)** — ✅ **CODE XONG cả 3 PR** (rule pack v12+
> `drawTools.floorPolicy`, mặc định TẮT)
>
> - validator 2 tầng + Core `FloorReplicator` + XData `TangNguon`/`NhanTang` + test ở PR1; lệnh
>   `XBOSS_VE_NHANTANG` (Adapter `DeepCloneObjects` + ánh xạ handle, hộp thoại + xem trước bắt buộc,
>   FR8/FR9, nguyên tử) ở PR2; **PR3** thêm phép kiểm **19** `nhantang-handle-mo-coi` tự động trong
>   `XBOSS_KIEMTRA` (AC3 — không cần kiểm mắt) + tài liệu (`README.md`/`CAI-DAT.md` — lệnh mới trong
>   luồng làm việc; `VERIFY-VA-PHAT-HANH.md` mục C9, item 68–81 — kịch bản verify tay AC1–AC12).
>   `XBOSS_VE_NHANTANG`: chép hệ của tầng điển hình sang N tầng. Việc mà `COPY` của AutoCAD **không**
>   làm được: ánh xạ lại toàn bộ handle trong XData sang đối tượng của chính bản chép
>   (`DeepCloneObjects` + `IdMapping`), đổi tag `{floor}`, đổi tên vùng bóc, gỡ dấu bóc. Xem trước
>   **bắt buộc**, nguyên tử (lỗi giữa chừng → không ghi tầng nào), AC3 "không handle mồ côi" kiểm
>   **tự động**. Rule pack +1 (v12, sau đó gộp lên v13/v14 khi hợp nhất với M109/M110), không
>   migration. 3 PR (PR2 `route: complex`).
>
>   **CÒN NỢ — CHẶN phát hành rộng:** đây là lệnh rủi ro cao nhất của cả bộ plugin (chính lý do M100
>   §20 từng hoãn mục này); **chưa verify tay trên bản vẽ AVIO thật** (môi trường code không có
>   AutoCAD). Toàn bộ AC1–AC12 phải chạy thật trên máy có AutoCAD 2026 theo kịch bản
>   `VERIFY-VA-PHAT-HANH.md` mục C9 **trước khi** phát hành gói cho cả đội hay cho phép M112 (riser)
>   bắt đầu — M112 đã ghi rõ điều kiện tiên quyết này.
>
> **M112 (`M112-so-do-dung-riser.md`)** — `XBOSS_VE_TRUCDUNG` + `XBOSS_VE_RISER`: kỹ sư đánh dấu điểm
> trục đứng trên từng mặt bằng (XData vai trò `TrucDung` = "dữ liệu liên tầng có cấu trúc" mà M100 §20
> nói còn thiếu), plugin dựng sơ đồ đứng từ đó. Cao độ tầng **khai tay, cấm nội suy** (luật M100 §6.3).
> Sơ đồ là snapshot ⇒ có phép kiểm "sơ đồ đứng cũ hơn mặt bằng", cùng lối `XBOSS_VE_MATCAT`; vai trò
> `Riser` bị loại khỏi takeoff (bất biến có test). **Điều kiện tiên quyết: M111 đã chạy thật qua
> pilot.** Rule pack +1, không migration. 3 PR (PR3 `route: complex`).
>
> **M113 (`M113-thu-vien-block-theo-du-an.md`)** — thư viện block **hai tầng, dự án đè lên toàn cục**
> (không phải thay toàn cục bằng per-project): `cad_block_libs` thêm `project_id` nullable + RLS 2
> nhánh theo đúng khuôn `0140` của M101 PR4, `UNIQUE(version)` → unique theo `(project_id, version)`,
> hàm thuần `tronThuVienBlock` là **chỗ duy nhất** biết luật đè. Tương thích ngược tuyệt đối: plugin
> không gửi `?project=` nhận đúng thư viện toàn cục như hôm nay (AC1). **Migration đụng ràng buộc trên
> dữ liệu đang có ⇒ bắt buộc qua staging, không đi thẳng production**; vùng rủi ro cao, rà
> `docs/audit.md`. 4 PR.
>
> **Mục thứ 6 của M100 §20 (đối chiếu chéo M101) không cần đặc tả — đã tự đóng:** phép kiểm 17 (tag
> trùng) và 18 (mã BOQ mồ côi) nằm trong `PhepKiemMoRong.cs` từ M102, và `support-hanger`/
> `sleeve-opening` đã là item takeoff trong rule pack từ M100 PR5.
>
> **Số rule pack / số migration ghi trong 5 tệp trên là DỰ KIẾN** — người thi hành phải lấy số thật
> bằng `ls lib/ky-thuat/cad/rule-packs | sort -V | tail -1` và `ls migrations | sort -V | tail -1`
> (luật số migration ở mục dưới).
> **M103 — Đề xuất block vào thư viện từ AutoCAD** (`M103-de-xuat-block-thu-vien.md`): **XONG cả 3 phần (server + web + plugin) 2026-08-25**; lệnh `XBOSS_VE_DEXUAT` (Commands/VeDeXuatCommands.cs), dialog `Ui/DeXuatBlockDialog.cs`, builder `Services/BlockUngVienBuilder.cs`.
> **M104 — Thêm block trực tiếp từ web** (`M104-them-block-truc-tiep-tu-web.md`): server + web **đã làm 2026-08-25**, route `POST /api/engineering/cad/block-lib/blocks` + `GET ?file=` (tệp DWG lẻ lưu riêng), form kéo-thả, advisory lock chống đua, 15 ca test; plugin đọc đa tệp **đã xong cùng ngày** — **M104 XONG trọn 3 phần**.
> **M105 — Tự động phân chia đốt toàn hệ MEPF theo kiểu kết nối** (`M105-chia-dot-mepf-theo-kieu-noi.md`): ✅ **Approved 2026-08-26 — PR1 XONG + PR2 (Core + Adapter) XONG.** Chia đốt MỌI tuyến MEPF vẽ bằng `XBOSS_VE` (ống gió nẹp C 1180 / TDC 1110 / mặt bích V 1180 — số người dùng chốt; ống nước/PCCC cây 5800 ren/grooved/măng xông; máng cáp thanh 2500 + tấm nối) bằng MỘT engine tổng quát tham số hóa qua rule pack **v9** `jointRules` — thêm hệ/kiểu nối mới về sau chỉ sửa rule pack, không sửa code. PR1: engine TS + 9 test vector JSON dùng chung + `migrations/0143` (RLS 2 nhánh) + API + trang `/engineering/joint-segmentation`. PR2 Core: bản C# `JointRulesConfig`/`JointSegmenter` ra đúng từng số như bản TS (56 ca đọc chính 9 vector đó; làm tròn phải `MidpointRounding.AwayFromZero`). PR2 Adapter: lệnh `XBOSS_VE_CHIADOT` (vẽ vạch chia + tag, XData 2 chiều nên chạy lại idempotent, 1 nhóm UNDO, tuyến không khai `jointRules` bị bỏ qua kèm lý do) + hình học ở Core `JointMarkPlacement` + bảng đốt trong `XBOSS_VE_THONGKE` + mục chia đốt trong báo cáo phiên vẽ; 661/661 ca .NET xanh. Còn lại: verify tay trên máy có AutoCAD 2026.
> **M106 — Hộp thoại WPF cho toàn bộ lệnh plugin + trình dẫn quy trình** (`M106-hop-thoai-wpf-va-quy-trinh.md`): ✅ **Approved 2026-08-26 — PR1 (nền + 2 lệnh mẫu) XONG.** Kỹ sư chạy lệnh bằng **chuột**: khung hộp thoại WPF chung (`XBoss.Cad.Acad/Ui/Wpf/XBossDialog.xaml`) + ViewModel **thuần .NET ở Core** (`XBoss.Cad.Core/Ui/ViewModels/`) nên toàn bộ hành vi hộp thoại test được trên CI Linux; quy trình chuẩn 6 giai đoạn khai một chỗ (`Core/Ui/QuyTrinh.cs` + `LenhCatalog.Buoc`/`ThuTuTrongBuoc` bắt buộc khai — quên xếp bước là không biên dịch nổi). Áp dụng thật cho `XBOSS_VE` (5 câu hỏi nối tiếp → một form) và `XBOSS_VE_CHIADOT` (xem trước số đốt + chiều dài từng đốt, gọi thẳng `JointSegmenter`). Đường lui FR9: lỗi dựng UI hoặc `XBOSS_UI_DIALOG=0` → về đúng hỏi đáp dòng lệnh cũ. **PR2 (trình dẫn quy trình) XONG 2026-08-26:** `QuyTrinh.TinhTrang` suy trạng thái 6 giai đoạn từ dữ liệu **đã đọc sẵn** (token/rule pack/sidecar/XData — Core không chạm `Database`, có test cho từng bước + ca "mở lại bản vẽ phiên trước vẫn là Xong"); `XBOSS_BANG` thành 2 tab **Quy trình** (`Ui/TrinhDanControl.cs` — trạng thái ✓/○/– + lý do tiếng Việt + nút chạy từng lệnh, nút bước chưa đủ điều kiện **mờ nhưng vẫn bấm được** theo §6) và **Trạng thái** (M102 giữ nguyên), tự tính lại khi đổi bản vẽ; Ribbon thêm panel **"Quy trình"** đứng đầu và xếp nút theo `(Buoc, ThuTuTrongBuoc)`. 735/735 ca .NET xanh, AcadShim 0 warning. **PR3 (phủ nốt các lệnh còn lại) XONG 2026-08-26 ⇒ M106 ĐÓNG về mặt code:** 19 ViewModel mới ở `Core/Ui/ViewModels/` phủ 20 lệnh còn lại của §7.2 (kết nối → chuẩn hóa → vẽ → chi tiết → hồ sơ → bóc & nộp), XAML là **DataTemplate thuần** trong `XBossDialog.xaml` nên vẫn đúng MỘT `InitializeComponent()` trong cả plugin; nội dung mỗi hộp thoại bám **đúng câu hỏi lệnh đang hỏi** (chỗ nào bảng §7.2 lệch với code thật thì lấy code thật làm chuẩn và ghi rõ lý do trong doc-comment), thông tin suy ra chỉ hiển thị CHỈ ĐỌC theo FR6; câu hỏi **tỉ lệ in 1:x** đưa vào hộp thoại của `XBOSS_VE_NHAN`/`_THONGKE`/`_MATCAT`/`_TRANGIN` nhưng vẫn nhớ ở đúng `VeContext.TiLeIn`; AC8 hoàn tất — `Ui/DeXuatBlockDialog.cs` (WinForms) đã xóa, palette `XBOSS_BANG` giữ WinForms theo ranh giới đã chốt. Fallback FR9 giữ nguyên cho mọi lệnh (trừ `XBOSS_VE_DEXUAT` vốn chưa từng có đường keyword — UI hỏng thì dừng kèm lý do). 831/831 ca .NET xanh, AcadShim 0 warning. **Còn lại:** verify tay §C6 (33–36), §C7 (37–42) và §C8 (43–63) của `plugin-autocad/VERIFY-VA-PHAT-HANH.md` trên máy có AutoCAD 2026.
> **M107 — Nhận tuyến có sẵn thành tuyến XBoss** (`M107-nhan-tuyen-co-san.md`): ✅ **Approved 2026-08-26 — XONG về mặt code 2026-08-26.** Lệnh `XBOSS_VE_NHANTUYEN` (`XBoss.Cad.Acad/Commands/VeNhanTuyenCommands.cs`) khai hệ/loại/cỡ cho tuyến của **bản thiết kế người khác**: đổi layer về layer chuẩn của loại tuyến, ghi XData `XBOSS_VE` vai trò `Tim` **đúng cấu trúc tuyến do `XBOSS_VE` vẽ** (mọi lệnh sau không phân biệt được nguồn gốc), sinh 2 nét biên qua `EdgeOffset.Tinh` cho `edgeStyle: "double"`. **Không đụng hình học tim** (chỉ layer + XData + THÊM biên); `Line` chuyển thành polyline 2 đỉnh cùng tọa độ; chạy lại = nhận lại (xóa nét biên cũ của đúng tuyến đó rồi dựng lại, gỡ dấu bóc + xóa vạch chia đốt kèm nhắc chạy lại — dùng lại `MarkService.Unmark`/`VeThucThe.XoaChiaDotCua`); đối tượng thuộc xref và không phải polyline/line bị bỏ qua **kèm lý do đếm được**. Hộp thoại theo khung M106 (`NhanTuyenDialogViewModel` ở Core + `DataTemplate` trong `XBossDialog.xaml`) với đường lui `XBOSS_UI_DIALOG=0`. 886/886 ca .NET xanh, AcadShim 0 warning. **Còn lại:** verify tay §C4b của `plugin-autocad/VERIFY-VA-PHAT-HANH.md` (nhấn AC6 tọa độ đỉnh không đổi + AC4 không còn biên cũ sót) trên máy có AutoCAD 2026.
> **M108 — Nạp block hàng loạt từ file tổng hợp + gợi ý phân loại bằng AI** (`M108-nap-block-hang-loat-va-goi-y-ai.md`): ✅ **Approved for implementation 2026-08-26.** Đóng khoảng trống duy nhất còn lại của đường nạp thư viện block: hiện M103 (`XBOSS_VE_DEXUAT`) và M104 (`POST /api/engineering/cad/block-lib/blocks`) đều **một block một lần, người tự khai `kind`** — một tệp thư viện 200 block cần 200 lượt thao tác. M108 nạp cả tệp trong một lượt, phân loại **4 tầng** (luật tất định → khớp ngữ nghĩa → vision trên `dungPreviewSvg` → **người duyệt theo lô**), trùng tên thì bỏ qua kèm lý do; tái dùng cùng cỗ máy để **gợi ý `layerMap`** và **gợi ý `boqCode` per-project**. Là chỗ **đầu tiên** đưa SDK LLM vào codebase XBoss (`lib/nen/ai.ts`, `claude-opus-5`, structured output ép enum + Batches API + prompt caching), theo đúng boundary ENG-0/ENG-1: gọi **từ server**, kết quả **luôn** vào hàng chờ duyệt, AI **không đo hình học / không tự phát hành / không ghi thẳng DB**; thiếu `ANTHROPIC_API_KEY` hoặc `XBOSS_AI_BLOCK_CLASSIFY=0` → tầng 2/3 tự tắt, tầng 1 chạy bình thường. 5 PR, migration `0144` thêm thuần. 4 quyết định nền đã chốt với người dùng qua `AskUserQuestion` 2026-08-26 (§4); 3 open decision còn lại ở §18.
> **M102 (`M102-plugin-ui.md`)** — giao diện UI plugin AutoCAD: tab Ribbon "XBoss" (5 panel/25 nút dựng từ danh mục `XBoss.Cad.Core/Ui/LenhCatalog.cs` — nguồn sự thật duy nhất, test đối chiếu với mọi `[CommandMethod]`) + bảng điều khiển `XBOSS_BANG` (PaletteSet chỉ-đọc: trạng thái đăng nhập/rule pack/sidecar JSON cạnh DWG). ✅ **Đã triển khai 2026-08-25** — xem `PROGRESS.md`.

## ✅ Duyệt trọn gói M109–M114 (2026-08-29) — thứ tự thi hành

> Người dùng chốt **"duyệt tất cả"** 2026-08-29. Cả 6 đặc tả chuyển sang
> **Approved for implementation**; **8/9 mục Open đã chốt ngay khi duyệt** (ghi trong §Rủi ro của
> từng tệp), mục còn lại của M114 **hoãn có chủ đích tới PR4** vì cần đo trên bản vẽ thật — PR1–PR3
> không phụ thuộc nên không chặn. **Cập nhật 2026-08-29:** mục đó đã chốt khi làm PR4 (nhánh nối
> liền, xem mục M114 bên trên) ⇒ **không còn open decision nào trong cả 6 đặc tả.**
>
> **Các quyết định chốt lúc duyệt:**
>
> | Đặc tả | Mục                           | Chốt                                                                                                        |
> | ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
> | M109   | `priority` mặc định           | Giữ trong rule pack; dự án khác thì sửa qua `?project=`                                                     |
> | M111   | Kiểm handle mồ côi            | **Phép kiểm trong `XBOSS_KIEMTRA`** (canh được mọi lệnh, không riêng M111)                                  |
> | M111   | Tầng nguồn đang đỏ KIEMTRA    | **Cảnh báo, KHÔNG chặn** — bản vẽ người khác luôn có lỗi tồn đọng; xem trước + nguyên tử đã đủ chốt an toàn |
> | M112   | Trục xuyên nhiều tệp          | Ngoài phạm vi; cần thì mở M mới                                                                             |
> | M112   | Tỉ lệ sơ đồ đứng              | **Theo tỉ lệ cao độ thật** (đúng AC1)                                                                       |
> | M113   | Ai phát hành bộ block dự án   | **`CAN.manageDrawings` trong phạm vi dự án** — PM dự án làm được                                            |
> | M113   | Tầng `org_id`                 | Chưa làm; xem lại sau UAT đa tổ chức                                                                        |
> | M114   | Nhiều hệ một lượt             | Không; chỉ xét lại sau pilot, phải mở M mới                                                                 |
> | M114   | Nhánh tách riêng hay nối liền | **Chốt ở PR4 (2026-08-29): NỐI LIỀN** — mỗi cạnh hành lang vẽ đúng 1 lần, không thì `XBOSS_BOCKL` bóc trùng |
>
> **Thứ tự thi hành khuyến nghị** (theo phụ thuộc cứng + rủi ro):
>
> 1. **M109** (ngắt nét giao chéo) và **M113** (thư viện block theo dự án) — độc lập, làm song song
>    được. M113 PR1 **phải qua staging** (migration đụng ràng buộc trên dữ liệu đang có).
> 2. **M110** (revision cloud) — độc lập, chỉ CAD.
> 3. **M111** (nhân bản tầng) — **rủi ro cao nhất cả bộ**; verify tay trên bản vẽ AVIO thật trước khi
>    phát hành rộng.
> 4. **M114** (auto-routing) — độc lập về code nhưng nên đi sau M109 để `crossingPolicy` có sẵn cho
>    tuyến sinh tự động.
> 5. **M112** (riser) — **điều kiện tiên quyết: M111 đã chạy thật qua pilot**, không được làm trước.

## Nghiên cứu + đặc tả ĐÃ DUYỆT — auto-routing MEPF (2026-08-29)

> **`RESEARCH-AUTO-ROUTING-MEPF.md`** — nghiên cứu theo yêu cầu "auto route từng hệ riêng 1, hybrid
> cũng được, kỹ sư chuẩn bị trước rồi auto routing". Phát hiện chính khi đọc code thật: thứ đang mang
> tên auto-routing trong repo (**M77**) **không dùng lại được** — `findOptimalRoute3D` và
> `solve3DGenerativeRoute` ghi "3D A\*" nhưng là cây quyết định cố định, phép thử va chạm so hộp bao
> đoạn thẳng nên báo vướng gần như mọi tuyến chéo dài, và cả hai chỉ nhận/trả JSON — **không có đường
> nào chạy vào bản vẽ**. Thứ đáng giữ: `planMultiTierCorridor` (phân tầng cao độ + làn ngang). M77 đã
> được **đính chính tài liệu** cùng đợt (khối cảnh báo đầu tệp).
>
> **`M114-auto-routing-hanh-lang.md`** — ✅ **CODE XONG cả 4 PR (2026-08-29)**, rule pack **v15**
> `drawTools.routingPolicy` (mặc định TẮT). `XBOSS_VE_HANHLANG` + `XBOSS_VE_TUYENTUDONG`. Đi
> tuyến trên **đồ thị hành lang** (Dijkstra vài chục nút) thay vì A\* không gian tự do: kỹ sư chuẩn bị
> 4 mẩu dữ liệu (3 đã có sẵn công cụ — thiết bị mang XData, vùng M101 PR3, tham số tầng trong rule
> pack; chỉ **hành lang** là lệnh mới), máy chạy **một hệ một lượt** theo thứ tự ưu tiên. Hàm chi phí
> có số hạng `reuseFactor` thưởng cho cạnh mà nhánh khác của chính hệ đó đã đi — đó là thứ khiến các
> nhánh **gom vào trục chung** rồi mới tỏa ra, tức trông giống bản vẽ người làm. Tuyến sinh ra là
> **polyline tim mang XData `XBOSS_VE`** (khuôn M107) nên `_PHUKIEN`/`_NHAN`/`_CHIADOT`/`_GIADO`/
> `_LOCHO`/`BOCKL` dùng được ngay — auto-routing là máy phát đầu vào cho dây chuyền đã có, không phải
> hòn đảo. Trạng thái chiếm chỗ làn sống trong XData hành lang nên **không migration, không API mới**.
> 4 quyết định nền đã chốt với người dùng (§2); 4 PR; PR4 `route: complex`.
>
> - **PR1** rule pack v15 + validator 2 tầng + `Routing/HanhLangGraph.cs` + `Routing/DinhTuyen.cs`
>   - XData `VaiTroVe.HanhLang`/`LanChiem` + test Core. **PR2** `Routing/CapPhatLanTang.cs` +
>     `doi-chung/routing-doi-chung.json` + test đối chứng 2 tầng (C# ↔ `planMultiTierCorridor`).
>     **PR3** lệnh `XBOSS_VE_HANHLANG` (vẽ mới / NHẬN polyline có sẵn / sửa / xóa) + hộp thoại M106.
>     **PR4** lệnh `XBOSS_VE_TUYENTUDONG`: `Routing/KeHoachDiTuyen.cs` nối đồ thị → định tuyến → cấp
>     tầng/làn, hộp thoại xem trước **bắt buộc** (nét mảnh tạm bằng **đồ họa tạm**, hủy là bản vẽ
>     không đổi một thực thể nào), sinh polyline tim + nét biên, cờ `SuaTay` theo băm hình học, chạy
>     lại idempotent (gỡ chiếm chỗ cũ trước khi cấp lại), mục báo cáo phiên vẽ, tài liệu.
> - **Quyết định chốt ở PR4 (mục §12 "hoãn có chủ đích"): nhánh NỐI LIỀN, mỗi cạnh hành lang vẽ
>   đúng một lần.** Vẽ mỗi nhánh một polyline riêng thì đoạn trục chung nằm chồng N lớp và
>   `XBOSS_BOCKL` bóc gấp N lần chiều dài thật — sai thẳng vào khối lượng. Nhánh chạm cạnh đã có
>   tuyến thì dừng tại đúng nút đó, ra hình "một trục chính + các nhánh đấu vào".
> - **CÒN NỢ — CHẶN phát hành rộng:** chưa verify tay trên AutoCAD 2026 thật (mục `C10` của
>   `plugin-autocad/VERIFY-VA-PHAT-HANH.md` — AC1/AC3/AC6/AC8/AC10–AC13 trên một tầng thật của
>   AVIO). Toàn bộ mã Adapter M114 mới chỉ được biên dịch bằng stub `XBoss.Cad.AcadShim`.

## Đặc tả ĐÃ DUYỆT — đợt "tự động triển khai bản vẽ từ sơ đồ nguyên lý MEPF" (viết + duyệt 2026-08-30)

> Sinh từ phiên nghiên cứu 2026-08-30: khảo sát thị trường tool auto-routing MEP có AI (Augmenta,
> FireDesign.ai, MagiCAD, eVolve/SysQue, Firmus…) đối chiếu nền tảng M99→M114. **Hướng đi người
> dùng chốt 2026-08-30:** kỹ sư vẽ line/pline tuyến tim từ nguồn tới thiết bị (kèm thuộc tính,
> cao độ khi cần) — plugin tự hoàn thiện bản vẽ (nét đôi, tê/nhánh, co/cút, chia đốt, giá đỡ, lỗ
> chờ, ngắt nét, tag, thống kê); **tích hợp thẳng vào plugin AutoCAD**, không tool rời; nguyên
> tắc bất biến: _AI hiểu ngữ nghĩa, thuật toán vẽ hình học_ — LLM không bao giờ sinh tọa độ.
> Đợt này ĐÓNG nốt 2 hướng "chưa có đặc tả" ghi ở cuối mục M99→M102 phía trên (đồ thị kết nối
> tuyến–thiết bị → M115; combined services → M116) + thêm mảnh AI schematic (M117).
>
> **`M115-hoan-thien-ban-ve-tu-tuyen-tim.md`** — lõi của hướng đã chốt: `XBOSS_TUYEN_GAN` (gán
> thuộc tính hệ/size/cao độ vào XData), `XBOSS_TUYEN_DOTHI` (dựng đồ thị tuyến–thiết bị từ
> line/pline: gộp nút, suy tê/co/cút/giảm, kiểm hở/thiếu size, kỹ sư duyệt), `XBOSS_HOANTHIEN`
> (điều phối 8 giai đoạn chạy chuỗi lệnh `XBOSS_VE_*` sẵn có trên cả cụm tuyến, idempotent, không
> bao giờ đụng tọa độ tuyến gốc). Rule pack +1 version `completionPolicy` mặc định TẮT; không
> migration, không API mới. 4 PR. **Thi hành ĐẦU TIÊN của đợt.**
> **State: ✅ CODE XONG cả 4 PR (2026-08-30)** — rule pack `v16` + `Core/Graph/` (PR1),
> `XBOSS_TUYEN_GAN`/`XBOSS_TUYEN_DOTHI` (PR2), `XBOSS_HOANTHIEN` (PR3), tài liệu +
> `VERIFY-VA-PHAT-HANH.md` mục C11 (PR4). **CÒN NỢ — CHẶN phát hành rộng:** chưa verify tay trên
> AutoCAD 2026 thật (mục `C11` của `plugin-autocad/VERIFY-VA-PHAT-HANH.md`, 10 mục 99–108) — xếp
> hàng sau khi trả nợ verify tay các đợt trước (M111 §C9, M114 §C10) rồi mới tới lượt M115.
> **`M116-phoi-hop-xung-dot-lien-he.md`** — combined services 2D: `XBOSS_PHOIHOP` quét 3 lớp
> (giao cắt cùng dải cao độ, tranh chấp hành lang, khoảng cách quy phạm giữa cặp hệ) trên tuyến
> mang XData M115 kể cả qua xref; **chỉ phát hiện + đề xuất theo `coordinationPolicy`, kỹ sư
> quyết** (ngã rẽ chốt 2026-08-28), marker layer riêng, báo cáo Excel + web. 3 PR. Sau M115.
> **State: 🚧 PR1 CODE XONG (2026-08-30)** — rule pack `v17` khối `drawTools.coordinationPolicy`
> (mặc định TẮT, bảng ưu tiên THAM CHIẾU `crossingPolicy.priority`) + validator 2 tầng (TS + C#) +
> `Core/Coordination/` thuần (`QuetXungDot` 3 lớp kiểm, `XungDotId`, `DeXuatXuLy`), test xunit +
> node:test trên CI Linux. **Còn PR2** (3 lệnh Adapter + hộp thoại + marker/XData) **và PR3** (báo
> cáo Excel + hiển thị web + tài liệu + mục verify).
> **`M117-ai-doc-so-do-nguyen-ly.md`** — mảnh cuối: upload DXF schematic lên web → tầng 1 luật
> dựng graph, tầng 2 AI ngữ nghĩa bù phần `chua_quyet` (hợp đồng y hệt M108 qua `lib/nen/ai.ts`,
> tắt được bằng `XBOSS_AI_BLOCK_CLASSIFY=0`), người duyệt graph trên web → plugin
> `XBOSS_TUYEN_GOIY` ánh xạ thiết bị + sinh tuyến tim NHÁP bằng routing M114 → nhận vào quy trình
> M115. Có migration `cad_schematic_graphs` (RLS project) + 4 API. 4 PR. **Điều kiện kích hoạt:
> M115 verify + pilot ổn — không kéo lên trước.**
>
> **Thứ tự thi hành đợt: M115 → M116 → M117.** Cổng chung: trả nợ verify tay AutoCAD 2026 các đợt
> trước (M111 đang chặn) trước khi phát hành rộng bất kỳ mục nào.

## Đặc tả chờ triển khai — đợt Scale/SaaS/BI + bổ sung (M53–M59 viết 07/2026, M61 viết 2026-07-18, M62–M63 viết 2026-07-19)

> **M62 (`M62-rls-khoa-cua.md`)** — đóng nốt RLS: `withProjectScope` đọc-ghi + bọc 3 route còn lại (`notifications`, `payments/bills`, `payments/floors`) rồi migration "khoá cửa" bỏ nhánh thiếu-ngữ-cảnh (2 PR, `route: spec`; PR2 có điều kiện tiên quyết vận hành). **Đã xong hoàn toàn 2026-07-20** — PR1 (nhánh `claude/plan-m62-m63-7osrkh`, 2026-07-19) và PR2 (`migrations/0077_rls_lock.sql`, PR #300) đều đã merge `main`; người dùng xác nhận cả 2 điều kiện tiên quyết vận hành đủ trước khi merge PR2. Xem `PROGRESS.md`. **M63 (`M63-webhook-ssrf-dns-pinning.md`)** — chống SSRF DNS rebinding cho webhook: resolve + pin IP qua undici `connect.lookup`, mở rộng `isPrivateIp` (1 PR, `route: spec`). **Đã xong 2026-07-19** (nhánh `claude/plan-m62-m63-7osrkh`). Cả 2 sinh từ đợt đánh giá chi tiết lần 8 (`PROGRESS.md`).

Từ phân tích so XBoss với ERP chuyên nghiệp (`PROGRESS.md`). **Thứ tự thi hành đã chốt (cập nhật 2026-07-18, rà lại code thật sau khi merge #252):**

1. ~~**M53 (4 PR) song song M57 PR1**~~ → **cả 4 PR của M53 + PR1 của M57 đã xong** (PR1-3 2026-07-18 merge `main` qua PR #252, commit `cefda6a`; **PR4 xong 2026-07-18 tiếp theo, nhánh `claude/plan-md-30cmcp`** — audit state in-process + `DEPLOY.md` mục "Chạy nhiều instance", xem `PROGRESS.md`).
2. ~~**M56 PR2** — bắt buộc 2FA theo vai trò~~ → **đã xong** (2026-07-18, nhánh `claude/feat-m56-pr2-bat-buoc-2fa`, KHÔNG migration — dùng `code_lists`; chặn ở `proxy.ts` Node Middleware, cờ `mustSetup2fa` trong token 5 phần).
3. ~~**M61** — override quyền theo dự án~~ → **đã xong** (2026-07-18, PR1 #248 + PR2 #249, đã merge vào `main`).
4. ~~**M51 (GĐ0 của M54)** — RLS theo dự án + `organizations`~~ → **đã xong hoàn toàn** (2026-07-18, PR #256; khoá cửa M62 PR2 xong 2026-07-20, PR #300, đã merge vào `main`).
5. ~~**M55** — BI/Metabase~~ → **đã xong** (PR #270, đã merge vào `main`).
6. ~~**M58 PR3** — wire ảnh/nhật ký vào khung offline queue~~ → **đã xong** (2026-07-19, nhánh `claude/feat-m58-pr3-wire-offline`, PR #284 — `0075_task_photos_hash.sql` dedup ảnh 24h, wire `TrackingGrid` PhotosModal + `DiaryEditorModal`).
7. **M54 GĐ1** — multi-tenant SaaS (phụ thuộc cứng M51). **PR1 (trục `org_id`) đã xong** 2026-07-21 (nhánh `claude/feat-m54-gd1-pr1-org-axis`, `migrations/0078_org_axis.sql`, xem `PROGRESS.md`); **PR2 (session mang orgId) đã xong** 2026-07-23; **PR3 (RLS theo org) đã xong** 2026-07-23 (`migrations/0080_org_rls.sql`); **PR4 (object storage `lib/nen/storage.ts`) đã xong** 2026-07-23. **Giai đoạn 1 hoàn tất** — còn lại: khoá cửa RLS org (chờ theo dõi production) và chạy thật script di trú `data/uploads/` khi có MinIO/S3 production (xem `PROGRESS.md`).
8. ~~**M59** — histogram tài nguyên~~ → **đã xong** (PR #285, đã merge vào `main`).

M57 PR2 (extract text PDF) — đã làm 2026-07-18 (xem bảng dưới), KHÔNG nằm trong hàng đợi thứ tự trên (độc lập với M55/M58/M54/M59).

**LUẬT trước khi thi hành bất kỳ hạng mục nào:** kiểm tra trên code thật xem hạng mục đã được làm chưa (grep điểm chạm chính trong đặc tả: migration/bảng, hàm `lib/*`, route API, trang UI) — trạng thái trong bảng trên có thể lỗi thời so với code (đã xảy ra 2026-07-17 VÀ lại 2026-07-18: README vẫn ghi M53/M57 PR1 "chưa" dù đã merge từ trước — luôn grep lại, đừng tin bảng trạng thái). Đã có rồi → cập nhật bảng này + `PROGRESS.md`, không code lại.

**LUẬT số migration (bài học 2026-07-18):** trước khi giao/code bất kỳ migration mới nào, chạy `ls migrations | sort -V | tail -3` để lấy số thật mới nhất — không suy đoán/copy số từ đặc tả hay kế hoạch cũ. PR #265 và PR #266 (2 phiên chạy song song) cùng chọn số `0071` cho 2 migration khác nhau vì không đồng bộ `main` ngay trước lúc code → chặn CI mọi PR (`check-migration-numbers.ts`) đến khi vá bằng PR #269 (đổi `0071_material_tx_idempotency.sql` → `0072_material_tx_idempotency.sql`). Số migration tiếp theo cần dùng tại thời điểm cập nhật mục này: **`0076`** (max hiện tại `0075_task_photos_hash.sql` của M58 PR3) — luôn xác nhận lại bằng lệnh trên, không tin số ghi trong tài liệu.

| File                                      | Hạng mục                                                                                        | Trạng thái                                             | Ghi chú                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M53-scale-headroom.md`                   | Đo tải → watermark SSE O(1) thay aggregate JOIN 3s/client, pool env, audit cluster-ready        | ✅ xong cả 4 PR                                        | PR1-3 merge #252 (`cefda6a`, 2026-07-18); PR4 xong 2026-07-18 (`lib/ha-tang/sync-locks.ts`, TTL `lib/ha-tang/code-lists.ts`/`lib/ha-tang/feature-flags.ts`, `DEPLOY.md`)                                                                                                                                                                                                                                                                                                   |
| `M56-2fa-totp.md`                         | TOTP RFC 6238 + recovery codes; PR2 bắt buộc theo vai trò                                       | ✅ xong cả 2 PR                                        | PR1 `0065_totp.sql`; PR2 (nhánh `claude/feat-m56-pr2-bat-buoc-2fa`) KHÔNG migration — cờ `mustSetup2fa` trong token phiên 5 phần, chặn ở `proxy.ts` (Node Middleware) 403 mọi API trừ `/api/auth/*`; domain `require_2fa_roles` trong `code_lists`                                                                                                                                                                                                                         |
| `M61-phan-quyen-theo-du-an.md`            | Override quyền theo dự án (`role_permissions.project_id`, đóng nợ M52 PR4 module `permissions`) | ✅ xong                                                | `0066_role_permissions_project.sql`, `lib/bao-mat/permissions.ts`/`lib/bao-mat/auth.ts`, UI `/admin/permissions` + export snapshot (PR2)                                                                                                                                                                                                                                                                                                                                   |
| `M51-da-du-an-rls.md`                     | RLS theo dự án + `organizations` (GĐ0 của M54)                                                  | ✅ xong (PR #256 + khoá cửa M62 PR2, #300, 2026-07-20) | Xem `PROGRESS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `M55-bi-metabase.md`                      | Schema `bi` (view whitelist cột) + role `xboss_bi` chỉ-đọc cho Metabase                         | ✅ xong (PR #270, đã merge)                            | 18 view + role riêng chỉ-đọc, test bất biến cột-cấm, vận hành `docs/ops/metabase.md`, migration `0073`                                                                                                                                                                                                                                                                                                                                                                     |
| `M57-tim-kiem-toan-van.md`                | FTS GIN index + `unaccent` (thay ILIKE inline hiện tại)                                         | ✅ PR1+PR2 xong                                        | PR1: merge #252 (`cefda6a`, 2026-07-18) — `lib/tien-do/search.ts`, `migrations/0068_fts.sql`. PR2 (2026-07-18, nhánh `claude/feat-m57-pr2-extract-pdf`): `lib/nen/pdf-extract.ts` (pdf-parse, 10 trang đầu + timeout 5s), `migrations/0071_extracted_text.sql` (cột `extracted_text` trên `task_documents`/`contract_documents`/`project_documents` + index GIN cho `project_documents` — 2 bảng còn lại chưa có nguồn search tương ứng trong registry, xem `PROGRESS.md`) |
| `M58-qr-offline-hien-truong.md`           | QR tem in `/r/<kind>/<id>` + offline queue IndexedDB ảnh/nhật ký                                | ✅ xong cả 3 PR (PR3: PR #284, đã merge)               | PR1: resolve `/r/[kind]/[id]` + tem in. PR2: `app/components/offlineQueue/` (logic/store/image + hook + badge AppHeader), di trú êm từ localStorage, quota ảnh 50MB, Background Sync. PR3: dedup ảnh `0075_task_photos_hash.sql` (sha256 24h), wire `TrackingGrid` PhotosModal (badge "Chờ gửi") + `DiaryEditorModal` (full-replace body, dedup theo ngày, banner nháp offline, discard nháp khi lưu online thành công)                                                    |
| `M54-multi-tenant-saas.md`                | Trục `org_id` + RLS org + object storage uploads (GĐ1)                                          | ✅ GĐ1 xong cả 4 PR (2026-07-23)                       | PR1 `migrations/0078_org_axis.sql` (trục org_id); PR2 (session mang orgId); PR3 `migrations/0080_org_rls.sql` (RLS theo org, transitional); PR4 `lib/nen/storage.ts` (local disk mặc định, S3-compatible khi có env). Còn lại: khoá cửa RLS (theo dõi production), chạy thật script di trú S3. Phụ thuộc cứng M51                                                                                                                                                          |
| `M59-tai-nguyen.md`                       | Histogram nhân lực/thiết bị kế hoạch-vs-thực-tế, cảnh báo gán chồng                             | ✅ xong (PR #285, đã merge)                            | Không migration, chỉ tổng hợp — `lib/vat-tu/resources.ts`, `GET /api/resources`; trang `/resources` **không còn tồn tại** — UI nay là mục "Tải Nhân Lực" trong `/site?tab=tasks-diary&sub=resources` (`app/site/_components/TasksDiaryTab.tsx`, khai ở `lib/nen/modules.ts`)                                                                                                                                                                                               |
| `M64-upload-ke-hoach-tracking-theo-he.md` | Upload kế hoạch & tracking theo hệ (Excel)                                                      | ✅ xong                                                | `migrations/0082_system_uploads.sql` (0082), `lib/tien-do/system-upload.ts`, `app/components/SystemUploadPanel.tsx`, `tests/system-upload.test.ts`                                                                                                                                                                                                                                                                                                                         |

## Hoãn có chủ đích (không tự nhặt lại — xem `PROGRESS.md`)

- `M60-nang-major-deps.md` — nâng TS 7 / ESLint 10 / Node 26, chờ điều kiện kích hoạt từng PR.
- M49 PR3 SSO OIDC — merge ở trạng thái flag tắt, chờ xác minh tay end-to-end với IdP thật.

## Quy ước chung (áp cho MỌI module — không lặp lại trong từng file)

### Backend

- **Migration**: mỗi module 1+ file `migrations/000N_<ten>.sql` append-only, idempotent (`IF NOT EXISTS`); chạy `npm run gen:erd` cùng PR (ERD sinh tự động, CI kiểm khớp schema). Không sửa file migration đã áp production (ADR-0003).
- **API route** (pattern chuẩn `app/api/dashboard/route.ts`): `export const dynamic = "force-dynamic"`; `getCurrentUser()` → 401 khi chưa đăng nhập → check quyền qua `CAN`/`canTouchTask`/`canTouchPackage` → 403; validate input bằng zod (xem `lib/nen/env.ts` style) hoặc check thủ công → 422; SQL qua helper `lib/db` placeholder `?`, không nối chuỗi.
- **Quyền**: 7 vai trò (`lib/nen/roles.ts`): `admin | pm | engineer | subcon` (thao tác) + `bch | cdt | viewer` (chỉ xem — `VIEW_ONLY_ROLES`). Thêm quyền mới = thêm hàm vào map `CAN` (`lib/bao-mat/auth.ts`, khai mặc định ở `CAN_DEFAULT` rồi bọc override theo dự án), không check role rải rác.
- **Thao tác ghi nhiều bước**: bọc `withTransaction` + `SELECT ... FOR UPDATE` (pattern `POST /api/tasks/:id/approve`).
- **Upload file**: theo pattern `task_documents`/`lib/nen/photos.ts` — server sinh tên file, whitelist mime, giới hạn dung lượng, ghi/đọc qua `lib/nen/storage.ts` (đĩa cục bộ `data/uploads/` mặc định, MinIO/S3 khi có đủ biến `S3_*`), route GET stream có check quyền.
- **Notification**: thêm loại mới vào cơ chế đồng bộ on-fetch của `/api/notifications` (dedup + tự dọn khi hết điều kiện — xem `material_over`); gửi push qua `lib/van-hanh/push.ts` (no-op khi thiếu VAPID).
- **Audit**: thao tác nghiệp vụ quan trọng ghi lịch sử (pattern `task_history`/`assignment_log`).

### Test

- File test import `tests/setup.ts` **đầu tiên**; logic thuần → unit test; chạm DB → integration với `TEST_DATABASE_URL` (tự skip khi thiếu, pattern `tests/recompute.test.ts`). Không phải khai tên file ở đâu cả — `npm test` (`scripts/run-tests.mjs`) tự quét mọi `tests/*.test.ts` và chạy từng file trong một process riêng; ca bị skip mà không có lý do trong `scripts/test-skip-allowlist.json` sẽ làm đỏ cổng `npm test -- --release-gate` của CI.

### UI/UX (nền tảng trải nghiệm — mọi trang mới PHẢI theo)

- **Theme**: dark-first, thang `zinc`, accent `-300/-400`, KHÔNG `dark:`/hex (cơ chế đảo màu `html.light` trong `app/globals.css`); màu trạng thái đồng bộ `lib/tien-do/status.ts`. Body-text tĩnh không dùng `text-zinc-500/600` (WCAG — xem `docs/audit.md` §13).
- **Vỏ thẻ & bo góc (chuẩn hoá)**: base thẻ `bg-zinc-900 border border-zinc-800 rounded-xl`; padding theo tier — stat tile dày `p-3`, thẻ nội dung `p-4`, panel cấp trang/section lớn/hero `p-5` (không dùng `p-6`). Bo góc: `rounded-lg` cho control/nút/input/select, `rounded-xl` cho thẻ + cụm segment/tab-bar, `rounded-full` cho pill/badge/avatar.
- **Nút danger (chuẩn hoá, 2 mẫu — không tạo biến thể thứ 3)**: đặc (nút text, hành động phá huỷ rõ ràng như "Xoá"/"Từ chối", mẫu tham chiếu: biến thể `danger` của `app/components/ui/Button.tsx`) dùng `bg-red-700 hover:bg-red-600 text-on-accent`; ghost (icon-only trong hàng bảng/toolbar/modal phụ) dùng `text-zinc-500 hover:text-red-300 hover:bg-red-950/40`. Chọn mẫu theo ngữ cảnh: CTA độc lập/rõ ràng → đặc; icon nhỏ lẫn trong hàng/toolbar → ghost.
- **Thang typography (chuẩn hoá, M37 PR2.1)**: dùng đúng recipe Tailwind theo vai trò, không tạo class CSS mới.

  | Vai trò            | Recipe                                                         | Ghi chú                                               |
  | ------------------ | -------------------------------------------------------------- | ----------------------------------------------------- |
  | Tiêu đề trang (h1) | `text-lg font-semibold text-zinc-50`                           | chỉ nâng tiêu đề trang cấp cao nhất                   |
  | Tiêu đề mục (h2)   | `text-base font-semibold text-zinc-100`                        | chỉ áp cho header section-level                       |
  | Tiêu đề thẻ (h3)   | `text-sm font-semibold`                                        | giữ nguyên                                            |
  | Eyebrow/kicker     | `text-xs font-semibold uppercase tracking-wider text-zinc-400` | chuẩn `tracking-wider` (không dùng `tracking-widest`) |
  | Body/ô bảng        | `text-sm`                                                      | giữ nguyên                                            |
  | Phụ/caption        | `text-xs text-zinc-400`                                        | giữ nguyên                                            |
  | Micro              | `text-[11px]`                                                  | giữ nguyên                                            |
  | Số liệu lớn (stat) | `text-2xl/3xl/4xl font-bold`                                   | giữ nguyên                                            |

- **Component tái dùng**: `Skeleton` (loading — khối cỡ thẻ dùng `rounded-xl` khớp thẻ thật), `StatusBadge` (chip trạng thái task, gom `STATUS_CLS`+nhãn), `dialogs.tsx` (modal xác nhận), `EditableText`, `SpreadsheetGrid` (lưới), icon `lucide-react`, chart `recharts`. Tạo component mới chỉ khi không có sẵn.
- **Trạng thái bắt buộc mỗi trang**: loading skeleton (không màn trắng) → rỗng (thông điệp tiếng Việt + nút hành động tạo mới) → lỗi (thông điệp + nút thử lại) → có dữ liệu. Mọi `fetch` ghi dữ liệu bọc `try/catch` + toast/thông báo lỗi + nút không kẹt "Đang lưu..." (bài học audit 2026-07).
- **Bảng dữ liệu dày**: header sticky, cuộn ngang trong container riêng, cột mã/tên ghim trái khi cần; sort/filter phía client cho <1k dòng.
- **Form**: label rõ, validate hiển thị theo field, submit disable khi đang gửi, Enter submit được; ngày dùng `<input type="date">` (khớp chuỗi `YYYY-MM-DD` của lớp DB).
- **Mobile công trường**: vùng chạm ≥40px, thao tác chính với được bằng ngón cái, form quan trọng hoạt động khi offline nếu thuộc luồng đã có offline queue.
- **A11y**: nút icon-only có `aria-label` tiếng Việt; select có tên; focus ring rõ; không truyền tin chỉ bằng màu. Trang mới thêm `e2e/authed/<trang>.spec.ts` chạy axe (desktop + mobile) theo pattern sẵn có.
- **Điều hướng**: trang mới thêm mục vào sidebar (M0) đúng nhóm nghiệp vụ + title/breadcrumb topbar; route động nhớ đăng ký loại trừ cache trong `public/sw.js` nếu cần (tăng version `CACHE`).
- **Module registry (M52 PR3)**: module mới **bắt buộc** thêm 1 entry vào `MODULES` (`lib/nen/modules.ts`) khai báo mọi điểm chạm xuyên suốt (nav sidebar, `permKeys`, `notificationTypes`, `swExclude`, `routePrefix`) — nguồn tra cứu tập trung thay cho việc sửa rời rạc ≥4 nơi. Khai `swExclude` phải khớp `public/sw.js` (cổng CI `scripts/check-sw-exclude.ts` kiểm).

### Quy trình mỗi PR

Theo `CLAUDE.md` (DoD): lint + typecheck + test + build xanh → tự review diff → commit tiếng Việt conventional → push → PR draft. Mỗi module chia PR như mục "Chia PR" trong file đặc tả; cập nhật `PROGRESS.md` khi xong module.
