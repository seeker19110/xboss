# M104 — Thêm block vào thư viện trực tiếp từ web (không qua duyệt)

| Mục       | Nội dung                                                                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State     | **Approved for implementation** — người dùng chốt 2026-08-25: thêm THẲNG không duyệt (đảo một phần quyết định M103 cho riêng đường web, đường AutoCAD vẫn qua hàng chờ); định dạng DWG + DXF kèm; quyền: admin/pm/engineer |
| Phụ thuộc | M100 PR2 (`cad_block_libs`), M103 (validator metadata/trùng tên, preview SVG)                                                                                                                                              |

## 1. Kiến trúc thư viện đa tệp (quyết định tầng 1 — KHÔNG đổi)

Server không chạy AutoCAD nên KHÔNG gộp được block web vào `blocks.dwg`. Nâng mô hình:

- Manifest entry (`BlockManifest.blocks[]`) thêm 2 trường **tuỳ chọn**: `fileKey` (khoá tệp DWG
  riêng của block trong `data/uploads/`) + `fileSha256`. Entry KHÔNG có `fileKey` = block nằm
  trong `blocks.dwg` nền như cũ (tương thích ngược 100%, mọi thư viện hiện hành không đổi).
- Phát hành version mới từ web = INSERT `cad_block_libs` với: `storage_key`/`dwg_sha256` GIỮ
  NGUYÊN của version hiện hành (tệp nền không đổi), manifest mới = manifest hiện hành + entry mới
  có `fileKey`. Thao tác dữ liệu thuần.
- Tải về phía plugin: `GET /api/engineering/cad/block-lib?file=<fileKey>` trả tệp DWG lẻ (cùng
  auth token `cad` + rate limit như tải `blocks.dwg`; chỉ trả `fileKey` có mặt trong manifest
  của MỘT version — chặn đọc tệp tuỳ ý). Plugin (làm SAU khi Việc 2 M103 đóng): cache
  `block-lib\files\<fileKey>`, kiểm sha256 từng tệp như tệp nền, `WblockClone` từ từng tệp lẻ.
  Đề xuất AutoCAD (M103) dựng ứng viên trên nền đa tệp: candidate manifest GIỮ NGUYÊN các entry
  `fileKey` (không nuốt vào blocks.dwg ứng viên).

## 2. API

`POST /api/engineering/cad/block-lib/blocks` — phiên web (KHÔNG token thiết bị), vai trò
admin/pm/engineer (`CAN.manageDrawings`), rate limit như block-lib. Multipart: `dwg` (tệp .dwg
chứa block, vẽ tại gốc toạ độ), `dxf` (cùng nội dung, để kiểm định + preview), `meta` JSON
(blockName/kind/systemId/takeoffItemId/paperSize/note — cùng luật bắt buộc theo kind của M103).
Kiểm (tái dùng M103): metadata đủ; trùng tên với thư viện hiện hành HOẶC đề xuất pending M103 →
409 `trung-ten`; DXF parse được và chứa định nghĩa block đúng tên → không thì 422; giới hạn kích
thước như block-proposals; chưa có thư viện nền → 409 `chua-co-thu-vien`. Đạt → trong
transaction + `pg_advisory_xact_lock('cad_block_libs')`: lưu tệp DWG (tên server sinh) + dựng
`preview_svg`, phát hành version mới (`versionPhatHanhKeTiep`) với manifest nối entry mới
(kèm `fileKey`/`fileSha256`, và `previewSvg` lưu vào entry manifest để web hiển thị). Response
201 `{version, libId}`. Audit: `published_by` như phát hành thường.

`GET /api/engineering/cad/block-lib?file=<fileKey>` — mở rộng route GET hiện có (token `cad`
hoặc phiên web): stream tệp DWG lẻ, 404 khi fileKey không thuộc manifest version nào.

## 3. Web

`ThuVienBlockPanel` thêm nút **"Thêm Block Từ Web"** (admin/pm/engineer — dùng `laNguoiDuyet`?
KHÔNG: server trả thêm cờ `duocThemTrucTiep` từ GET block-proposals hoặc dashboard): mở form
kéo-thả 2 tệp (.dwg + .dxf, kiểm đuôi + cùng tên gốc phía client) + các trường metadata cùng
luật M103 (thiếu → khoá nút, thông điệp tiếng Việt). Gửi xong: toast thành công kèm version mới,
refresh version thư viện. 409/422 hiện đúng thông điệp server.

## 4. Tiêu chí chấp nhận

1. Engineer kéo thả DWG+DXF + metadata đủ → version thư viện mới xuất hiện NGAY (không qua hàng chờ), entry mới có `fileKey`/`fileSha256`/`previewSvg`; tệp nền `blocks.dwg` giữ nguyên `dwg_sha256`.
2. Trùng tên (thư viện hoặc pending M103) → 409, không sinh version, không lưu tệp mồ côi.
3. DXF thiếu định nghĩa block đúng tên → 422; thiếu metadata theo kind → 422.
4. `GET ?file=` trả đúng tệp với token `cad`; fileKey lạ → 404; chưa đăng nhập → 401.
5. subcon/viewer POST → 403.
6. Hai lượt thêm web song song: nhờ advisory lock, cả hai đều thành công với version nối tiếp nhau (không 500, không mất entry).
7. Manifest cũ (không `fileKey`) vẫn load/kiểm như trước — test hồi quy `cad-block-lib.test.ts` không đổi kết quả.
8. lint/typecheck/test xanh; migration KHÔNG cần (chỉ dữ liệu manifest JSONB).
