## Đồng bộ hai chiều vật tư ↔ Google Sheet (VÙNG RỦI RO CAO)

- 3-way merge dựa snapshot bảng `material_sync`: chỉ DB đổi → đẩy ra Sheet; chỉ Sheet đổi → kéo vào DB; cả hai đổi → xung đột, **DB ưu tiên** (`CONFLICT_POLICY`). Logic quyết định ở hàm thuần `decideMerge` — đổi nó phải kèm test `tests/material-sync.test.ts`.
- Snapshot `material_sync` chỉ được lưu **sau khi** ghi lên Sheet thành công — lưu trước thì lỗi mạng giữa chừng khiến lần sync sau tưởng đã đồng bộ và âm thầm hoàn tác dữ liệu DB.
- Khớp dòng theo cột `ID`; dòng Sheet mất ID phải đối chiếu theo **Mã BOQ** với vật tư có sẵn trước khi tạo mới (lỗi thật: sinh vật tư trùng vĩnh viễn).
- Chỉ `SYNCED_FIELDS` (boqCode/name/unit/qtyBoq/qtyPlanned/status/note) là hai chiều; `qty_used`/`qty_stock`/`min_stock_level` chỉ DB→Sheet — Sheet không được ghi đè các cột này. Mọi thay đổi `qty_used` phải đi qua `material_transactions` (delta ±, người ghi).
- Chống chạy chồng bằng bảng khoá `sync_locks`; khoá phải được nhả cả khi lỗi (finally) và có hết hạn.
- Thiếu cấu hình Google (`GOOGLE_SERVICE_ACCOUNT_JSON`/`GOOGLE_SHEET_ID`...) → throw fail-fast khi gọi sync, không âm thầm bỏ qua.
- Đồng bộ luôn trong phạm vi **một dự án** (`runMaterialSync({ orgId, projectId })`): mọi đọc/ghi `materials`/`material_sync`/`sheet_types` lọc theo dự án, vật tư tạo từ Sheet mang `project_id`; dòng Sheet mang ID vật tư dự án/org khác thì không ghi DB, không xoá khỏi Sheet. Route dùng `getCurrentProjectIdStrict` (không dự án → 404); cron chỉ-secret dùng `GOOGLE_SHEET_PROJECT_ID`, thiếu → 503 — không fallback "dự án đầu tiên".
