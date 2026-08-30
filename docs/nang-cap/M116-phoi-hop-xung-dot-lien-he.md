# M116 — Đặc tả Phối hợp xung đột 2D liên hệ (combined services)

| Thuộc tính | Giá trị |
| --- | --- |
| Issue / Goal | Phát hiện + đề xuất xử lý xung đột giữa các hệ MEPF trên bản vẽ 2D tổng hợp; kỹ sư quyết |
| Spec owner | Phiên chính (opusplan) |
| State | Draft — chờ duyệt (ngã rẽ "đề xuất, kỹ sư quyết" đã được người dùng chốt 2026-08-28) |
| Người/ngày duyệt | (chờ) |
| Cập nhật | 2026-08-30 |
| Phụ thuộc | M115 (đồ thị tuyến có cao độ/size trong XData); M109 (`crossingPolicy`); M101 phép kiểm clash 2D |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Bản vẽ combined services (tổng hợp các hệ ACMV/nước/điện/PCCC trên cùng mặt bằng) hiện phối hợp
tay: kỹ sư xref các hệ lên nhau, tự nhìn ra chỗ ống gió đè máng cáp, hai hệ cùng cao độ trong
hành lang hẹp… Phép kiểm clash 2D của M101 (phép kiểm 11) mới chỉ **báo giao cắt hình học trong
một bản vẽ**, chưa xét cao độ, chưa xét liên hệ giữa nhiều hệ, và không đề xuất cách xử lý.
Sau M115, mọi tuyến đã mang XData hệ/size/cao độ ⇒ đủ dữ liệu để phối hợp thật sự trên 2D.

## 2. Outcome, metric và guardrail

- **Target:** phát hiện ≥90% xung đột cao độ/không gian mà kỹ sư trưởng tìm ra tay trên bộ bản vẽ
  pilot; mỗi xung đột kèm ≥1 đề xuất xử lý khả thi; thời gian họp phối hợp giảm ≥50%.
- **Guardrail:** plugin **không bao giờ tự sửa tuyến** — chỉ đánh dấu + đề xuất; kỹ sư chấp nhận
  từng đề xuất mới có thay đổi (và thay đổi = quy về thao tác M115: sửa cao độ XData rồi chạy lại
  hoàn thiện). Mọi khoá mới trong rule pack mặc định TẮT/`reportOnly`.
- **Stop/rollback:** tắt khoá rule pack; không migration.

## 3. Nghiên cứu hiện trạng

- Phép kiểm 11 (M101, `Core/Inspection/PhepKiemMoRong.cs` + `Geometry/Segment2D.cs`): dò giao cắt
  2D — tái dùng bộ dò, mở rộng thêm chiều cao độ.
- `crossingPolicy.priority` (M109): thứ tự trên–dưới giữa các hệ khi giao chéo — chính là bảng ưu
  tiên nhường đường, tái dùng làm luật đề xuất.
- M115 `Core/Graph/`: tuyến + cao độ + size; `XBOSS_VE_HANHLANG`/M114 `CapPhatLanTang`: khái niệm
  làn/tầng cao độ trong hành lang — tái dùng để kiểm "hết chỗ trong hành lang".
- Xref: `xrefPolicy` rule pack + phần đọc xref của `dxf-parser.ts`; lệnh `XBOSS_BATCH` quét nhiều file.

## 4. Phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Kết luận |
| --- | --- | --- | --- |
| Không làm | 0 | Phối hợp tay, sót xung đột tới hiện trường | Loại |
| A. Tự động dời tuyến khi phát hiện xung đột | Nhanh | Phá quyết định constructability của kỹ sư, trái ngã rẽ đã chốt 2026-08-28 | Loại |
| **B. Phát hiện + đề xuất, kỹ sư quyết (đã chốt)** | An toàn, minh bạch, tái dùng M101/M109/M114/M115 | Kỹ sư vẫn phải thao tác chấp nhận | **Chọn** |

## 5. Scope / non-goals

**Scope:** kiểm xung đột giữa các tuyến M115 (cùng bản vẽ hoặc qua xref các hệ khác), 3 lớp kiểm;
bảng xung đột + đánh dấu trên bản vẽ; đề xuất xử lý theo luật; báo cáo phối hợp nộp về server.
**Non-goals:** clash 3D/BIM; tự sửa hình học; phối hợp với kết cấu/kiến trúc ngoài lớp vật cản đã
có (dầm/tường từ `XBOSS_VE_HANHLANG`); realtime nhiều người.

## 6. User journey

1. Kỹ sư mở bản vẽ combined (hoặc bản vẽ hệ mình + xref các hệ khác đã làm theo M115).
2. `XBOSS_PHOIHOP` → chọn phạm vi (cả bản vẽ / vùng cửa sổ / theo hành lang) → plugin quét:
   - **Lớp 1 — giao cắt cùng cao độ:** hai tuyến khác hệ giao nhau mà dải cao độ (cao độ ± nửa bề
     cao gồm cách nhiệt, từ XData M115 + kích thước rule pack) chồng lấn ⇒ xung đột CỨNG.
   - **Lớp 2 — tranh chấp hành lang:** tổng bề rộng các tuyến song song trong một hành lang (+
     khoảng bảo trì `routingPolicy`) vượt bề rộng hành lang ⇒ xung đột MỀM.
   - **Lớp 3 — khoảng cách quy phạm:** cặp hệ có khoảng cách tối thiểu trong rule pack (vd điện ↔
     nước) gần hơn ngưỡng ⇒ CẢNH BÁO.
3. Hộp thoại M106 liệt kê xung đột (lọc theo hệ/mức), bấm dòng → zoom tới vị trí, vẽ marker trên
   layer riêng `XBOSS-PHOIHOP` (không đụng tuyến).
4. Mỗi xung đột kèm đề xuất sinh từ luật: "hệ X nhường (đổi cao độ xuống z theo `crossingPolicy.priority`)",
   "dịch sang làn trống trong hành lang", "cần fitting vượt (két nước/ống mềm)". Kỹ sư đánh dấu
   từng dòng: *chấp nhận (tự sửa tay)* / *bỏ qua có lý do* — trạng thái ghi XData marker.
5. `XBOSS_PHOIHOP_BAOCAO` xuất bảng xung đột (Excel qua `Core/Excel/`) + đính vào upload phiên;
   web hiển thị trên bảng điều khiển `/engineering/chuan-hoa-ban-ve` (đếm mở/đã xử lý theo bản vẽ).

Trạng thái: không có tuyến M115 nào ⇒ thông báo hướng dẫn chạy M115 trước; xref thiếu ⇒ liệt kê
file thiếu, vẫn kiểm phần có mặt.

## 7. FR/NFR chính

- **FR1** `XBOSS_PHOIHOP`: quét 3 lớp kiểm trên tuyến mang XData M115 (kể cả tuyến trong xref
  — chỉ đọc); kết quả có id ổn định (hash cặp tuyến + vị trí) để chạy lại không nhân đôi.
- **FR2** Marker trên layer `XBOSS-PHOIHOP`, wipeout-safe, xoá toàn bộ bằng `XBOSS_PHOIHOP_XOA`.
- **FR3** Đề xuất chỉ từ bảng luật rule pack (`coordinationPolicy`: priority kế thừa
  `crossingPolicy`, khoảng cách tối thiểu theo cặp hệ, khoảng bảo trì) — không heuristic ngầm.
- **FR4** Trạng thái xử lý từng xung đột bền qua các lần chạy (XData marker), vào báo cáo phiên.
- **FR5** Rule pack +1 version: khối `coordinationPolicy`, mặc định TẮT.
- **NFR:** quét 2.000 đoạn tuyến × 4 hệ <5s (sweep line, tái dùng chỉ mục của phép kiểm 11);
  không mạng khi quét; tiếng Việt toàn bộ.

## 8. Acceptance criteria (rút gọn)

- **AC1** Hai tuyến khác hệ giao nhau, dải cao độ chồng ⇒ 1 xung đột CỨNG kèm đề xuất đúng chiều
  ưu tiên `priority`; cùng vị trí nhưng dải cao độ tách ⇒ không báo (test Core).
- **AC2** Chạy `XBOSS_PHOIHOP` 2 lần ⇒ danh sách và marker không nhân đôi; trạng thái "bỏ qua có
  lý do" giữ nguyên.
- **AC3** `XBOSS_PHOIHOP_XOA` trả bản vẽ về đúng trạng thái trước (tuyến không đổi từng byte).
- **AC4** Rule pack mới mặc định tắt ⇒ hành vi mọi lệnh cũ y hệt version trước.
- **AC5** Báo cáo Excel + số liệu trên web khớp danh sách trong hộp thoại.

## 9. Kiến trúc và điểm chạm code

- `XBoss.Cad.Core/Coordination/` (mới): `QuetXungDot.cs` (3 lớp kiểm), `DeXuatXuLy.cs`,
  `XungDotId.cs` — thuần, test CI. Tái dùng `Geometry/Segment2D`, dữ liệu làn M114.
- `XBoss.Cad.Acad/Commands/`: `PhoiHopCommand.cs`, `PhoiHopXoaCommand.cs`, `PhoiHopBaoCaoCommand.cs`;
  đọc xref qua snapshot builder hiện có.
- `Ui/`: ViewModel bảng xung đột + DataTemplate; `LenhCatalog.cs` thêm 3 lệnh (giai đoạn "Kiểm").
- Web: rule pack version mới + validator; bảng điều khiển thêm ô "Phối hợp liên hệ" đọc từ báo
  cáo phiên upload (không API mới ngoài payload upload hiện có; nếu payload cần trường mới —
  thêm optional, backward-compatible).
- **Không migration** (số liệu nằm trong báo cáo phiên JSON đã lưu theo cơ chế upload hiện hành).

## 10. Chia PR

| PR | Nội dung | route: |
| --- | --- | --- |
| PR1 | Rule pack `coordinationPolicy` + validator + `Core/Coordination/` + test | `complex` (ranh giới quyết: cấu trúc id xung đột + thuật toán quét; không đổi lệnh cũ) |
| PR2 | 3 lệnh Adapter + hộp thoại + marker/XData | `spec` |
| PR3 | Báo cáo Excel + hiển thị web + tài liệu + mục verify | `standard` |

## 11. Điều kiện tiên quyết & rủi ro

- Chạy sau khi M115 phát hành pilot (cần XData cao độ phủ đủ); chung cổng verify tay AutoCAD 2026.
- Rủi ro: bản vẽ hệ khác chưa làm theo M115 ⇒ lớp 1/2 khuyết dữ liệu cao độ — xử lý: tuyến thiếu
  cao độ chỉ vào lớp kiểm giao cắt phẳng (như phép kiểm 11) kèm nhãn "thiếu cao độ", không đoán.
