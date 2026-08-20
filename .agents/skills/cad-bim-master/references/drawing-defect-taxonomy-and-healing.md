# CẨM NANG PHÂN LOẠI 12 DỊ TẬT BẢN VẼ & GIẢI THUẬT TỰ CHỮA LÀNH (DRAWING DEFECT TAXONOMY & AUTO-HEALING)

Tài liệu này định nghĩa chi tiết 12 dạng dị tật bản vẽ đầu vào (từ 2D CAD DWG/DXF đến mô hình 3D IFC/Revit), các tiêu chí nhận diện và giải thuật tự động nắn chỉnh/chữa lành cho nền tảng XBoss.

---

## 1. MA TRẬN 12 DẠNG DỊ TẬT BẢN VẼ

|  STT   | Nhóm Dị tật                | Dạng lỗi cụ thể                                  | Biểu hiện nhận biết                                                                                 | Mức độ rủi ro | Giải thuật xử lý tự động                                                                                                      |
| :----: | :------------------------- | :----------------------------------------------- | :-------------------------------------------------------------------------------------------------- | :-----------: | :---------------------------------------------------------------------------------------------------------------------------- |
| **01** | **Dữ liệu & Ký tự**        | Lỗi font chữ tiếng Việt `.shx` / TCVN3 / VNI     | Chữ hiển thị dấu hỏi `???`, ký tự rác `®`, `µ`, `¶`                                                 |    Medium     | Ánh xạ bảng mã ký tự nhị phân sang chuẩn Unicode UTF-8 (`font_shx_converter.py`).                                             |
| **02** | **Tỷ lệ & Đơn vị**         | Lệch tỷ lệ (Scale Mismatch) & Hệ đơn vị          | Kích thước dim ghi $1000\text{mm}$ nhưng đo hình học thực tế là $1.0\text{m}$ hoặc $39.37\text{in}$ |     High      | Tự động phân tích tỷ lệ giữa DimText và chiều dài Entity thực tế, chuẩn hóa về hệ Mét/Milimét ($1:1$).                        |
| **03** | **Cấu trúc Tầng Layer**    | Layer hỗn tạp, vẽ sai layer chuyên ngành         | Ống thoát nước nằm trong layer `0`, `Defpoints` hoặc `E-LIGHT`                                      |    Medium     | Phân loại ngữ nghĩa đối tượng bằng AI/Pattern Matching và chuyển về hệ layer chuẩn AIA/BS1192.                                |
| **04** | **Thuộc tính Thực thể**    | Block vỡ, thiếu Dynamic Attributes               | Block van/bơm không có thông số DN, công suất kW, lưu lượng $m^3/h$                                 |     High      | Khôi phục Schema thuộc tính từ Catalog chuẩn XBoss (`cad_block_catalog`), điền giá trị mặc định theo loại thiết bị.           |
| **05** | **Xung đột Hình học Cứng** | Ống/Máng cáp cắt ngang Dầm/Cột bê tông           | Bounding Box AABB giao cắt với thể tích khối dầm chịu lực                                           |   Critical    | Đề xuất hạ cao độ ống hoặc tìm vị trí khoét lỗ hợp lệ theo nguyên tắc dầm $L/3$.                                              |
| **06** | **Xuyên Dầm Trái Phép**    | Lỗ mở xuyên dầm ngoài khoảng cho phép            | Tim ống xuyên dầm tại vị trí $x < L/3$ hoặc $x > 2L/3$, hoặc cách mép dầm $< 50\text{mm}$           |   Critical    | Tự động dịch chuyển tim xuyên vào vùng an toàn $L/3 \le x \le 2L/3$, kiểm tra tỷ lệ $D_{\text{sleeve}} \le H_{\text{dầm}}/3$. |
| **07** | **Triệt tiêu Độ dốc**      | Ống thoát nước bị bẻ võng/ngược độ dốc           | Hướng dốc có gradient $< 1.0\%$ hoặc dốc ngược ($z_{\text{sau}} > z_{\text{trước}}$)                |   Critical    | **Bảo toàn Độ dốc Trọng lực:** Cố định cao độ ống thoát $1-2\%$, ép các hệ áp lực (Nước cấp, Cứu hỏa) uốn lượn né tránh.      |
| **08** | **Xung đột Mềm**           | Khoảng cách bảo ôn nhiệt $< 50\text{mm}$         | Khoảng cách hình học giữa 2 ống/máng cáp song song nhỏ hơn độ dày bông thủy tinh/Armaflex           |     High      | Tự động mở rộng khoảng hở tim ống $S_{\text{clear}} \ge D_1/2 + D_2/2 + t_{\text{ins1}} + t_{\text{ins2}} + 50\text{mm}$.     |
| **09** | **Vi phạm Thủy lực**       | Vận tốc dòng chảy hoặc lưu lượng vượt ngưỡng     | Ống nước cấp $v > 2.5\text{m/s}$, ống hút bơm $v > 1.2\text{m/s}$, ống gió chính $v > 10\text{m/s}$ |     High      | Áp dụng công thức Hazen-Williams / Darcy-Weisbach, tự động đề xuất tăng cỡ đường kính danh định (DN / WxH).                   |
| **10** | **Bất nhất Đa bộ môn**     | Lệch tim trục hộp gen (Shaft) giữa AR - ST - MEP | Hộp kỹ thuật kiến trúc lệch so với lỗ khoét sàn kết cấu và tim ống đứng MEP                         |   Critical    | Bắn cảnh báo RFI đa bên, tự động lấy tim trục kết cấu (Structural Grid) làm hệ quy chiếu gốc (Single Source of Truth).        |
| **11** | **Chênh lệch Khối lượng**  | Vênh khối lượng CAD so với BOQ mời thầu          | Khối lượng bóc tách hình học vượt quá $\pm 5\%$ so với bảng khối lượng hợp đồng                     |     High      | Kích hoạt Động cơ Đối soát 3 Chiều (`compute3WayVariance`), tự động phát hiện rủi ro phát sinh (VO Risk).                     |
| **12** | **Thiếu Chi tiết Chế tạo** | Bản vẽ sơ phác LOD 200 thiếu phụ kiện thi công   | Tuyến ống dài không chia đoạn Spool, thiếu bích, ty treo, côn cút thực tế                           |    Medium     | Tự động chuyển đổi LOD 200 $\rightarrow$ LOD 400 DfMA (`convertToLod400Dfma`), chia đoạn $\le 5.8\text{m}$ và chèn bích.      |

---

## 2. GIẢI THUẬT TỰ ĐỘNG NẮN CHỈNH & CHỮA LÀNH (AUTO-HEALING RECIPES)

### 2.1. Giải thuật Chữa lành Tỷ lệ & Đơn vị (Scale Healing Algorithm)

Khi nhập bản vẽ CAD, hệ thống phân tích tỷ lệ giữa chuỗi kích thước ghi trên DimText ($D_{\text{text}}$) và khoảng cách tọa độ thực giữa 2 điểm đo ($L_{\text{coord}} = \sqrt{\Delta x^2 + \Delta y^2}$):

$$\text{Scale Ratio } K = \frac{D_{\text{text}}}{L_{\text{coord}}}$$

- Nếu $K \approx 1000 \rightarrow$ Bản vẽ đang vẽ theo mét nhưng dim theo milimét $\rightarrow$ Áp dụng hệ số co giãn $Scale(1000, 1000, 1000)$ về hệ chuẩn $\text{mm}$.
- Nếu $K \approx 25.4 \rightarrow$ Bản vẽ đang ở hệ Inch $\rightarrow$ Chuyển đổi toàn bộ tọa độ nhân với $25.4$.
- Nếu $K \approx 1.0 \rightarrow$ Tỷ lệ chuẩn $1:1$.

### 2.2. Giải thuật Chữa lành Font Ký tự Tiếng Việt (Vietnamese CAD Font Sanitizer)

Ánh xạ các byte ký tự đặc thù của bảng mã VNI / TCVN3 (ABC) sang bảng mã Unicode UTF-8 chuẩn xác:

```typescript
export function sanitizeCadVietnameseText(rawText: string): string {
  if (!rawText) return "";
  let text = rawText;

  // 1. Loại bỏ các mã định dạng nội bộ AutoCAD (ví dụ: \A1;, \P, %%u)
  text = text.replace(/\\[A-Z0-9]+;?/gi, "").replace(/%%[A-Z0-9]/gi, "");

  // 2. Chuyển đổi bảng mã TCVN3 (ABC) sang UTF-8
  const tcvn3Map: Record<string, string> = {
    µ: "à",
    "¸": "á",
    "¶": "ả",
    "·": "ã",
    "¹": "ạ",
    "¨": "ă",
    "¾": "ằ",
    "»": "ắ",
    "¼": "ẳ",
    "½": "ẵ",
    Æ: "ặ",
    "©": "â",
    Ç: "ầ",
    È: "ấ",
    É: "ẩ",
    Ê: "ẫ",
    Ë: "ậ",
    Ì: "è",
    Ð: "é",
    Î: "ẻ",
    Ï: "ẽ",
    Ñ: "ẹ",
    ª: "ê",
    Ò: "ề",
    Ó: "ế",
    Ô: "ể",
    Õ: "ễ",
    Ö: "ệ",
    "×": "ì",
    Ø: "í",
    Ù: "ỉ",
    Ú: "ĩ",
    Û: "ị",
    Ü: "ò",
    Ý: "ó",
    Þ: "ỏ",
    ß: "õ",
    à: "ọ",
    "«": "ô",
    á: "ồ",
    â: "ố",
    ã: "ổ",
    ä: "ỗ",
    å: "ộ",
    "¬": "ơ",
    æ: "ờ",
    ç: "ớ",
    è: "ở",
    é: "ỡ",
    ê: "ợ",
    ë: "ù",
    í: "ú",
    î: "ủ",
    ï: "ũ",
    ñ: "ụ",
    "­": "ư",
    ó: "ừ",
    ô: "ứ",
    õ: "ử",
    ö: "ữ",
    "÷": "ự",
    ø: "ỳ",
    ý: "ý",
    þ: "ỷ",
    ÿ: "ỹ",
    ỳ: "ỵ",
    "®": "đ",
    "§": "Đ",
  };

  for (const [src, dest] of Object.entries(tcvn3Map)) {
    text = text.split(src).join(dest);
  }

  return text.trim();
}
```

### 2.3. Giải thuật Tự Chữa Lành Độ Dốc (Gravity Slope Healing Algorithm)

Đối với các ống thoát nước tự chảy (Sanitary / Storm Drainage), độ dốc $S$ bắt buộc thỏa mãn:

$$0.01 \le S \le 0.02 \quad (\text{tương đương } 1\% - 2\%)$$

- Khi phân tích đoạn ống từ điểm $A(x_1, y_1, z_1)$ đến điểm $B(x_2, y_2, z_2)$:
  - Chiều dài phẳng: $L_{\text{plan}} = \sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$.
  - Độ chênh cao thực tế: $\Delta z = z_1 - z_2$.
  - Nếu $\Delta z < 0$ (dốc ngược) hoặc $\Delta z / L_{\text{plan}} < 0.01$:
    - Tự động hiệu chỉnh cao độ điểm kết thúc:
      $$z_2^* = z_1 - (L_{\text{plan}} \times 0.015)$$
    - Gắn cờ thông báo tự động nắn chỉnh độ dốc về chuẩn $1.5\%$.

---

## 3. RANH GIỚI TỰ TRỊ XỬ LÝ LỖI BẢN VẼ (A0 - A2 BOUNDARIES)

1. **Cấp độ A2 (Tự động thực thi an toàn):**
   - Chuyển đổi font chữ UTF-8.
   - Chuẩn hóa tên Layer theo chuẩn AIA/BS1192.
   - Nắn chỉnh tỷ lệ bản vẽ theo DimText ($1:1$).
   - Bẻ uốn né va chạm $45^\circ$ cho ống cấp nước / máng cáp (không ảnh hưởng trần và kết cấu).
   - Chia đoạn ống gia công Spooling $\le 5.8\text{m}$ và chèn bích tiêu chuẩn.

2. **Cấp độ A1 (Tạo đề xuất RFI - Trình Kỹ sư duyệt):**
   - Khoét lỗ mở xuyên dầm bê tông cốt thép mới.
   - Thay đổi cao độ đáy ống làm hạ trần giả kiến trúc $> 50\text{mm}$.
   - Tăng cỡ đường kính ống dẫn tới thay đổi công suất bơm/quạt.
   - Chênh lệch khối lượng $\Delta \text{QTO} > 5\%$ dẫn tới rủi ro vượt dự toán hợp đồng.
