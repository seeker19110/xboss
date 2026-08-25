# M105 — Đợt "đỉnh cao 2D": block tự do + bộ vẽ nâng cao + trình bản vẽ

| Mục           | Nội dung                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State         | **Approved for implementation** — người dùng chốt 2026-08-25: (1) engineer+ thêm block THẲNG từ AutoCAD, bỏ duyệt; (2) ghi đè block giữ LỊCH SỬ tối đa 5 bản + rollback; (3) tự động vẽ = AUTO-ROUTING 2D tuyến; (4) làm đủ ngắt nét giao chéo, revision cloud, nhân bản tầng điển hình, riser, dim+tag tự động, in PDF hàng loạt, so sánh 2 revision |
| Phụ thuộc     | M100–M104 (đã merge #399). Rule pack v9 (mọi khóa mới mặc định TẮT/`reportOnly` như tiền lệ v8)                                                                                                                                                                                                                                                       |
| Ngoài phạm vi | 3D/BIM, block động tham số, đoán dữ liệu bản vẽ không chứa (giữ ranh giới M101 §1)                                                                                                                                                                                                                                                                    |

## Cụm A — Thư viện block tự do (PR-A server+web, PR-B plugin)

### A1. Thêm thẳng từ AutoCAD (bỏ duyệt)

- `POST /api/engineering/cad/block-lib/blocks` (M104) nhận THÊM **token thiết bị `cad`** (ngoài phiên web), vai trò admin/pm/engineer — cùng kiểm/kích thước/advisory lock hiện có. Response giữ nguyên.
- Plugin: `XBOSS_VE_DEXUAT` đổi hành vi thành **thêm thẳng** (giữ tên lệnh, đổi nhãn UI thành "Thêm block vào thư viện…"): thay vì dựng thư viện ứng viên, `Wblock` CHỈ block đã chọn ra tệp DWG riêng (side database, block tại gốc toạ độ) + `DxfOut` sidecar → gọi `GuiThemBlockAsync` lên route trên (multipart `dwg`/`dxf`/`meta` như web). Bỏ đường proposals khỏi lệnh; route/bảng proposals GIỮ NGUYÊN (tương thích, web panel duyệt vẫn xử lý đề xuất tồn đọng) nhưng đánh dấu deprecated trong doc.
- Thành công → thông điệp version mới + `BlockLibraryService.TaiVe` để cache máy mình cập nhật ngay.

### A2. Ghi đè + lịch sử 5 bản + rollback

- Server (`block-them-web.ts` mở rộng): meta thêm `ghiDe?: boolean`. Trùng tên mà `ghiDe=false` → 409 như cũ; `ghiDe=true` → phát hành version mới trong đó entry cùng tên bị THAY bằng entry mới (`fileKey` mới; entry cũ trong các version trước giữ nguyên — bản vẽ đã nhập không đổi). Chỉ được ghi đè block CÓ `fileKey` hoặc block nền — cả hai đều cho phép (block nền ghi đè = entry mới có `fileKey` che tên cũ; loader plugin ưu tiên entry theo manifest hiện hành nên không nhập từ tệp nền nữa — kiểm tra `NhapDinhNghia` nhóm theo manifest hiện hành, đã đúng).
- **Lịch sử**: KHÔNG bảng mới. `GET /api/engineering/cad/block-lib/blocks/history?name=<blockName>` quét `cad_block_libs` từ mới về cũ, gom các bản KHÁC NHAU của entry đó (so `fileSha256`/`dwgSha256`), trả tối đa **5 bản** gần nhất: version thư viện, người phát hành, ngày, previewSvg. `POST .../rollback` body `{name, version}` (engineer+): phát hành version thư viện MỚI với entry lấy nguyên từ version cũ (advisory lock; 409 nếu entry không tồn tại ở version đó). Rollback cũng là một "bản" trong lịch sử.
- Web `ThuVienBlockPanel`: mỗi block trong danh mục có nút "Lịch sử (n)" → panel 5 bản (preview + ngày + người) + nút "Khôi phục bản này" (confirm). Form thêm block: khi trùng tên hiện lựa chọn "Ghi đè bản hiện có (giữ lịch sử)" thay vì chỉ báo lỗi.
- Plugin dialog: trùng tên → checkbox "Ghi đè bản hiện có trong thư viện (bản cũ vẫn khôi phục được)".

AC-A: (1) engineer gửi block từ AutoCAD → version mới ngay, không tạo dòng proposals; (2) ghi đè → version mới thay entry, GET history trả ≤5 bản đúng thứ tự; (3) rollback → version mới với sha256 đúng bản cũ; (4) subcon/viewer → 403; (5) test hồi quy M103/M104 xanh (đường proposals + web thêm thẳng không đổi hành vi).

## Cụm B — Bộ vẽ nâng cao (PR-C, PR-D, PR-E, PR-H — plugin, rule pack v9)

### B0. Auto-routing 2D tuyến (PR-H)

`XBOSS_VE_AUTO`: chọn hệ + size → bấm điểm đầu, các điểm ghim (tuỳ chọn), điểm cuối → plugin
tự vẽ tuyến **orthogonal** (chỉ 0/90°, bám hướng đoạn dài nhất giữa 2 điểm liên tiếp), tự chèn
co 90° tại mọi góc rẽ, tê tại điểm đấu vào tuyến sẵn có (bắt điểm trên tuyến cùng hệ), giảm khi
người dùng đổi size giữa chừng (prompt size từng chặng), tự đặt nhãn size theo `XBOSS_VE_NHAN`.
Tránh chướng ngại ở mức đơn giản: nếu đoạn thẳng cắt qua block/tuyến KHÁC hệ, đề nghị điểm ghim
bổ sung chứ KHÔNG tự dò đường vòng (A* để phiên bản sau — ghi rõ để không kỳ vọng nhầm). Toàn bộ
qua đường vẽ hiện có của `XBOSS_VE` (cùng layer/style/XData bóc tách), 1 UNDO, idempotent theo
nghĩa: chạy lại không sinh thực thể trùng vị trí.

### B1. Ngắt nét giao chéo (PR-C)

Lệnh `XBOSS_VE_NGATNET` + bước chuẩn hóa tùy chọn: tại giao của 2 tuyến KHÁC hệ (ưu tiên theo thứ tự hệ trong rule pack `drawTools.breakPriority`), tuyến "dưới" bị ngắt đoạn `breakGapMm` (v9, mặc định tắt). Chỉ đụng polyline/line thuộc layer hệ; XData đánh dấu đoạn ngắt để idempotent (chạy lại không ngắt tiếp). UNDO 1 phát.

### B2. Revision cloud + so sánh 2 revision (PR-D)

- `XBOSS_VE_CLOUD`: vẽ revision cloud (polyline cung tròn chuẩn AutoCAD) quanh vùng chọn, layer `XBOSS-REV` + tag rev (chữ từ khung tên/ người dùng nhập), style từ rule pack `drawTools.revCloud`.
- `XBOSS_SOSANH`: chọn tệp DWG cũ (hoặc revision tải từ server qua token `cad` — GET tệp revision đã có ở web) → so sánh model space hiện tại với bản cũ ở mức thực thể (handle/hash hình học từ DXF): thực thể THÊM tô màu xanh lá, XÓA vẽ lại màu đỏ nét đứt trên layer `XBOSS-SOSANH-*`, ĐỔI màu cam; bảng tổng kết ra Editor + báo cáo JSON sidecar. Tự đề nghị vẽ cloud quanh các vùng đổi (gọi B2 theo cụm gần nhau). Xóa toàn bộ kết quả so sánh bằng `XBOSS_SOSANH_XOA`.

### B3. Nhân bản tầng điển hình + riser (PR-E)

- `XBOSS_NHANBAN`: chọn vùng nguồn (tầng điển hình) + danh sách tầng đích (nhập `3-12,15`), mỗi tầng 1 bản sao đặt theo bước offset dọc/ngang từ rule pack `drawTools.typicalFloor` hoặc điểm người dùng chỉ; tự thay text tầng theo mẫu (`T{n}`), tag đánh số lại không trùng (tái dùng bộ đếm tag hiện có). XData ghi nguồn nhân bản để bóc KL không đếm trùng khi người dùng chọn "chỉ bóc tầng gốc".
- `XBOSS_VE_RISER`: sinh sơ đồ riser (trục đứng) từ các tầng đã khai: cột tầng + tuyến đứng theo hệ, size từ nhãn tuyến gần shaft (người dùng xác nhận từng tầng), block van/phụ kiện từ thư viện. Đầu ra là bản vẽ 2D schematic trong layout riêng.

AC-B: mỗi lệnh idempotent (chạy lại không nhân đôi), 1 UNDO, mọi thông số qua rule pack v9 (không hard-code), tắt khóa v9 → hành vi y hệt v8; test Core cho hình học (giao điểm ngắt, diff thực thể, đánh số lại tag) chạy trên shim.

## Cụm C — Trình bản vẽ (PR-F, PR-G)

### C1. Dim + tag tự động (PR-F)

- `XBOSS_VE_DIM`: dim tự động cho tuyến đã chọn (khoảng cách tới trục/tường gần nhất theo layer trục khai trong rule pack `dimSettings`; dim style/độ chính xác từ rule pack). `XBOSS_VE_TAG_AUTO`: đánh tag tự động toàn bộ thực thể được đánh dấu bóc chưa có tag, số chạy không trùng (kiểm phép 17 hiện có phải xanh sau khi chạy).

### C2. In PDF hàng loạt (PR-G)

- `XBOSS_BATCH` thêm chế độ `InPdf`: mọi layout có khung tên chuẩn trong từng tệp của thư mục → PDF (plot theo khổ giấy đọc từ block khung tên; device `AutoCAD PDF (High Quality).pc3`), tên tệp `<mã bản vẽ>-<rev>.pdf`, gộp tuỳ chọn thành 1 PDF cả bộ (Core ghép bằng thư viện thuần đã có trong repo web? — KHÔNG: plugin C# tự ghép qua PdfSharp là dependency mới → KHÔNG thêm dependency; chỉ xuất từng tệp + tệp chỉ mục `xboss-in-pdf.txt`). Nhật ký như batch hiện có.

AC-C: dim/tag không đè lên thực thể sẵn có (kiểm bbox), batch PDF bỏ qua tệp lỗi và log rõ, mọi thông số qua rule pack.

## Điểm đã rà bổ sung (chốt cùng đặc tả, tránh hở khi thi hành)

1. **Hàng chờ proposals tồn đọng khi bỏ duyệt (Cụm A):** đề xuất `pending` còn lại vẫn duyệt/từ chối được trên web như cũ; không tạo mới từ plugin nữa. Đánh dấu deprecated trong tài liệu, KHÔNG xoá route/bảng.
2. **"5 bản" là giới hạn HIỂN THỊ/rollback, không xoá dữ liệu:** mọi bản cũ vẫn nằm trong manifest các version trước (append-only); API history chỉ trả 5 bản gần nhất.
3. **Thông báo khi block bị ghi đè:** upsert notification web loại `comment`-style cho người phát hành bản trước đó ("Block X của bạn vừa bị <ai> ghi đè, xem lịch sử") — dùng hệ notifications sẵn có, không loại mới nếu phải thêm schema; nếu cần cột mới thì bỏ qua (ghi nợ), KHÔNG tự chế migration ngoài đặc tả.
4. **So sánh 2 revision cần đường tải tệp revision:** nếu chưa có route GET tệp DWG của `drawing_revisions` cho token `cad`, PR-D bổ sung `GET /api/engineering/cad/plugin-upload?revision=<id>` (chỉ đọc, cùng auth/ratelimit như block-lib) — kiểm tra tồn tại trước, tái dùng nếu đã có.
5. **Batch in PDF:** tên plot device đặt trong rule pack `sheetSetup.pdfDevice` (mặc định "AutoCAD PDF (High Quality).pc3"), không hard-code — máy thiếu device thì báo tiếng Việt kèm hướng dẫn, bỏ qua tệp đó.
6. **Layer mới `XBOSS-REV`/`XBOSS-SOSANH-*` phải được XBOSS_KIEMTRA bỏ qua** (khai vào allowlist layer của rule pack v9) — nếu không mọi bản vẽ có cloud/so sánh sẽ bị báo "layer lạ".

## Kế hoạch PR

| PR   | Nội dung                                                               | route:   | Phụ thuộc |
| ---- | ---------------------------------------------------------------------- | -------- | --------- |
| PR-A | Server+web cụm A (token cad, ghi đè, history/rollback, UI lịch sử)     | complex  | —         |
| PR-B | Plugin cụm A (thêm thẳng, dialog ghi đè, bỏ đường proposals khỏi lệnh) | complex  | PR-A      |
| PR-C | Ngắt nét giao chéo + rule pack v9                                      | complex  | —         |
| PR-D | Revision cloud + so sánh 2 revision                                    | complex  | PR-C (v9) |
| PR-E | Nhân bản tầng điển hình + riser                                        | complex  | PR-C (v9) |
| PR-F | Dim + tag tự động                                                      | standard | PR-C (v9) |
| PR-G | Batch in PDF                                                           | standard | —         |

Mỗi PR: dotnet build/test + build shim xanh; PR server thêm lint/typecheck/test Node; tài liệu (PROGRESS, nang-cap README, README plugin) cập nhật khi đóng từng cụm. Verify tay AutoCAD 2026 vẫn là cổng cuối của cả đợt.
