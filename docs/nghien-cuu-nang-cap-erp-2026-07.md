# Nghiên cứu nâng cấp XBoss lên tầm ERP xây dựng chuyên nghiệp (07/2026)

Nghiên cứu sâu 9 trục nâng cấp, đối chiếu hiện trạng code thật (48 migration, ~107 nhóm route API, ~70 module `lib/*`) với chuẩn ERP xây dựng chuyên nghiệp (Procore, Oracle Aconex/P6, SAP EC&O, RIB iTWO; trong nước: FastCons, BRAVO, MISA AMIS) và bối cảnh pháp lý Việt Nam hiện hành.

Mỗi trục theo khung: **Hiện trạng** (bám code, có đường dẫn file) → **Khoảng cách** → **Đề xuất** (schema/điểm chạm/chia PR). Cuối tài liệu là lộ trình ưu tiên P0→P3.

**3 phát hiện nền tảng** (làm thay đổi tính khả thi của nhiều đề xuất):

1. `lib/db/index.ts` đã có `withTransaction` bọc mọi `query/run/insertId` qua `AsyncLocalStorage` → có thể `SET LOCAL app.user_id / app.project_id` đầu transaction **ngay hôm nay** mà không đổi kiến trúc. Đây là chìa khoá cho cả audit trigger (trục 4) lẫn RLS (trục 7).
2. XBoss **đã có CPM engine thật** (`lib/cpm.ts` — forward/backward pass, total float, đường găng; `lib/schedule-control.ts`, `/api/gantt`, `package-dependencies`) — trưởng thành hơn mức "tracking checkbox". Nền cho EVM (trục 5) đã sẵn ~70%.
3. Tiền đã dùng `NUMERIC(15,2)` đúng chuẩn (migration `0037_finance.sql`), **nhưng** type parser oid 1700 chuyển NUMERIC → `parseFloat` (`lib/db/index.ts:13`) — mọi phép cộng dồn tiền chạy trên float JS. VND không có số lẻ nên sai số hiện chưa lộ, song là bom nổ chậm khi tính VAT/tỷ lệ giữ lại/quy đổi.

---

## 1. Mô hình dữ liệu

### Hiện trạng

- WBS `Project → Tower → SheetType → WorkPackage → Task → ProgressDimension`; 48 migration append-only (ADR-0003); BOQCODE unique toàn hệ qua bảng `boq_codes` + trigger DB (`0029`); ngày lưu chuỗi `'YYYY-MM-DD'` (nhất quán, tốt).
- Phạm vi bảng đã phủ: tender → contracts → VO → payment_certs → finance → warranty → claims → HSE → HR → environment → handover (migration 0012–0042).
- Có phụ thuộc công việc (`package-dependencies`, FS) nuôi CPM.

### Khoảng cách với ERP

| Vấn đề | ERP chuyên nghiệp |
| --- | --- |
| Danh mục (lý do trễ, đơn vị, loại tài liệu…) hard-code trong `lib/*.ts` | Danh mục cấu hình được, Admin sửa không cần deploy |
| Không có master-data dùng chung giữa dự án (NCC, catalog vật tư, cost code) | Master-data tập trung, mã hoá thống nhất (CSI/Uniformat) |
| `docs/ERD.md` cập nhật tay, đã ghi nợ trôi schema | Từ điển dữ liệu sinh tự động từ DB |
| Xoá là xoá thật (trừ vài bảng `*_history`) | Soft-delete/temporal cho thực thể hợp đồng-tài chính |
| NUMERIC → float JS khi ra khỏi DB | Tiền tính toàn trình bằng số chính xác |
| Ít `CHECK` ràng buộc miền giá trị | `%∈[0,1]`, `qty≥0`, enum bằng CHECK |

### Đề xuất

1. **ERD tự sinh** — `scripts/gen-erd.ts` đọc `information_schema` → sinh `docs/ERD.md` (bảng, cột, FK, index); thêm bước CI so khớp để chặn trôi. *Quick win, 1 PR nhỏ.*
2. **`code_lists` danh mục mềm**: `code_lists(id, domain, code, label, sort, active, meta jsonb, UNIQUE(domain, code))`. Chuyển dần các enum-mềm (lý do trễ, loại tài liệu, nhóm chi phí) sang bảng này, giữ enum cứng cho status có logic (`lib/status.ts`). API `/api/admin/code-lists` (Admin), cache in-memory + version.
3. **Cost code chuẩn** làm chiều phân tích xuyên suốt BOQ ↔ chi phí ↔ hợp đồng ↔ vật tư: bảng `cost_codes(code, name, parent_code, level)` (cây), cột `cost_code` trên `costs`, `boq_norms`, `purchase_orders`. Đây là xương sống cho BI trục 5.
4. **Tiền chính xác**: giữ NUMERIC ở DB; sửa parser oid 1700 chỉ parse float cho cột thống kê, còn tiền trả về string + helper `money.ts` (cộng/nhân bằng số nguyên đồng). Tối thiểu: quy ước "mọi phép cộng tiền làm trong SQL (`SUM`), JS chỉ hiển thị" + lint rule.
5. **Soft-delete chọn lọc**: cột `deleted_at` cho `contracts`, `variations`, `payment_certs`, `invoices` (khôi phục được, audit đủ); các bảng tracking giữ hard-delete như cũ (khối lượng lớn).
6. **CHECK constraints** bổ sung qua 1 migration: `progress_percent BETWEEN 0 AND 1`, `amount >= 0`, các cột status có danh sách giá trị.

---

## 2. Workflow / Phê duyệt

### Hiện trạng

Mọi gate hard-code từng route: nghiệm thu 2 bước (`/api/tasks/:id/approve` + `CAN.approve`), gate QA/QC (`requiredInspectionMissing`), hold-point bàn giao (`handoverBlocked`), duyệt VO/IPC/proposal mỗi nơi tự check quyền. Không có bảng mô tả quy trình — thêm 1 luồng duyệt mới = viết code mới.

### Khoảng cách

ERP có **engine phê duyệt cấu hình được**: chuỗi nhiều cấp, ngưỡng theo giá trị (VO < 50tr PM duyệt, ≥ 50tr cần CĐT), uỷ quyền khi vắng, SLA + leo thang, và một chỗ duy nhất trả lời "cái này đang chờ ai".

### Đề xuất — Approval Engine tối giản

```sql
CREATE TABLE approval_flows (
  id SERIAL PRIMARY KEY, project_id INT REFERENCES projects(id),
  entity_type TEXT NOT NULL,          -- 'variation' | 'payment_cert' | 'proposal' | 'task_acceptance'
  name TEXT NOT NULL, active BOOLEAN DEFAULT TRUE
);
CREATE TABLE approval_steps (
  id SERIAL PRIMARY KEY, flow_id INT NOT NULL REFERENCES approval_flows(id) ON DELETE CASCADE,
  seq INT NOT NULL, role TEXT NOT NULL,           -- vai trò được duyệt bước này
  min_amount NUMERIC(15,2),                       -- NULL = mọi giá trị; bước chỉ kích hoạt khi số tiền ≥ ngưỡng
  sla_days INT, UNIQUE(flow_id, seq)
);
CREATE TABLE approval_requests (
  id SERIAL PRIMARY KEY, flow_id INT NOT NULL REFERENCES approval_flows(id),
  entity_type TEXT NOT NULL, entity_id INT NOT NULL,
  project_id INT NOT NULL, amount NUMERIC(15,2),
  current_seq INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected | cancelled
  created_by INT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id)                  -- 1 thực thể 1 request sống
);
CREATE TABLE approval_actions (
  id SERIAL PRIMARY KEY, request_id INT NOT NULL REFERENCES approval_requests(id),
  step_seq INT NOT NULL, actor_id INT NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL,                         -- approve | reject | delegate
  note TEXT, at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(request_id, step_seq)                    -- idempotent: chống bấm duyệt 2 lần
);
```

- Helper `lib/approvals.ts`: `openApproval(entityType, id, amount)` chọn flow + bỏ qua step có `min_amount` > amount; `advanceApproval(entityType, id, user, decision, note)` kiểm role + **SoD: reject nếu `actor_id = created_by`** → ghi action → chuyển bước/chốt.
- **Không đập gate cũ**: route VO/IPC/nghiệm thu gọi engine thay cho check `CAN.approve` tại chỗ, còn logic nghiệp vụ (100% mới nghiệm thu, hold-point) giữ nguyên. Fallback: entity không có flow active → hành xử như hiện tại (1 bước, `CAN.approve`).
- Trang `/approvals` mở rộng thành hộp thư "chờ tôi duyệt" hợp nhất mọi entity_type; nhắc SLA qua hạ tầng notification sẵn có.
- Chia PR: (1) schema + `lib/approvals.ts` + test thuần; (2) áp cho VO + IPC; (3) áp nghiệm thu lô + UI hộp thư duyệt; (4) UI Admin cấu hình flow.

---

## 3. Phân quyền

### Hiện trạng

RBAC 7 vai trò, quyền tập trung map `CAN` trong `lib/auth.ts` (một nguồn sự thật — nền rất tốt); quyền sở hữu qua `canTouchTask/Package/…`; API là ranh giới duy nhất.

### Khoảng cách

- Vai trò cứng: thêm/tinh chỉnh = sửa code + deploy.
- Không phân quyền theo **trường** (giá VO, margin) hay **hạn mức** (duyệt chi ≤ X).
- Không có **phân tách nhiệm vụ (SoD)** cưỡng bức ở tầng dữ liệu.
- Không audit được "ai có quyền gì tại thời điểm T".

### Đề xuất (giữ `CAN` làm mặc định, mở đường cấu hình)

1. **Dữ liệu-hoá quyền**: `role_permissions(role TEXT, perm_key TEXT, allowed BOOLEAN, PRIMARY KEY(role, perm_key))` — chỉ chứa **override** so với map `CAN` mặc định. `can(user, 'approve')` tra cache DB trước, fallback map cứng. Không phá gì, thêm dần UI Admin.
2. **Quyền theo trường**: khai báo tập "trường nhạy cảm" per entity trong `lib/sensitive-fields.ts` (vd `variation.amount`, `contract.value`) + perm_key `view_financials`; API strip trước khi trả (đúng nguyên tắc `docs/audit.md` §3 — không dựa client ẩn).
3. **Hạn mức duyệt**: đã nằm trong Approval Engine (`min_amount` per step) — không cần cơ chế riêng.
4. **SoD**: ràng buộc trong engine (mục 2) + report "xung đột vai trò" (ai vừa tạo vừa duyệt trong 90 ngày) cho kiểm toán.
5. **SSO (OIDC)** đồng bộ vai trò từ hệ thống công ty — xem trục 6.

---

## 4. Audit / Tuân thủ

### Hiện trạng

Audit **rời rạc theo domain**: `task_history`, `material_transactions`, `po_status_history`, `work_front_history`, `diary_lock_history`, `assignment_log`, `cash_transactions`. Không có audit thống nhất, không immutable, không chữ ký số.

### Bối cảnh pháp lý VN (đối chiếu 07/2026)

- Biên bản nghiệm thu phải có chữ ký của người đại diện hợp pháp CĐT — thiếu là **vô giá trị pháp lý** (Nghị định 06/2021/NĐ-CP, sửa đổi bởi 35/2023/NĐ-CP). Muốn hồ sơ nghiệm thu điện tử trong XBoss có giá trị thay bản giấy thì cần chữ ký số hợp lệ theo Luật Giao dịch điện tử 2023.
- Hoá đơn: Nghị định 70/2025/NĐ-CP (hiệu lực 01/6/2025) sửa 40/61 điều của NĐ 123/2020 — siết truyền dữ liệu HĐĐT về cơ quan thuế, đổi quy tắc điều chỉnh/thay thế hoá đơn sai. Module `invoices` hiện tại chỉ lưu hồ sơ nội bộ — muốn "chính thức" phải nối nhà cung cấp HĐĐT (trục 6).

### Đề xuất — Audit trail toàn hệ (P0)

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id INT, actor_role TEXT,
  entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
  action TEXT NOT NULL,                 -- INSERT | UPDATE | DELETE
  changes JSONB,                        -- {field: [old, new]} — chỉ cột đổi
  project_id INT, request_id TEXT, ip TEXT
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_at ON audit_log(at);
```

- **Trigger generic** (1 hàm plpgsql dùng `to_jsonb(OLD)`/`to_jsonb(NEW)`, gắn lên nhóm bảng tài chính/hợp đồng/nghiệm thu: `contracts`, `variations`, `payment_certs`, `invoices`, `cash_transactions`, `advances`, `task_documents`…). Actor đọc từ `current_setting('app.user_id', true)`.
- **Điểm chạm duy nhất ở app**: trong `withTransaction` (`lib/db/index.ts`) chạy `SET LOCAL app.user_id = ?` ngay sau `BEGIN` (giá trị lấy từ AsyncLocalStorage phiên đăng nhập). Route ghi dữ liệu nhạy cảm vốn đã bọc transaction → phủ tự nhiên, **không sửa từng route**.
- **Immutable**: `REVOKE UPDATE, DELETE ON audit_log` với role app; nâng cấp sau bằng hash-chain (`row_hash = sha256(prev_hash || row)`) để chứng minh không sửa lùi.
- **Chữ ký số biên bản**: giai đoạn 1 — lưu SHA-256 của file biên bản vào `task_documents` + in mã hash lên bản PDF (chống tráo file); giai đoạn 2 — tích hợp ký số qua USB token/HSM của đơn vị (chuẩn PAdES) khi có nhu cầu pháp lý thật.
- Trang `/admin/audit`: lọc theo thực thể/người/khoảng ngày, xuất Excel/PDF phục vụ kiểm toán.
- Chia PR: (1) migration + trigger + `SET LOCAL` trong withTransaction + test tích hợp; (2) trang admin + export; (3) hash file biên bản.

---

## 5. Báo cáo / BI

### Hiện trạng

Dashboard KPI, S-curve (tái dựng từ `task_history`), `lib/dashboardext.ts` (cashflow, CPI, chất lượng, mua sắm), export Excel/PDF, báo cáo ngày/tuần email/Telegram. **Đã có CPM + baseline** — thiếu mỗi lớp EVM chuẩn. Mọi báo cáo cố định trong code.

### Đề xuất

1. **EVM đầy đủ (giá trị cao nhất, chi phí thấp)** — dữ liệu đã có đủ 3 chân:
   - PV: nội suy baseline (`baseline_tasks`) × trọng số giá trị BOQ/cost code;
   - EV: `progress_percent` hiện tại × trọng số;
   - AC: `costs`/`cash_transactions` theo cost code.
   → `lib/evm.ts` tính SPI/CPI/EAC/ETC cấp dự án + hệ; card trên Dashboard + tab trong `/report`. Đây là ngôn ngữ chuẩn khi báo cáo CĐT/tư vấn.
2. **Materialized views** cho độ đo nặng lặp lại (`mv_progress_by_system_week`, `mv_cost_by_code`), `REFRESH MATERIALIZED VIEW CONCURRENTLY` qua cron sẵn có — tách đọc-nặng khỏi bảng giao dịch.
3. **Report builder tối giản**: `saved_reports(id, owner_id, project_id, name, config jsonb)` — config = {nguồn view, filter, group by, cột}; 1 trang render bảng + export. Không OLAP, không kéo-thả phức tạp.
4. **Cảnh báo cấu hình được**: `alert_rules(metric, operator, threshold, channel, project_id)` thay ngưỡng hard-code trong `/api/notifications` (due_soon ≤3 ngày, progress <70%… thành dữ liệu).

---

## 6. Tích hợp

### Hiện trạng

Google Sheet 2 chiều (3-way merge, khoá `sync_locks` — pattern tốt), Telegram/email/Web Push, Sentry chờ DSN, BIM/camera embed. Không API công khai, không webhook, không SSO, không kế toán, không HĐĐT.

### Đề xuất (xếp theo giá trị pháp lý/vận hành)

1. **Kế toán qua API, không tự dựng sổ kép** — cách đóng khoảng cách "ERP tài chính" rẻ nhất: đẩy IPC/PO/invoice sang MISA/BRAVO, kéo trạng thái thanh toán về. Khung `lib/integrations/<provider>.ts` + bảng `sync_cursors(provider, entity, last_id, last_at)` — tái dùng pattern 3-way như material-sync.
2. **Hoá đơn điện tử** theo NĐ 70/2025: nối 1 nhà cung cấp HĐĐT (MISA meInvoice/Viettel/VNPT) — phát hành, điều chỉnh/thay thế đúng quy tắc mới, lưu link + XML về `invoices`.
3. **API keys + webhook ra ngoài**: `api_keys(key_hash, scope, project_id, active)` (đọc-only trước, Bearer); `webhooks(event, url, secret)` bắn sự kiện nghiệm thu/VO duyệt/IPC chốt (HMAC ký payload). Tái dùng hạ tầng notification.
4. **SSO OIDC** (Google Workspace/Microsoft Entra): đăng nhập + map claim → role; giữ đăng nhập mật khẩu làm fallback. Điểm chạm gọn: chỉ `lib/auth.ts` + route callback.
5. **Chuẩn hoá khung tích hợp**: mọi tích hợp có bảng cấu hình + trạng thái + retry + log thống nhất (hiện Google Sheet một kiểu, Telegram một kiểu).

---

## 7. Đa dự án

### Hiện trạng

`user_projects` + cookie `xboss_project` + `getCurrentProjectId(user)` (ADR-0004); 184/284 route đã scope; nợ scoping `notifications`/`costs` đã đóng (07/2026). Lịch sử từng lộ lỗi bỏ sót scope (`payment-certs`, `costs`) → scoping thủ công từng route là **lớp lỗi lặp lại có bằng chứng**.

### Đề xuất — lưới an toàn 2 tầng

1. **Tầng 1 (rẻ, làm ngay): test bất biến** — test tự động quét mọi route file trả danh sách/tài chính phải tham chiếu `getCurrentProjectId` hoặc nằm trong whitelist có chú thích lý do. Chặn hồi quy từ CI.
2. **Tầng 2: Postgres RLS làm phòng tuyến 2** (cần ADR mới):
   - `withTransaction` chạy `SET LOCAL app.project_id = ?`; policy mẫu:
     ```sql
     ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
     ALTER TABLE costs FORCE ROW LEVEL SECURITY;   -- bắt buộc: app connect bằng role owner sẽ bỏ qua policy nếu thiếu FORCE
     CREATE POLICY costs_project ON costs
       USING (project_id = current_setting('app.project_id', true)::int);
     ```
   - **Cạm bẫy đã được ngành xác nhận**: (a) thiếu `FORCE` + role owner → policy bị bỏ qua âm thầm; (b) role app không được có `BYPASSRLS`; (c) cần index `project_id` — planner đưa predicate của policy vào plan như WHERE thường nên index dùng được bình thường; (d) query ngoài transaction không có GUC → policy trả rỗng, nghĩa là **các route đọc phải đi qua wrapper đặt GUC** (bọc `withRequestContext` đặt `set_config` per request) — đây là phần việc chính, làm dần theo nhóm bảng tài chính trước.
3. **Cấp `organization` phía trên `project`** (đa pháp nhân, hợp nhất portfolio theo công ty) — chỉ khi có nhu cầu thật, thiết kế sẵn chỗ: thêm `org_id` vào `projects`, không đụng bảng con.
4. **Project template**: clone cấu hình (sheet, hệ, cost code, flow duyệt, nav) từ dự án mẫu khi tạo dự án mới — giảm chi phí onboarding, ăn khớp master-data (trục 1).

---

## 8. Kiến trúc & Mở rộng

### Hiện trạng

Monolith Next.js 16 App Router + raw SQL (ADR-0001 — giữ), ~284 route, CI đầy đủ, Lighthouse + axe gate. Nợ đã ghi: `app/tracking/[sheet]/page.tsx` ~3000 dòng. `nav_settings` bật/tắt UI nhưng logic vẫn cứng. Thêm module mới phải chạm nhiều nơi rời rạc (`lib/auth.ts`, `dashboardTree`, notifications) — từng gây race e2e menu "có chủ".

### Đề xuất

1. **Giữ monolith** — đúng ADR, chưa có áp lực scale ngang; đầu tư vào "cấu hình-hoá" thay vì chia nhỏ hạ tầng.
2. **Custom fields dữ liệu-hoá**: `custom_field_defs(entity_type, key, label, type, options jsonb, active)` + cột `custom jsonb` trên `tasks`/`contracts`/`materials`. Thêm trường mới không cần migration — nhu cầu thật khi nhân rộng nhiều dự án/khách.
3. **Module registry**: một manifest (`lib/modules.ts`) mô tả mỗi module = {perm keys, nav node, notification sources, route prefix} — nguồn sự thật duy nhất, `lib/auth.ts`/`dashboardTree`/notifications đọc từ đây. Giảm bỏ sót khi thêm module.
4. **Feature flags có scope dự án**: mở rộng `nav_settings` thành `feature_flags(key, project_id, enabled)` — bật/tắt module thật (route trả 404 khi tắt), nền cho bán theo gói.
5. **Tách file khổng lồ**: `app/tracking/[sheet]/page.tsx` tách theo vùng (grid, toolbar, modal hàng loạt, offline queue) — giảm rủi ro mỗi lần đụng, việc phù hợp giao `mechanical`/`coder`.

---

## 9. Vận hành (Ops)

### Hiện trạng

Sentry scaffold xong (chờ DSN), `deploy.sh` swap `.next` atomic + pm2 reload, CI đầy đủ, rate-limit login trong DB, runbook `docs/ops/incident-response.md`. **Chưa có**: backup chính thức hoá, health endpoint, structured logging, metrics, staging.

### Đề xuất (P0 phần lớn — dữ liệu tiền thật đã nằm trong DB)

1. **Backup + kiểm chứng phục hồi**: cron `pg_dump -Fc` hằng đêm → đẩy ra ngoài máy (object storage/rclone); script `restore-check.sh` định kỳ restore vào DB tạm + đếm bảng; ghi mục tiêu **RPO ≤ 24h, RTO ≤ 4h** vào `docs/ops/backup.md`. Không cần code app.
2. **Health endpoint**: `/api/health` — DB ping, version migration mới nhất, disk trống; public-safe (không lộ chi tiết), làm mục tiêu cho uptime monitor ngoài (UptimeRobot…).
3. **Structured logging + `request_id`**: middleware sinh `request_id` (đưa vào AsyncLocalStorage) → log JSON 1 dòng/request (route, user, status, ms) → nối vào `audit_log.request_id` (trục 4) và Sentry tag. Thay dần `console.error` rời rạc.
4. **Metrics**: bắt đầu bằng chính DB (bảng `request_stats` gộp theo phút hoặc log-based), chưa cần Prometheus; nâng cấp OpenTelemetry khi có nhu cầu.
5. **Bật Sentry DSN trên prod** (nợ đã ghi — chỉ còn đặt biến) + alert khi 5xx tăng.
6. **Staging**: 1 instance + DB riêng, chạy migration trước prod cho các migration đụng dữ liệu (đúng `docs/audit.md` §7).

---

## Lộ trình ưu tiên

| Ưu tiên | Hạng mục | Lý do | Quy mô |
| --- | --- | --- | --- |
| **P0 — bảo vệ & nền** | Audit trail toàn hệ (4) · backup/DR + health + Sentry DSN (9) · test bất biến scoping (7.1) · ERD tự sinh (1.1) | Dữ liệu tiền thật cần truy vết + sao lưu; rủi ro cao nếu chậm; toàn quick-win kỹ thuật | 3–4 PR |
| **P1 — khác biệt ERP** | Approval Engine (2) · EVM (5.1) · HĐĐT + kế toán API (6.1–6.2) | Đóng 2 khoảng cách lớn nhất (workflow + tài chính); EVM tận dụng CPM/baseline sẵn có | 3–4 PR mỗi mục |
| **P2 — mở rộng bền** | Quyền dữ liệu-hoá + field-level (3) · RLS phòng tuyến 2 (7.2, cần ADR) · master-data/code_lists + cost code (1.2–1.3) · money helper (1.4) | Giảm lớp lỗi lặp lại, mở đường cấu hình | vừa |
| **P3 — trải nghiệm & scale** | Report builder + alert rules (5.3–5.4) · custom fields + module registry + feature flags (8) · SSO + API keys/webhook (6.3–6.4) · organization/đa pháp nhân (7.3) | Giá trị cao nhưng phụ thuộc nền P0–P2 | lớn, làm dần |

**Nguyên tắc thực thi** (theo CLAUDE.md): mỗi hạng mục viết đặc tả `docs/nang-cap/G<nn>-*.md` (schema DDL, API, điểm chạm, chia PR) trước khi code; uỷ thác `coder` khi đặc tả đã rõ; RLS và organization cần ADR mới trước khi làm.

## Nguồn tham khảo

- Nghị định 70/2025/NĐ-CP sửa NĐ 123/2020 về hoá đơn chứng từ (hiệu lực 01/6/2025): thuvienphapluat.vn, baochinhphu.vn.
- Chữ ký biên bản nghiệm thu — NĐ 06/2021/NĐ-CP, sửa đổi 35/2023/NĐ-CP: chinhsachonline.chinhphu.vn, moc.gov.vn.
- Postgres RLS multi-tenant (FORCE RLS, BYPASSRLS, planner đưa policy vào plan): crunchydata.com, aws.amazon.com/blogs/database, queryplane.com.
