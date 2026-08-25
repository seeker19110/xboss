# M103 — Đề xuất block vào thư viện từ AutoCAD (hàng chờ + duyệt)

| Mục            | Nội dung                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State          | ✅ **Đã triển khai XONG (2026-08-25)** — server + web đã xong 2026-08-25, plugin lệnh `XBOSS_VE_DEXUAT` xong cùng ngày; quy trình HÀNG CHỜ + DUYỆT, quyền engineer trở lên, metadata bắt buộc đủ |
| Phụ thuộc      | M100 PR2 (thư viện block `cad_block_libs`), M99 PR2 (token thiết bị `cad`), M102 (`XBOSS_BANG`)                                                                                                  |
| Nguyên tắc nền | Thư viện block vẫn là **dữ liệu phát hành có version toàn cục** (M100 §18) — đề xuất KHÔNG sửa thư viện trực tiếp; duyệt mới sinh version mới. AC7 giữ nguyên: không ghi đè âm thầm.             |

## 1. Kiến trúc "thư viện ứng viên" (quyết định tầng 1 — KHÔNG đổi)

Server không chạy AutoCAD → không thể gộp DWG phía server. Do đó **plugin của người đề
xuất dựng sẵn thư viện ứng viên hoàn chỉnh**:

1. Lấy cache thư viện hiện hành (`BlockLibraryService.HienHanh()` — bắt buộc là version mới nhất
   trên server, gọi `TaiVe` trước; lệch → dừng, báo chạy lại).
2. `WblockClone` định nghĩa block người dùng chọn từ bản vẽ đang mở vào BẢN SAO `blocks.dwg`.
3. Sinh manifest MỚI = manifest hiện hành + entry block mới (đúng schema `BlockManifest`).
4. `DxfOut` bản sao đó thành sidecar để server kiểm định độc lập + dựng preview.
5. Upload cả gói làm "đề xuất": server kiểm rồi xếp hàng chờ; **duyệt = server chép nguyên gói
   thành `cad_block_libs` version mới** (thao tác dữ liệu thuần, không CAD).

Chống đua version: đề xuất mang `base_lib_version`; lúc NHẬN và lúc DUYỆT server đều so với
version hiện hành — lệch → 409, đề xuất đánh dấu `stale`, người đề xuất chạy lại lệnh (plugin tự
tải thư viện mới rồi dựng lại ứng viên).

## 2. Schema (migration `0141_cad_block_proposals.sql` — append-only, IF NOT EXISTS)

```sql
CREATE TABLE IF NOT EXISTS cad_block_proposals (
  id               SERIAL PRIMARY KEY,
  block_name       TEXT NOT NULL,
  kind             TEXT NOT NULL,            -- fitting|equipment|titleblock|support|sleeve (LOAI_BLOCK)
  system_id        TEXT,                     -- bắt buộc trừ titleblock
  takeoff_item_id  TEXT,                     -- bắt buộc với kind đếm KL (fitting/equipment/support/sleeve)
  paper_size       TEXT,                     -- chỉ titleblock
  note             TEXT,
  base_lib_version TEXT NOT NULL,
  candidate_manifest JSONB NOT NULL,         -- manifest ĐẦY ĐỦ sau khi thêm
  candidate_storage_key TEXT NOT NULL,       -- DWG ứng viên trong data/uploads/ (tên server sinh như task_documents)
  candidate_dwg_sha256  TEXT NOT NULL,
  preview_svg      TEXT,                     -- best-effort từ sidecar DXF; null nếu không dựng được
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|stale
  reject_reason    TEXT,
  published_version TEXT,                    -- version thư viện sinh ra khi approved
  proposed_by      INTEGER NOT NULL REFERENCES users(id),
  decided_by       INTEGER REFERENCES users(id),
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cad_block_proposals_status ON cad_block_proposals(status);
```

## 3. API (mọi route: auth + `export const dynamic = "force-dynamic"`)

| Route                                                   | Auth                                                                         | Hành vi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/engineering/cad/block-proposals`             | token thiết bị `cad`, vai trò admin/pm/engineer                              | multipart: `candidateDwg`, `sidecarDxf`, `meta` JSON (block_name/kind/system_id/takeoff_item_id/paper_size/note/base_lib_version/candidate_manifest/sha256). Kiểm: (a) sha256 khớp; (b) manifest hợp lệ qua validator sẵn có của `block-lib.ts` và = manifest hiện hành + đúng 1 entry mới tên `block_name`; (c) **trùng tên với thư viện hiện hành hoặc đề xuất pending khác → 409, thông điệp tiếng Việt bắt đổi tên**; (d) metadata đủ theo kind (mục 2); (e) `base_lib_version` = version hiện hành, lệch → 409 `stale`; (f) sidecar DXF parse được và CÓ định nghĩa block tên đó (dxf-parser sẵn có) — không có → 422; (g) rate limit như block-lib. Đạt → lưu DWG vào `data/uploads/`, dựng `preview_svg` best-effort từ sidecar (LINE/LWPOLYLINE/CIRCLE/ARC/TEXT; entity lạ bỏ qua; lỗi → null, KHÔNG fail đề xuất), INSERT pending. Idempotent theo (block_name, sha256, pending). |
| `GET /api/engineering/cad/block-proposals`              | phiên web HOẶC token `cad`; engineer thấy của mình, admin/pm thấy tất cả     | `?status=` lọc; trả kèm tên người đề xuất, nhãn tiếng Việt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `POST /api/engineering/cad/block-proposals/:id/approve` | CHỈ phiên web Admin/PM (không nhận token thiết bị — như phát hành block-lib) | Re-check base = version hiện hành (lệch → set `stale`, 409). Đạt → tái dùng đường phát hành của `block-lib.ts` (INSERT `cad_block_libs` với candidate_manifest/storage_key/sha256, version mới = quy ước version hiện có +1), set approved + published_version, audit ai duyệt. Transaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `POST /api/engineering/cad/block-proposals/:id/reject`  | web Admin/PM                                                                 | body `{reason}` bắt buộc → rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Logic nghiệp vụ đặt ở `lib/ky-thuat/cad/block-proposals.ts` (miền `ky-thuat`, tầng 4); route chỉ là ranh giới HTTP. Preview SVG: module thuần `lib/ky-thuat/cad/block-preview-svg.ts` (nhận entity đã parse, trả chuỗi SVG viewBox tự khớp bbox, stroke `currentColor`, không hardcode màu).

## 4. Plugin (AutoCAD)

- Lệnh mới **`XBOSS_VE_DEXUAT`** (+ nút "Đề xuất block…" trong nhóm thư viện của `XBOSS_BANG`):
  1. Yêu cầu đã `XBOSS_LOGIN`; gọi `BlockLibraryService.TaiVe` để chắc chắn cache = mới nhất.
  2. `GetEntity` chọn 1 BlockReference trên màn hình (chọn entity không phải block → nhắc lại).
  3. Dialog WinForms (đặt trong `Ui/`, cùng phong cách BangDieuKhienControl): tên block (mặc định
     tên định nghĩa, cho sửa — kiểm trùng với manifest cache NGAY trong dialog), loại (combo 5
     kind), hệ (combo từ `layerMap.groups` của rule pack — đoán sẵn theo layer của block ref),
     item bóc tách (combo từ `takeoff.items` có `measure: count` — bắt buộc trừ titleblock),
     khổ giấy (chỉ hiện khi titleblock), ghi chú. Thiếu trường bắt buộc → khoá nút Gửi kèm lý do.
  4. Dựng ứng viên theo mục 1 (side database, KHÔNG đụng bản vẽ đang mở; tệp tạm dọn trong finally).
  5. POST qua `XBossApiClient` (thêm hàm `GuiDeXuatBlock` — multipart như `GuiBanVe` của upload).
     409 trùng tên/stale → thông điệp tiếng Việt rõ hành động tiếp theo.
- `XBOSS_BANG`: khối "Thư viện block" thêm dòng trạng thái đề xuất của tôi (GET `?status=pending`
  - kết quả gần nhất approved/rejected kèm lý do) — refresh cùng nhịp panel.
- Test (XBoss.Cad.Tests, chạy trên shim): dựng manifest ứng viên (thuần), validate metadata theo
  kind, client `GuiDeXuatBlock` (HttpMessageHandler giả — 200/409-trùng/409-stale/422).

## 5. Web

Trang `/engineering/chuan-hoa-ban-ve`: `ThuVienBlockPanel` thêm mục **"Đề xuất chờ duyệt (n)"**
(chỉ Admin/PM thấy nút duyệt): danh sách pending — preview SVG (fallback icon khối khi null),
metadata đủ, người đề xuất, nút "Duyệt & phát hành" (confirm 1 bước, hiện version sẽ sinh) và
"Từ chối" (bắt nhập lý do). Sau duyệt panel tự refresh version thư viện. Engineer thấy danh sách
đề xuất CỦA MÌNH + trạng thái. Dùng bộ `ui/` sẵn có, emerald = duyệt, đỏ chỉ cho từ chối.

## 6. Tiêu chí chấp nhận

1. Engineer chọn block trên bản vẽ → điền dialog → Gửi: đề xuất pending xuất hiện trên web kèm preview; KHÔNG có version thư viện mới nào sinh ra.
2. Admin/PM bấm Duyệt → `cad_block_libs` có version mới chứa đúng block; máy khác `XBOSS_LOGIN`/`TaiVe` nhận được (ETag đổi); đề xuất approved ghi `published_version` + người duyệt.
3. Trùng tên (thư viện hiện hành hoặc pending khác) → 409 ngay lúc gửi, không tạo dòng.
4. Hai đề xuất cùng base: cái duyệt sau bị 409/stale, không bao giờ phát hành thư viện mất block của cái trước.
5. Thiếu metadata bắt buộc theo kind → 422 (server) và bị chặn ngay tại dialog (plugin).
6. subcon/viewer gọi POST đề xuất → 403; token thiết bị gọi approve → 401/403.
7. `npm run lint`/`typecheck`/`test` + `dotnet test` xanh; migration chỉ CREATE thuần (đi thẳng production được).
