# M106 — Hoàn thiện 2D: nhãn cao độ, legend, clash xref, lỗ chờ, annotative, giá đỡ, dốc ống, ống gió 2 nét

| Mục           | Nội dung                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| State         | **Approved for implementation** — người dùng chốt "tích hợp hết" 2026-08-25                                                            |
| Phụ thuộc     | M105 (rule pack v9). Đợt này mở rule pack **v10** — mọi khóa mới mặc định TẮT/`reportOnly` (tiền lệ v8/v9), tắt hết → hành vi y hệt v9 |
| Ngoài phạm vi | A* tránh vật cản, P&ID thông minh, 3D/BIM, block động (ranh giới M101 §1 giữ nguyên)                                                   |

## 1. Nhãn cao độ EL/BOD + đổi cao độ (PR-1)

- `XBOSS_VE_CAODO`: gán cao độ cho tuyến đã chọn (nhập EL hoặc BOD, mm) → ghi XData `XBOSS_VE`
  khối `caoDo {kieu: "EL"|"BOD", mm}` + đặt nhãn text theo mẫu rule pack `dimSettings.caoDo.mau`
  (vd `BOD +2750`). Điểm tuyến ĐỔI cao độ: người dùng bấm điểm → chèn ký hiệu set-up/set-down
  (block từ thư viện, id khai `drawTools.caoDo.setUpBlockId`/`setDownBlockId`) + nhãn 2 cao độ.
- Phép kiểm v10 số 19 (`reportOnly`): tuyến có nhãn cao độ mà 2 đoạn nối nhau lệch cao độ nhưng
  KHÔNG có ký hiệu đổi cao độ giữa chúng → cảnh báo.
- Idempotent: chạy lại trên tuyến đã có cao độ → cập nhật nhãn, không nhân đôi.

## 2. Legend tự sinh (PR-2)

`XBOSS_VE_LEGEND`: quét model space — tập block thư viện + layer hệ + kiểu nét THỰC DÙNG →
dựng bảng chú giải (ký hiệu | tên | ghi chú từ manifest/`layerMap`) tại điểm chỉ định hoặc vào
layout, style bảng như `XBOSS_VE_THONGKE`. Chạy lại → thay bảng cũ (XData đánh dấu), không nhân
đôi. Block không thuộc thư viện → gom mục "Ký hiệu khác" kèm cảnh báo.

## 3. Clash 2D với xref kiến trúc/kết cấu (PR-3)

- Rule pack v10 `inspect.xrefClash`: khai pattern layer tường/dầm/cột trong xref (vd `A-WALL*`,
  `S-BEAM*`) + hệ nào bị cấm cắt lớp nào + khe hở tối thiểu mm.
- Phép kiểm 20 (`reportOnly` mặc định): duyệt thực thể trong xref đã nạp (side database của
  xref, chỉ đọc), giao với tuyến MEP → báo vị trí + hệ + lớp va. KHÔNG sửa gì, chỉ báo (sửa là
  việc của kỹ sư/riser). Kết quả vào báo cáo JSON + `XBOSS_BANG`.
- Xref chưa nạp/thiếu tệp → báo rõ, không coi là "không va".

## 4. Bản vẽ lỗ chờ (builder's work) từ sleeve (PR-4)

`XBOSS_VE_LOCHO_BW`: từ các sleeve đã đặt (dữ liệu `SleeveSchedule` sẵn có) sinh **layout mới**
"BW-<tầng>": mặt bằng chỉ còn trục + tường (xref giữ), mỗi lỗ chờ = ký hiệu + tag + bảng kích
thước/cao độ — đúng định dạng gửi nhà thầu kết cấu. Xuất kèm Excel lỗ chờ (tái dùng writer).

## 5. Annotative scale (PR-5)

Mọi text/nhãn/tag do `XBOSS_VE_*` sinh chuyển sang **annotative** (bật `Annotative` trên style
từ rule pack `sheetSetup.annotative: true`, thêm scale hiện hành vào object). Tắt khóa → hành vi
cũ (text thường) để không phá bản vẽ đang dở. Kiểm: in 2 viewport tỷ lệ khác nhau nhãn vẫn đúng
cỡ giấy.

## 6. Giá đỡ tự rải theo spacing (PR-6)

`XBOSS_VE_GIADO`: chọn tuyến → rải block giá đỡ (id theo hệ+size từ `drawTools.supports`, spacing
từ rule khoảng cách sẵn có của SupportSpacing) dọc tuyến: bắt đầu/kết thúc cách đầu tuyến theo
rule, thêm giá tại 2 bên co/tê nếu rule đòi. Đánh dấu XData bóc tách (đếm vào KL như giá đỡ đặt
tay). Idempotent: tuyến đã rải → hỏi rải lại (xóa lứa cũ do lệnh sinh) hay giữ.

## 7. Độ dốc ống thoát (PR-7)

- `XBOSS_VE_DOC`: gán độ dốc i% cho tuyến thoát (hệ khai `drainage: true` trong layerMap) → nhãn
  `i=1.0%` + mũi tên hướng dốc; nếu 2 đầu tuyến đã có cao độ (mục 1) thì tự tính i và đối chiếu.
- Phép kiểm 21 (`reportOnly`): tuyến thoát có cao độ 2 đầu mà i thực ≠ i nhãn (dung sai
  `inspect.doDoc.dungSaiPhanTram`) hoặc dốc NGƯỢC hướng thoát → báo.

## 8. Ống gió 2 nét (double-line duct) (PR-8 — lớn nhất đợt)

- Rule pack v10 `drawTools.duct`: hệ gió khai `renderMode: "double"` + bảng size chữ nhật
  (`WxH`), bán kính cút theo W, kiểu chuyển tiếp (thẳng tâm/lệch tâm), damper/fitting id block.
- `XBOSS_VE` với hệ gió ở chế độ double: vẽ 2 nét song song cách nhau W (scale bản vẽ), tự dựng
  cút 2 nét tại góc rẽ (cung trong/ngoài), **chuyển tiếp** khi đổi size (dài theo rule
  `chuyenTiepDoDaiToiThieu`), tê/chạc gió, bịt đầu. Nhãn `WxH`. XData bóc tách ghi size chữ nhật
  → `TakeoffCalculator` tính diện tích tôn theo chu vi×dài (mở rộng `TakeoffSize` nhận WxH — đã
  có nguồn size từ nhãn/XData, thêm parse `400x250`).
- `XBOSS_VE_AUTO` (M105 PR-H) chạy được với duct double (routing xong dựng 2 nét theo cùng lõi).
- Single-line giữ nguyên cho hệ khai `renderMode: "single"` — bản vẽ cũ không đổi.

## Kế hoạch PR

| PR   | Nội dung                                   | route:   | Phụ thuộc             |
| ---- | ------------------------------------------ | -------- | --------------------- |
| PR-1 | Cao độ EL/BOD + set-up/down + phép kiểm 19 | complex  | v10                   |
| PR-2 | Legend tự sinh                             | standard | v10                   |
| PR-3 | Clash xref + phép kiểm 20                  | complex  | v10                   |
| PR-4 | Bản vẽ lỗ chờ BW                           | standard | —                     |
| PR-5 | Annotative                                 | standard | v10                   |
| PR-6 | Giá đỡ tự rải                              | standard | v10                   |
| PR-7 | Độ dốc + phép kiểm 21                      | standard | PR-1                  |
| PR-8 | Ống gió 2 nét + KL tôn                     | complex  | v10, nên làm sau PR-1 |

AC chung: mọi lệnh 1 UNDO + idempotent; khóa v10 tắt → y hệt v9; test Core hình học chạy shim;
KL từ thực thể lệnh sinh khớp bóc tay cùng hình (test đối chứng); tài liệu cập nhật khi đóng đợt.
