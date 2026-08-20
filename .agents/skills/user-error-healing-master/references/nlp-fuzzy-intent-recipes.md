# CẨM NANG SO KHỚP MỜ & GIẢI MÃ KHẨU LỆNH HIỆN TRƯỜNG (NLP FUZZY INTENT RECIPES)

Tài liệu này cung cấp các giải thuật xử lý ngôn ngữ tự nhiên (NLP), so khớp mờ (Fuzzy Matching) và trích xuất ý định (Intent & Slot Filling) đối với tin nhắn, giọng nói hoặc khẩu lệnh từ kỹ sư công trường qua Zalo, Telegram hoặc thanh tìm kiếm XBoss.

---

## 1. TỪ ĐIỂN TIẾNG LÓNG & THUẬT NGỮ CÔNG TRƯỜNG VIỆT NAM

Kỹ sư và công nhân hiện trường thường gõ tắt, gõ nhanh không dấu hoặc dùng tiếng lóng. Bộ từ điển mẫu bao gồm:

```typescript
export const CONSTRUCTION_FUZZY_DICTIONARY = [
  // 1. Hệ thống MEPF
  {
    key: "HVAC_DUCT",
    label: "Ống gió điều hòa không khí",
    synonyms: [
      "ong gio",
      "ong gio ton",
      "ong gio hut khoi",
      "ong lanh",
      "duct",
      "ong mep",
      "ong gio acmv",
    ],
  },
  {
    key: "UPVC_DRAIN",
    label: "Ống thoát nước uPVC",
    synonyms: [
      "ong upvc",
      "ong thoat nuoc",
      "ong tien phong",
      "ong binh minh",
      "thoat nuoc thai",
      "ong d110",
      "ong d90",
      "ong d60",
      "ong d160",
    ],
  },
  {
    key: "PPR_WATER",
    label: "Ống cấp nước PPR",
    synonyms: [
      "ong ppr",
      "ong cap nuoc",
      "ong nuoc lanh",
      "ong nuoc nong",
      "ppr d25",
      "ppr d32",
      "ppr d50",
    ],
  },
  {
    key: "FIRE_SPRINKLER",
    label: "Hệ thống chữa cháy tự động Sprinkler",
    synonyms: [
      "sprinkler",
      "chua chay",
      "dau phun",
      "ong cuu hoa",
      "ong pccc",
      "ong thep den",
      "sprinker",
    ],
  },
  {
    key: "CABLE_TRAY",
    label: "Máng cáp / Thang cáp điện",
    synonyms: ["mang cap", "thang cap", "cable tray", "trunking", "mang dien", "thang mang cap"],
  },
  // 2. Hành động tác nghiệp
  {
    key: "ACTION_INSPECT",
    label: "Nghiệm thu công việc",
    synonyms: [
      "nghiem thu",
      "nt",
      "kiem tra",
      "bbnt",
      "ky nghiem thu",
      "xac nhan xong",
      "nghiem thu xong",
    ],
  },
  {
    key: "ACTION_DELIVERY",
    label: "Tiếp nhận vật tư / Nhập kho",
    synonyms: [
      "nhap vat tu",
      "ve hang",
      "nhap kho",
      "xe giao hang",
      "nhan hang",
      "grn",
      "nhan vat tu",
    ],
  },
  {
    key: "ACTION_DELAY",
    label: "Báo cáo chậm trễ / Vướng mặt bằng",
    synonyms: [
      "cham tien do",
      "vuong mat bang",
      "tre han",
      "khong thi cong duoc",
      "thieu vat tu",
      "mat bang chua co",
    ],
  },
];
```

---

## 2. GIẢI THUẬT SO KHỚP KẾT HỢP (HYBRID FUZZY MATCHING)

Để đạt độ chính xác tối thượng trong môi trường tiếng Việt không dấu/có dấu:

1. **Chuẩn hóa Đầu vào:**
   - Loại bỏ dấu phụ tiếng Việt qua hàm `removeVietnameseAccents()`.
   - Bóc tách các từ dừng vô nghĩa (stop-words: `hôm nay`, `đã`, `làm`, `cho`, `ở`, `tại`, `rồi`).

2. **Tính Điểm Tương Đồng 3 Tầng:**
   - **Tầng 1 (Exact / Substring Inclusion):** Nếu chuỗi truy vấn nằm trọn vẹn trong tên danh mục $\rightarrow Score \ge 0.85$.
   - **Tầng 2 (Jaro-Winkler Metric):** Đánh giá độ tương đồng tiền tố và vị trí ký tự chuyển vị.
   - **Tầng 3 (Levenshtein Distance):** Đo số thao tác thêm/xóa/sửa tối thiểu:
     $$Confidence = \max\left(0, 1 - \frac{Levenshtein(s_1, s_2)}{\max(|s_1|, |s_2|)}\right)$$

3. **Ngưỡng Quyết Định:**
   - $Confidence \ge 0.80$: Khớp tự động (L1 / L2).
   - $0.60 \le Confidence < 0.80$: Đề xuất 3 phương án gần nhất (L2).
   - $Confidence < 0.60$: Kích hoạt hỏi lại thông minh (L3).

---

## 3. TRÍCH XUẤT THAM SỐ CÔNG TRƯỜNG (SLOT FILLING REGEX)

Bóc tách tự động Tầng, Phân khu, Khối lượng và Tên tổ đội từ câu lệnh tự do:

```typescript
export function extractFieldCommandSlots(text: string) {
  const norm = healVietnameseEncoding(text);

  // 1. Trích xuất Vị trí (Tầng & Zone)
  const floorMatch = norm.match(/\b(t\u1EA7ng|t|f)\s*(\d+|h\u1EA7m\s*\d*|b\d*)\b/i);
  const zoneMatch = norm.match(/\b(zone|ph\u00E2n khu|z)\s*(\d+|a|b|c)\b/i);

  // 2. Trích xuất Khối lượng & Đơn vị
  const qtyMatch = norm.match(
    /(\d+([\.,]\d+)?)\s*(m2|m3|m|c\u00E2y|cu\u1ED9n|b\u1ED9|t\u1EA5n|kg|c\u00E1i)/i,
  );

  // 3. Trích xuất Tổ đội / Nhà thầu
  const teamMatch = norm.match(
    /(t\u1ED5|\u0111\u1ED9i|nh\u00E0 th\u1EA7u|th\u1EE3)\s*([A-Z\u00C0-\u1EF9a-z\u00E0-\u1EF9\s]+?)(?:,|$|\.|\s\u0111\u01B0\u1EE3c|\s\u0111\u00E3)/i,
  );

  return {
    rawText: text,
    floor: floorMatch ? floorMatch[2] : null,
    zone: zoneMatch ? zoneMatch[2] : null,
    quantity: qtyMatch ? Number(qtyMatch[1].replace(",", ".")) : null,
    unit: qtyMatch ? qtyMatch[3] : null,
    team: teamMatch ? teamMatch[2].trim() : null,
  };
}
```
