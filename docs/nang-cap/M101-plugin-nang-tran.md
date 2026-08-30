# M101 — Đặc tả: Nâng trần plugin AutoCAD — chuẩn hóa/kiểm tra/bóc tách lên mức cao nhất của nền 2D

| Thuộc tính     | Giá trị                                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal   | Đẩy 3 khối tính năng M99 (`XBOSS_KIEMTRA`/`XBOSS_CHUANHOA`/`XBOSS_BOCKL`) lên **trần khả thi của kiến trúc hiện tại** — mọi thứ Managed API 2D + rule pack làm được mà chưa làm                                                                                                               |
| Spec owner     | (chờ gán)                                                                                                                                                                                                                                                                                     |
| State          | ✅ **Đã triển khai XONG cả 5 PR (2026-08-25)** — Approved for implementation — người dùng duyệt 2026-08-25 ("ok duyệt tất cả"); open §18 chốt: thứ tự PR giữ như bảng §16 (PR3 được phép làm trước PR2 nếu coordinator thấy lợi), per-project rule pack làm ngay trong PR4 không đợi UAT M100 |
| Cập nhật       | 2026-08-25 — bản đầu, theo yêu cầu người dùng "nâng cấp tất cả tính năng lên mức trần cao nhất"                                                                                                                                                                                               |
| Quyết định nền | ADR-0006 + M99 §9.1 — kế thừa nguyên vẹn. Phụ thuộc M99 (đã merge); độc lập với M100 (`XBOSS_VE_*`) trừ ghi chú §16                                                                                                                                                                           |

> Không code khi chưa **Approved for implementation**. Trần TUYỆT ĐỐI không vượt trong M101: 3D/BIM, chạy AutoCAD trên server, sửa proxy entity hãng thứ ba, "đoán" thông tin bản vẽ không chứa (cao độ thật, hao hụt thi công) — các mục đó nằm ngoài mọi PR dưới đây.

## 1. Problem — khoảng cách tới trần

Rà theo phân tích trần 2026-08-25 (hội thoại người dùng): mỗi khối còn dư địa lớn mà **không cần đổi kiến trúc** — chỉ cần rule pack mở rộng + code Core thuần + Adapter. Cụ thể từng khối ở §6. Nguyên tắc giữ nguyên: quy tắc sống trong rule pack (append-only), Core thuần test CI Linux, Adapter đo/áp, 1 lệnh = 1 UNDO.

## 2. Outcome, metric và guardrail

- **O1** `XBOSS_KIEMTRA` phủ **đủ lớp lỗi bản vẽ MEPF 2D phát hiện được bằng máy** (16 phép kiểm — §6.1); bản vẽ pass toàn bộ thì nộp CĐT không bị trả về vì lỗi trình bày.
- **O2** `XBOSS_CHUANHOA` xử lý được **mọi bảng style** (không chỉ layer/font/lineweight): dimstyle, textstyle, xref, viewport/tỉ lệ, hatch — bản vẽ sau chuẩn hóa đồng nhất như vẽ bởi 1 người.
- **O3** `XBOSS_BOCKL` bóc được **theo thuộc tính** (size từng đoạn), **theo vùng** (tầng/zone), **phụ kiện + cách nhiệt + giá đỡ quy đổi** — Excel giao QS gần khối lượng dự toán nhất mà bản vẽ 2D cho phép.
- **Guardrail:** như M99 (1 UNDO, chỉ-kiểm không đụng bản vẽ, không làm tròn từng đối tượng, DB chỉ ghi qua upload kiểm định); mọi phép kiểm/bước chuẩn hóa mới **tắt/bật được qua rule pack** — công ty không dùng thì không thấy.

## 6. Nội dung nâng trần theo khối

### 6.1 `XBOSS_KIEMTRA` — 9 → 16 phép kiểm (rule pack `inspectionPolicy` v5)

Giữ 9 phép hiện có, thêm 7:

| #   | Phép kiểm mới                | Nội dung — nguồn dữ liệu                                                                                                                                        |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | Chồng lấn tuyến cùng hệ      | 2 tim cùng layer đo song song cách nhau < ngưỡng (`overlapToleranceMm`) trên đoạn dài > ngưỡng — nghi vẽ đè/vẽ đúp (khác duplicate tuyệt đối đã có ở deepPurge) |
| 11  | Giao cắt khác hệ (clash 2D)  | Giao điểm tim hệ A × tim hệ B **kèm cảnh báo cố định "chỉ là giao trên mặt bằng — không thay được clash 3D"**; bật/tắt từng cặp hệ qua `clashPairs`             |
| 12  | Khung tên thiếu/sai trường   | Layout có block `kind=titleblock` (manifest M100 — nếu chưa có M100 thì khớp `titleblockNameMatchAny`) mà attribute bắt buộc rỗng/thiếu                         |
| 13  | Viewport không khóa/tỉ lệ lạ | Viewport tỉ lệ ngoài danh mục `scales` hoặc chưa lock — nguồn lỗi in sai tỉ lệ kinh điển                                                                        |
| 14  | Text/Dim style lệch chuẩn    | Textstyle/Dimstyle khác `styleMap` (§6.2) — báo tên style + số đối tượng dùng                                                                                   |
| 15  | Nhãn size lệch thực thể      | Nhãn sinh bởi `XBOSS_VE_NHAN` (M100, có XData) mà nội dung ≠ XData tim liên kết — bắt sửa tay lệch dữ liệu. Không có M100 → phép kiểm tự tắt                    |
| 16  | Đối tượng ngoài khung        | Hình học nằm ngoài extents hợp lý (cách bao chính > `strayDistanceFactor` × đường chéo) — rác "vẽ nháp để quên" làm zoom-extents vỡ                             |

Báo cáo JSON giữ khung cũ, thêm mảng `checks[10..16]`; marker highlight cùng cơ chế layer tạm. Mỗi phép có `enabled` riêng trong rule pack.

### 6.2 `XBOSS_CHUANHOA` — pipeline 7 → 11 bước (rule pack v5)

Chèn sau bước lineweight/CTB hiện tại, thứ tự cố định mới:

| Bước mới        | Nội dung                                                                                                                                                                     | Khóa rule pack |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 8. Style map    | Đổi textstyle/dimstyle về bộ chuẩn (tên + font + height factor); dim đang dùng style lạ → gán style chuẩn tương đương gần nhất, **không** phá associativity (kế thừa O3 M99) | `styleMap`     |
| 9. Xref policy  | Theo chính sách: báo xref đứt đường dẫn (relative hóa `pathPolicy=relative`), tùy chọn bind các xref khai trong `bindMatchAny` (mặc định KHÔNG bind — chỉ báo)               | `xrefPolicy`   |
| 10. Hatch/scale | Hatch pattern + scale về chuẩn theo layer (`hatchMap`); hatch solid giữ nguyên                                                                                               | `hatchMap`     |
| 11. Layout dọn  | Xóa layout rỗng (không viewport, không đối tượng), đặt lại tên layout theo pattern nếu bật `renameLayouts` (mặc định tắt)                                                    | `layoutPolicy` |

Mọi bước mới mặc định **tắt** trong v5 (bật dần sau pilot) — v5 nạp vào plugin cũ không đổi hành vi (mở rộng thuần, như v3→v4). Diff preview + 1 UNDO + báo cáo JSON như hiện tại.

### 6.3 `XBOSS_BOCKL` — bóc theo thuộc tính, theo vùng, phụ kiện/cách nhiệt (rule pack `takeoff` v5)

| Nâng cấp                           | Nội dung                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bóc theo size**                  | Item khai `groupBySize: true` → kết quả tách dòng theo size đọc từ **XData `XBOSS_VE`** (M100) hoặc từ **nhãn text gần tuyến** (`sizeFromNearbyText` — regex `sizePatterns`, bán tự động, ghi rõ nguồn "đọc từ nhãn" trong Excel). Excel: mỗi size 1 dòng (vd "Ống gió 300x200: 45.2m")                             |
| **Bóc theo vùng**                  | `XBOSS_BOCKL` thêm tùy chọn vùng: chọn polyline ranh giới (hoặc kẻ mới) + đặt tên vùng ("Tầng 5", "Zone A") → mọi kết quả gắn cột vùng; tuyến cắt ranh giới tính phần nằm trong (cắt tại giao điểm). Excel thêm cột vùng + subtotal theo vùng; XData bóc ghi kèm tên vùng                                           |
| **Phụ kiện quy đổi**               | Item `measure: count` thêm `perCountAdd` (vd mỗi co = +0.5m tương đương) và item length thêm `wastagePct` — **cả hai mặc định 0, chỉ QS/kỹ sư trưởng chốt hệ số trong rule pack theo dự án**; Excel tách cột "KL đo" và "KL quy đổi", công thức sống, KHÔNG trộn lẫn (giữ nguyên tắc "đo theo tim tuyến" minh bạch) |
| **Cách nhiệt**                     | Item dẫn xuất `derivedFrom: <itemId>` + `formula: "perimeter*length"` (ống gió) / `"pi*dn*length"` (ống tròn) — tính từ size đã tách; không có size → bỏ qua kèm cảnh báo số mét chưa tính                                                                                                                          |
| **`boqCode` theo dự án**           | Rule pack phát hành **per-project** khi cần: API rule-pack nhận `?project=` trả bản có mã BOQ gán sẵn (bảng map trong DB, Admin/PM nhập trên web) — cột A Excel tự điền, QS khỏi gõ. Fallback: toàn cục như hiện tại                                                                                                |
| **Đối chiếu BOQ ngay trong Excel** | Sheet phụ `Doi-chieu` (tùy chọn khi phát lệnh): kéo KL BOQ hợp đồng từ server (`GET /api/engineering/cad/boq-snapshot?project=`, token `cad`, **chỉ đọc**) đặt cạnh KL bóc — chênh lệch % công thức sống. Không ghi gì về server (giữ đường ghi duy nhất qua upload)                                                |

### 6.4 Ngoài 3 khối — các mục nhỏ chạm trần

- **`XBOSS_BATCH`** nhận thêm chế độ `bocl`: bóc hàng loạt cả thư mục (side database) → 1 Excel tổng nhiều bản vẽ (cột "Tệp"), phục vụ bóc cả tòa nhà.
- **`XBOSS_UPLOAD`** gửi kèm **kết quả bóc** (sidecar JSON đã có từ PR-B) → server lưu vào `drawing_revisions.standardize_report` (khối `takeoff`), bảng điều khiển web hiện KL đã bóc theo revision — vẫn KHÔNG ghi vào bảng BOQ (đường ghi sổ giữ nguyên; nếu sau này muốn ghi thật, mở đặc tả riêng có duyệt 2 bước như nghiệm thu).
- **Bảng điều khiển web**: biểu đồ KL bóc theo hệ/vùng/revision từ dữ liệu trên; nút tải Excel gộp.

## 7–8. FR/AC (rút gọn — chi tiết chốt khi duyệt)

- **FR1** Rule pack v5 mở rộng thuần từ v4 (hoặc v3 nếu M100 chưa duyệt — đánh version kế tiếp thực tế); mọi mục mới có `enabled`/mặc định an toàn (tắt hoặc hệ số 0). **FR2** 7 phép kiểm mới thuần trong Core + test; Adapter chỉ cung cấp dữ liệu thô (extents, giao điểm, viewport, attribute). **FR3** 4 bước chuẩn hóa mới trong pipeline cố định, mặc định tắt, 1 UNDO. **FR4** Bóc theo size/vùng/dẫn xuất tính trong Core (`Takeoff/`), Adapter chỉ đo + đọc XData/nhãn. **FR5** API `boq-snapshot` chỉ-đọc, token scope `cad`, trả `::text` cho cột tiền — nhưng M101 **không đụng cột tiền** (chỉ khối lượng). **FR6** Excel giữ hợp đồng layout M99 §13.2, các cột/sheet mới là **cộng thêm** — QS mở bằng thói quen cũ không hụt gì.
- **AC then chốt:** (a) rule pack v5 nạp plugin M99 cũ → hành vi y nguyên; (b) bản vẽ mẫu có 16 lớp lỗi cài sẵn → KIEMTRA bắt đủ 16, 0 báo oan trên bản sạch; (c) bóc theo vùng: tuyến 10m cắt ranh giới 6/4 → vùng A 6.00m, vùng B 4.00m; (d) cách nhiệt ống gió 300x200 dài 10m → 10×(0.3+0.2)×2 = 10.00m²; (e) đối chiếu Excel: đổi KL BOQ trên server → sheet `Doi-chieu` lần xuất sau đổi theo, bản vẽ không đổi.

## 9–15. Kiến trúc/API/test — kế thừa khung M99/M100

Core thuần mở rộng (`Inspection/`, `Takeoff/`, mới `Zoning/` cho cắt-theo-ranh-giới — thuật toán clip polyline thuần, test CI Linux); Adapter thêm prompt/đo; server thêm `boq-snapshot` (đọc `lib/khoi-luong/boq.ts` — qua `lib/dich-vu/` nếu cần phối hợp miền) + bảng map boqCode-theo-dự-án (DDL thêm thuần, lấy số migration thật lúc code) + phần web. Test: Core xunit (hình học clip/giao/chu vi), node:test (API, map), tích hợp tay máy Windows theo release (ràng buộc runner như M99 §18 — không đổi).

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                    | route:     | Ghi chú                                                           |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| PR1 | Rule pack v5 + validator + 7 phép kiểm mới (Core + Adapter data + test)                     | `complex`  | Độc lập M100 (phép 12/15 tự tắt khi thiếu M100)                   |
| PR2 | 4 bước chuẩn hóa mới (styleMap/xref/hatch/layout)                                           | `complex`  | —                                                                 |
| PR3 | Bóc theo size + vùng + dẫn xuất cách nhiệt + hệ số quy đổi (Core `Zoning/` + Excel mở rộng) | `complex`  | Khối giá trị lớn nhất — có thể làm trước PR2                      |
| PR4 | `boqCode` per-project + `boq-snapshot` + sheet `Doi-chieu` + web (map + biểu đồ)            | `complex`  | Chạm `lib/khoi-luong/boq.ts` → rà `docs/audit.md` vùng rủi ro cao |
| PR5 | `XBOSS_BATCH` chế độ bóc hàng loạt + upload kèm KL + web hiển thị                           | `standard` | PR3                                                               |

## 18. Risk/open

| Mục                                                              | Xử lý                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Clash 2D gây ảo tưởng an toàn                                    | Nhãn cảnh báo cố định trong báo cáo + tên phép kiểm ghi rõ "(mặt bằng)"; tắt mặc định                            |
| `sizeFromNearbyText` đọc nhầm nhãn                               | Chỉ bán tự động: kết quả đánh dấu nguồn, ngưỡng khoảng cách chặt, không khớp → để trống size chứ không đoán      |
| Hệ số quy đổi thành "số liệu chui" vào BOQ                       | Mặc định 0; cột tách bạch; quyền phát hành rule pack = Admin/PM; Excel ghi rõ hệ số đã dùng                      |
| Phình rule pack khó bảo trì                                      | Validator chặt + mỗi khối `enabled`; tài liệu hóa từng khóa trong file rule pack (mô tả tiếng Việt như hiện tại) |
| **Open:** thứ tự PR2 vs PR3; per-project rule pack đợi UAT M100? | **Chờ người dùng chốt khi duyệt**                                                                                |

## 19. Approval

- [x] Product/scope — Seeker 2026-08-25 ("ok duyệt tất cả")
- [x] Architecture/data — [x] Open §18 đã chốt (xem State)
- [ ] Security (boq-snapshot, per-project — rà `docs/audit.md` vùng rủi ro cao khi code PR4)
- [ ] Test/rollout (checklist tích hợp theo release)

**Kết luận:** **Approved for implementation.** Khi triển khai, nối với M100 §20 (tag trùng = phép kiểm 17; giá đỡ/sleeve vào bóc theo vùng).
**Người/ngày duyệt:** Seeker — 2026-08-25.
