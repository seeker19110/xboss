# Bộ bản vẽ mẫu — kiểm tích hợp plugin (M99 §15)

Hai tệp DXF cam kết trong repo, **sinh bằng script** (`npm run cad:mau-ban-ve`) chứ không sửa tay —
`npm run cad:mau-ban-ve -- --kiem` báo đỏ nếu tệp lệch script. Cùng một hình học, khác đơn vị vẽ:

| Tệp                  | `$INSUNITS` | Ghi chú                                       |
| -------------------- | ----------- | --------------------------------------------- |
| `mau-01-mep-mm.dxf`  | 4 (mm)      | Bản chuẩn                                     |
| `mau-02-mep-met.dxf` | 6 (m)       | Toạ độ = bản mm chia 1000 (dùng cho **AC13**) |

## Dị tật cố ý và tiêu chí bám vào

| Nội dung trong tệp                                                                                                                                                      | Dùng cho                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 4 layer sai chuẩn (`01_M_ONG_GIO_CAP_CHINH`, `03_P_ONG_NUOC_LANH_CHW`, `08_G_GHI_CHU_DIM_TEXT`) + 1 layer không thuộc hệ nào (`ZZZ_KHONG_KHOP_GI`, phải **giữ nguyên**) | **AC1** ánh xạ layer + fallback                          |
| `TEXT` mã TCVN3 `TÇng 5 - Phßng m¸y l¹nh`                                                                                                                               | **AC2** giải mã font tiếng Việt                          |
| 1 đoạn ống ở cao độ `Z = 2800`                                                                                                                                          | **AC3** ép phẳng giữ nguyên hình chiếu XY                |
| 1 `LWPOLYLINE` **kín** + 1 `LWPOLYLINE` **hở** hai đầu cách 3 mm                                                                                                        | **AC9** polyline hở/gần kín: liệt kê, không đo diện tích |
| 3 đoạn `LINE` trên layer nước lạnh                                                                                                                                      | **AC10** bóc chiều dài, đánh dấu XData, chạy lần 2 ra 0  |
| Cặp mm/mét cùng hình học                                                                                                                                                | **AC13** quy đổi `INSUNITS` trước khi áp `factor`        |

## Ai dùng bộ mẫu này

- **Ngay bây giờ (CI Linux):** `tests/cad-mau-ban-ve.test.ts` canh cho bộ mẫu không mục — tệp còn
  hợp lệ, còn đủ dị tật, bản mét vẫn đúng bằng bản mm chia 1000.
- **PR7b (runner Windows có license):** chạy qua `accoreconsole.exe` để kiểm AC1–AC4 và AC9–AC13
  thật trong AutoCAD, gồm round-trip UNDO và XData sống qua đóng/mở tệp.

Đối chứng **quy tắc** giữa 2 tầng (AC6, không cần AutoCAD) nằm ở `../doi-chung/`.
