# Kết quả verify tay plugin AutoCAD — 2026-08-30

- Thời điểm: `2026-08-30T20:59:34+07:00`
- AutoCAD: 2026 Education, tiến trình `acad.exe`
- Plugin đang chạy: `1.0.0+94cf0b7cc2f1764041cf7537543d822eb07a9a70`
- DLL đã cài: `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\Contents\XBoss.Cad.Acad.dll`
- SHA-256 DLL: `e76dfa0e6b59189d330c8e5fb9615a031872d28e4119445bc991baa038a327e2`
- Rule pack cache: `v15` — 14 quy tắc bóc tách, 7 nhóm layer
- Thư viện block cache: `mepf-offline-v1` — 12 block
- Bản vẽ disposable: `xboss-manual-smoke.dwg` trong chính thư mục bằng chứng này; `Saved = true` sau verify.
- Không mở/sửa bản vẽ dự án thật; không đăng nhập server; không upload.

## Kết quả

| Phạm vi                        | Trạng thái                   | Bằng chứng / ghi chú                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin runtime + Ribbon        | **PASS**                     | Plugin nạp từ bundle đã cài; tab `XBOSS` xuất hiện; ribbon có 5 panel theo quy trình ở chiều rộng đang dùng.                                                                                                                                                                                            |
| `XBOSS_BANG` — mở palette      | **PASS**                     | Palette mở được, có đúng 2 tab `Quy trình` / `Trạng thái`; thao tác đổi tab thành công.                                                                                                                                                                                                                 |
| C15.129 — tab Quy trình        | **PASS**                     | Có 6 thẻ, vệt màu trái, chip trạng thái, thanh `Làm mới` dính đầu tab và ngữ cảnh `Đã xong 0/6 bước`. Ảnh `workflow-wide.png`.                                                                                                                                                                          |
| C15.130 — tab Trạng thái       | **PASS**                     | Các khối hiện thành thẻ; cảnh báo thiết bị chưa ghép có vệt cam; header báo `1 cảnh báo`; bấm `Làm mới` không văng lỗi và nội dung giữ đúng. Ảnh `status-tab.png`.                                                                                                                                      |
| C15.131 — màu rê/nhấn          | **PARTIAL PASS**             | Đã đo đại diện đủ 3 kiểu nút: `Chính` (`Kiểm tra`) hover/nhấn đậm dần; `Phụ` (`Làm mới`) hover sáng vừa, nhấn chìm; `Chìm` (`Chia đốt`) hover nổi vừa, nhấn về nền chìm. Không rơi về mảng sáng hệ thống. Số RGB ở `hover-probe.json`. Chưa rê qua _mọi_ nút của cả hai tab nên chưa đóng toàn mục 131. |
| C15.132 — kéo hẹp/rộng palette | **FAIL**                     | Kéo palette xuống rộng 631 px vật lý (~300 px ảnh): chữ xuống dòng, nút xuống hàng, không thấy nội dung tràn khỏi thẻ, **nhưng xuất hiện thanh cuộn ngang nội bộ ở đáy palette**. Trái tiêu chí “KHÔNG sinh thanh cuộn ngang”. Ảnh `palette-narrow-horizontal-overflow.png`.                            |
| C15.133 — hộp thoại WPF        | **PARTIAL PASS**             | `XBOSS_VE` có dải tiêu đề trong thân + gạch phân cách. Xóa trắng Size làm `OK` khóa; vùng lý do có vệt trái cam + ký hiệu cấm/cảnh báo; điền hợp lệ đổi sang `✓` xanh. Lý do hiện tại vừa một dòng nên chưa chứng minh được ca lý do dài phải wrap. Ảnh `dialog-xboss-ve-invalid.png`.                  |
| C7.38 — nút mờ vẫn bấm được    | **PASS (guard/UI)**          | Bấm nút mờ `Chia đốt` trên bản vẽ trắng vẫn mở `XBOSS_VE_CHIADOT`; dialog báo rõ 0 tuyến và khóa `OK`, không sửa bản vẽ. Ảnh `dialog-chiadot-guard.png`.                                                                                                                                                |
| An toàn bản vẽ/cache           | **PASS trong phạm vi phiên** | Chỉ dùng bản vẽ disposable; đóng các dialog bằng Hủy; tài liệu vẫn `Saved = true`. Hash cache rule pack/block library sau phiên nằm trong `runtime-state.json` và khớp lần chụp trước thao tác.                                                                                                         |

## Chưa verify trong phiên này

- Toàn bộ các ca nghiệp vụ hình học/khối lượng/server của C1–C14 ngoài guard/UI nêu trên.
- C15.131 trên **mọi** nút; C15.133 với một câu lý do đủ dài để buộc xuống dòng.
- C15.132 hiện **đang đỏ**, vì vậy chưa được đánh dấu hoàn tất C15/M119.

## Tệp bằng chứng

- `runtime-state.json` — trạng thái runtime, tài liệu, hash DLL/cache.
- `hover-probe.json` — số đo màu nền nút thường/rê/nhấn tại thời điểm palette đang mở.
- `workflow-wide.png`
- `status-tab.png`
- `dialog-xboss-ve-invalid.png`
- `dialog-chiadot-guard.png`
- `palette-narrow-horizontal-overflow.png`
- `ribbon-xboss.png`
