# M55 — BI qua Metabase self-host: schema `bi` an toàn + vận hành (P2, sau M53)

> **Quyết định định hướng** (người dùng chốt 2026-07-17): dùng Metabase self-host làm tầng BI/khám phá dữ liệu thay vì tự xây dashboard builder trong app (đã cân nhắc 3 hướng; hướng tự xây bị loại vì chi phí; OLAP riêng bị loại vì over-engineering ở khối lượng dữ liệu hiện tại).
>
> **Rủi ro trung tâm phải giải bằng thiết kế, không bằng quy ước**: Metabase đọc thẳng Postgres sẽ XUYÊN THỦNG toàn bộ lớp quyền tầng app (masking tiền/lương M50 PR2, scope dự án M22, scope org M54 tương lai, SoD). Vì vậy Metabase KHÔNG BAO GIỜ được đọc schema `public` — chỉ đọc schema **`bi`** gồm các VIEW đã áp sẵn luật che + phạm vi, qua role Postgres riêng chỉ-đọc. Ai đăng nhập được Metabase = thấy được những gì schema `bi` cho thấy, không hơn.
>
> **Phạm vi người dùng đợt 1**: chỉ **Admin/PM** (nhóm PAYMENT_VIEW trừ `bch`). Không nhúng dashboard Metabase vào app cho vai trò khác (embedding + SSO là đợt sau, cần M49 SSO). Người dùng thường vẫn dùng `/reports` (saved reports M47 PR3) — 2 hệ song song có chủ đích: saved reports = báo cáo chuẩn trong app mọi vai trò; Metabase = khám phá ad-hoc cho quản lý.

## PR1 — Schema `bi` + role chỉ-đọc (`route: complex` — thiết kế view là quyết định lộ/che dữ liệu)

### Migration `0065_bi_schema.sql` (đổi số nếu bị chiếm; thuần thêm → đi thẳng production)

```sql
CREATE SCHEMA IF NOT EXISTS bi;
-- Role chỉ-đọc, chỉ thấy schema bi. Password tạo tay khi deploy (ghi DEPLOY.md), không trong git.
-- CREATE ROLE xboss_bi LOGIN PASSWORD '...' NOBYPASSRLS;  -- lệnh chạy tay, comment trong migration
GRANT USAGE ON SCHEMA bi TO xboss_bi;
ALTER DEFAULT PRIVILEGES IN SCHEMA bi GRANT SELECT ON TABLES TO xboss_bi;
-- KHÔNG grant gì trên schema public cho xboss_bi.
```

### Nguyên tắc viết view (áp cho MỌI view trong `bi`, ghi thành comment đầu migration)

1. **Whitelist cột tường minh** — không `SELECT *` (cột mới thêm vào bảng gốc không tự lộ ra BI).
2. **Không cột nhạy cảm theo M50 PR2**: view mặc định KHÔNG chứa lương (`payroll.amount`...), đơn giá chi tiết; nhóm view tài chính tách riêng có hậu tố `_fin` — đợt 1 vẫn tạo (đối tượng dùng là Admin/PM có `viewPayments`) nhưng tách sẵn để đợt sau cấp role BI hẹp hơn chỉ cần thu `GRANT`.
3. **Không PII ngoài cần thiết**: `users` chỉ lộ `id, name, role` (không email/password_hash — password_hash tuyệt đối không).
4. **Tôn trọng soft-delete** (M44): mọi view `WHERE deleted_at IS NULL` trên bảng có cột này.
5. Tiền cast `::numeric` giữ nguyên trong view — Metabase tự aggregate đúng trên Postgres, không đi qua parser float JS (không dính ràng buộc M45).

### Danh sách view đợt 1 (~15, phủ các trục báo cáo chính)

- Tiến độ: `bi.tasks` (task + tên nhóm/sheet/hệ/tháp/dự án đã JOIN phẳng, effective dates `COALESCE(t.end_date, wp.end_date)` — đúng bài học fix 2026-07-16), `bi.task_history_daily` (từ `mv_progress_daily`), `bi.delays` (task trễ + lý do).
- Thương mại `_fin`: `bi.contracts_fin`, `bi.variations_fin`, `bi.payment_certs_fin`, `bi.cost_by_month_fin` (từ `mv_cost_by_month`), `bi.cash_fin`.
- Vật tư/mua sắm: `bi.materials`, `bi.purchase_orders`, `bi.material_transactions`.
- QA/QC + hiện trường: `bi.ncrs`, `bi.inspections`, `bi.hse_records`, `bi.diaries`.
- Danh mục: `bi.projects`, `bi.systems`, `bi.users_dim` (id/name/role).

### Test + tiêu chí chấp nhận

- `tests/bi-schema.test.ts` (integration): (1) role `xboss_bi` SELECT được mọi view `bi.*`; (2) bị từ chối `SELECT` trực tiếp bảng `public.*` (permission denied); (3) không view nào chứa cột cấm — assert tự động: query `information_schema.columns` schema `bi`, giao với blacklist (`password_hash`, `email` ngoài whitelist, các cột trong `SENSITIVE_FIELDS` của `lib/sensitive-fields.ts` ngoài view `_fin`); (4) view tôn trọng soft-delete.
- Test (3) là **bất biến chạy mãi trong CI** — người sau thêm view mới quên luật sẽ đỏ ngay (cùng triết lý `project-scope-invariant`).

## PR2 — Vận hành Metabase (`route: standard`, phần lớn là docs + compose)

- `docs/ops/metabase.md` (mới): docker-compose chạy Metabase + DB nội bộ của Metabase (Postgres riêng hoặc cùng instance khác database — KHÔNG dùng chung database xboss); kết nối tới xboss qua `xboss_bi`; đặt sau Nginx tại `bi.<domain>` + HTTPS certbot; RAM tối thiểu ~2GB (Metabase là JVM — kiểm tra VPS hiện tại đủ trước khi cài, nếu thiếu ghi rõ phương án nâng); backup database Metabase (câu hỏi/dashboard người dùng tạo nằm ở đó); cập nhật phiên bản.
- Tài khoản: tạo tay cho Admin/PM đợt 1 (chưa SSO — ghi nợ: SSO qua M49 khi làm embedding).
- `.env.example`/`DEPLOY.md`: ghi chú `xboss_bi` password tạo lúc deploy.
- KHÔNG code app trong PR này. Tiêu chí: 1 người vận hành theo doc dựng được từ đầu trên staging; Admin đăng nhập Metabase thấy đúng các view `bi.*`, thử 1 câu hỏi pivot tiến độ theo hệ × tháng ra số khớp dashboard app.

## PR3 — (Tuỳ chọn, sau khi dùng thật ≥2 tuần) Bổ sung view theo nhu cầu

- Thu thập câu hỏi Admin/PM thật sự hỏi trong Metabase, bổ sung view/matview còn thiếu — data-driven, không đoán trước. `route: standard` từng đợt nhỏ.

## Ràng buộc tương lai (ghi để không bị phá sau)

- **M54 (multi-tenant)**: khi có `org_id`, TOÀN BỘ view `bi.*` phải thêm điều kiện org — Metabase đợt SaaS không được dùng chung 1 role cho mọi tenant. Phương án khi đến lúc: 1 database-connection Metabase per-tenant với GUC `app.org_id` đặt ở connection (RLS áp lên view qua `security_invoker`), hoặc Metabase riêng per-tenant. Ghi vào M54 giai đoạn 2 như một mục phụ thuộc.
- Không bao giờ cấp `xboss_bi` quyền ghi hoặc quyền trên `public` — mọi nhu cầu "BI cần thêm dữ liệu" giải bằng thêm view.
