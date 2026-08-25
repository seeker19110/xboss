# M107 — MEPF trọn nghĩa: Fire (sprinkler) + Electrical 2D

| Mục           | Nội dung                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State         | **Approved for implementation** — người dùng chốt "tích hợp hết" 2026-08-25                                                                                                           |
| Phụ thuộc     | M105, M106 (rule pack v10). Đợt này mở **v11** — khóa mới mặc định TẮT (tiền lệ)                                                                                                      |
| Ngoài phạm vi | Tính toán thủy lực sprinkler/chọn bơm, tính sụt áp/chọn dây theo IEC (chỉ VẼ + ĐẾM + schedule; tính toán kỹ thuật là việc kỹ sư/`lib/ky-thuat` phía web đã có mô-đun hydraulic riêng) |

## 1. Fire — rải sprinkler theo coverage (PR-1, PR-2)

- Rule pack v11 `fire.sprinkler`: bán kính bảo vệ theo loại đầu phun (khai theo TCVN 7336/NFPA 13
  do CÔNG TY tự điền — plugin không hard-code tiêu chuẩn), khoảng cách tối đa đầu-đầu, đầu-tường,
  block id đầu phun (up/down/sidewall), hệ layer.
- `XBOSS_VE_SPRINKLER` (PR-1): chọn vùng phòng (polyline kín hoặc bấm vùng) → rải lưới đầu phun
  đều (so le tuỳ chọn) thoả khoảng cách rule; hiện vòng tròn coverage tạm khi preview; đầu phun
  mang XData bóc tách (đếm KL). Idempotent: vùng đã rải → hỏi rải lại/giữ.
- Phép kiểm 22 (PR-2, `reportOnly`): vùng khai là phòng (theo layer ranh phòng khai trong rule)
  có điểm nằm ngoài coverage mọi đầu phun, hoặc 2 đầu gần hơn khoảng cách tối thiểu → báo kèm toạ
  độ. Tuyến ống nhánh nối đầu phun vẽ bằng `XBOSS_VE`/`XBOSS_VE_AUTO` như hệ ống thường.

## 2. Electrical — đi dây, KL cáp, panel schedule, 1 sợi (PR-3 → PR-6)

- Rule pack v11 `electric`: layer hệ điện (động lực/chiếu sáng/ELV...), kiểu nét home-run, block
  thiết bị (đèn, ổ cắm, tủ...), bảng mã mạch.
- **PR-3 — `XBOSS_VE_DAY`**: vẽ tuyến dây (polyline/spline nhẹ theo `electric.kieuDay`) nối
  thiết bị → tủ; gán **mã mạch** (`L1-1`...) qua prompt/hộp thoại, ghi XData lên cả dây lẫn thiết
  bị; ký hiệu home-run (mũi tên + mã mạch) khi kết thúc giữa chừng. Gạch chéo đếm ruột dây
  (2/3/4 vạch) theo rule.
- **PR-4 — KL cáp**: `TakeoffScanner`/`TakeoffCalculator` mở rộng: dây đo chiều dài theo mạch
  (cộng hệ số chùng `electric.heSoChung`, cộng cao độ lên/xuống từ nhãn cao độ M106 nếu có);
  thiết bị đếm theo block. Excel thêm sheet `Cap-theo-mach`.
- **PR-5 — Panel schedule**: `XBOSS_VE_TUDIEN`: từ các mạch đã gán về 1 tủ → bảng schedule
  (mạch | mô tả | số thiết bị | chiều dài cáp) đặt vào layout, style bảng thống kê sẵn có; đồng
  thời xuất Excel. Dữ liệu công suất/CB **không bịa** — chỉ hiện cột trống cho kỹ sư điền, hoặc
  đọc từ attribute block thiết bị nếu công ty khai (`electric.congSuatAttr`).
- **PR-6 — Sơ đồ 1 sợi (single-line)**: `XBOSS_VE_1SOI`: từ danh sách tủ + mạch đã khai trong
  bản vẽ → sinh sơ đồ 1 sợi dạng schematic vào layout riêng (tủ tổng → tủ tầng → mạch), block ký
  hiệu từ thư viện, chỉ TOPOLOGY (không chọn CB/cáp hộ kỹ sư).
- Phép kiểm 23 (`reportOnly`, gộp PR-3): thiết bị điện có XData mạch mà mã mạch không tồn tại ở
  tủ nào / dây không nối về tủ → báo.

## Kế hoạch PR

| PR   | Nội dung                                           | route:   | Phụ thuộc  |
| ---- | -------------------------------------------------- | -------- | ---------- |
| PR-1 | `XBOSS_VE_SPRINKLER` rải theo coverage             | complex  | v11        |
| PR-2 | Phép kiểm coverage 22                              | standard | PR-1       |
| PR-3 | `XBOSS_VE_DAY` + mã mạch + home-run + phép kiểm 23 | complex  | v11        |
| PR-4 | KL cáp theo mạch + Excel                           | complex  | PR-3       |
| PR-5 | Panel schedule                                     | standard | PR-3       |
| PR-6 | Sơ đồ 1 sợi                                        | complex  | PR-3, PR-5 |

AC chung: như M106 (1 UNDO, idempotent, khóa tắt = không đổi hành vi, test Core trên shim, không
hard-code tiêu chuẩn/thông số kỹ thuật — tất cả qua rule pack, thiếu khai thì lệnh từ chối chạy
kèm hướng dẫn tiếng Việt).
