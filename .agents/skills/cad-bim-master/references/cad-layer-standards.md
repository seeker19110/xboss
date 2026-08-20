# HỆ THỐNG CHUẨN LAYER CAD & BẢNG MÃ MÀU MEPF (AIA / BS1192 STANDARDS)

Tài liệu quy định cấu trúc tên layer, mã màu AutoCAD Index Color (ACI) và trọng số nét vẽ (Lineweight) chuẩn cho toàn bộ dự án trên XBoss.

---

## 1. Cấu Trúc Đặt Tên Layer (AIA Standard Naming Convention)

Cú pháp chuẩn: `<Ngành>-<Hệ thống>-<Thực thể>-<Mô tả/Trạng thái>`

| Ký hiệu Ngành | Ý nghĩa                                | Ví dụ hệ thống                                                                                          |
| :------------ | :------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **`M-`**      | Cơ khí & HVAC (Mechanical)             | `M-HVAC-DUCT` (Ống gió), `M-HVAC-PIPE` (Ống Chiller), `M-HVAC-EQPM` (Thiết bị AHU/FCU)                  |
| **`P-`**      | Cấp thoát nước (Plumbing & Sanitation) | `P-PLUM-DOMW` (Cấp nước sinh hoạt), `P-PLUM-SANR` (Thoát nước thải), `P-PLUM-VENT` (Thông hơi)          |
| **`F-`**      | Phòng cháy chữa cháy (Fire Fighting)   | `F-PROT-SPKL` (Đầu phun Sprinkler), `F-PROT-PIPE` (Ống cứu hỏa chính), `F-PROT-EQPM` (Tủ vòi PCCC)      |
| **`E-`**      | Điện & Điện nhẹ (Electrical & ELV)     | `E-POWR-CABL` (Cáp nguồn), `E-POWR-TRAY` (Máng cáp), `E-LITE-FIXT` (Đèn), `E-COMM-DATA` (Mạng Lan/CCTV) |
| **`S-`**      | Kết cấu (Structural)                   | `S-COLS` (Cột), `S-BEAM` (Dầm), `S-SLAB` (Sàn), `S-WALL` (Vách)                                         |
| **`A-`**      | Kiến trúc (Architectural)              | `A-WALL` (Tường xây), `A-DOOR` (Cửa đi), `A-GLAZ` (Vách kính/Cửa sổ)                                    |

---

## 2. Bảng Mã Màu (ACI) & Trọng Số Nét Vẽ Chuẩn

| Tên Layer          | Mô tả Thực thể                           |      Mã màu ACI      | RGB Tương đương | Lineweight (mm) |
| :----------------- | :--------------------------------------- | :------------------: | :-------------: | :-------------: |
| `M-HVAC-DUCT-SUPP` | Ống gió cấp (Supply Air Duct)            |     **4 (Cyan)**     |  `0, 255, 255`  |     0.35 mm     |
| `M-HVAC-DUCT-RETN` | Ống gió hồi (Return Air Duct)            |   **6 (Magenta)**    |  `255, 0, 255`  |     0.35 mm     |
| `M-HVAC-DUCT-EXHT` | Ống gió thải/hút khói (Exhaust)          |     **1 (Red)**      |   `255, 0, 0`   |     0.35 mm     |
| `M-HVAC-PIPE-CHWS` | Ống Chiller Cấp (Cold Supply)            |     **5 (Blue)**     |   `0, 0, 255`   |     0.40 mm     |
| `M-HVAC-PIPE-CHWR` | Ống Chiller Hồi (Cold Return)            |  **150 (Sky Blue)**  |  `0, 127, 255`  |     0.40 mm     |
| `P-PLUM-DOMW-COLD` | Ống cấp nước lạnh sinh hoạt              |    **3 (Green)**     |   `0, 255, 0`   |     0.35 mm     |
| `P-PLUM-DOMW-HOTP` | Ống cấp nước nóng                        |    **2 (Yellow)**    |  `255, 255, 0`  |     0.35 mm     |
| `P-PLUM-SANR-SOIL` | Ống thoát phân/nước bẩn (uPVC/HDPE)      |   **30 (Orange)**    |  `255, 127, 0`  |     0.40 mm     |
| `F-PROT-PIPE-MAIN` | Ống chính chữa cháy vách tường/Sprinkler |     **1 (Red)**      |   `255, 0, 0`   |     0.50 mm     |
| `E-POWR-TRAY-MAIN` | Máng cáp điện động lực (Cable Tray)      |    **2 (Yellow)**    |  `255, 255, 0`  |     0.30 mm     |
| `E-COMM-TRAY-DATA` | Máng cáp điện nhẹ (ELV Trunking)         | **130 (Cyan/Green)** |  `0, 255, 127`  |     0.30 mm     |
| `*-*-ANNO-TEXT`    | Văn bản ghi chú, kích thước (Dimension)  | **7 (White/Black)**  | `255, 255, 255` |     0.18 mm     |
| `*-*-ANNO-DIMS`    | Đường kích thước đo đạc                  |  **8 (Dark Gray)**   | `128, 128, 128` |     0.13 mm     |

---

## 3. Quy Chuẩn Xử Lý Bảng Mã Font Tiếng Việt trong Bản Vẽ Cũ

Khi phân tích bản vẽ DWG/DXF cũ, bắt buộc chuyển đổi các chuỗi ký tự theo bảng ánh xạ:

1. **TCVN3 (ABC) sang UTF-8:**
   - Ký tự `a` có dấu: `¸` $\rightarrow$ à, `µ` $\rightarrow$ ả, `·` $\rightarrow$ ã, `¹` $\rightarrow$ á, `¹` $\rightarrow$ ạ.
   - Ký tự `ă` có dấu: `¨` $\rightarrow$ ă, `»` $\rightarrow$ ằ, `¾` $\rightarrow$ ẳ, `Æ` $\rightarrow$ ẵ, `¾` $\rightarrow$ ắ, `Æ` $\rightarrow$ ặ.
   - Ký tự `đ`: `®` $\rightarrow$ đ, `§` $\rightarrow$ Đ.
2. **VNI-Windows sang UTF-8:**
   - Số đuôi dấu thanh: `1` $\rightarrow$ sắc, `2` $\rightarrow$ huyền, `3` $\rightarrow$ hỏi, `4` $\rightarrow$ ngã, `5` $\rightarrow$ nặng.
   - Ký tự gốc kèm dấu mũ: `a8` $\rightarrow$ ă, `a6` $\rightarrow$ â, `e6` $\rightarrow$ ê, `o6` $\rightarrow$ ô, `o7` $\rightarrow$ ơ, `u7` $\rightarrow$ ư, `d9` $\rightarrow$ đ.
