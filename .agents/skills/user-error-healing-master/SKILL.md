---
name: user-error-healing-master
description: "Quy chuẩn chuyên sâu và giải thuật tối thượng về Tự Chữa Lành Lỗi Người Dùng (User Error Self-Healing), phòng vệ đa tầng (Defensive Guardrails), nắn chỉnh sai lệch dữ liệu nhập liệu/Excel/BIM/BOQ/Tiến độ, giải mã khẩu lệnh/ngôn ngữ tự nhiên mờ nghĩa (Fuzzy Intent Disambiguation), và tự động khắc phục lỗi người dùng lên đẳng cấp Thượng Thừa trong XBoss. Bắt buộc kích hoạt khi xử lý dữ liệu nhập liệu từ người dùng, import Excel/CSV lỗi, giải quyết xung đột thao tác, phục hồi dữ liệu hỏng, hoặc xử lý yêu cầu mập mờ từ người dùng."
---

# USER ERROR HEALING MASTER — QUY CHUẨN TỰ CHỮA LÀNH LỖI NGƯỜI DÙNG ĐẲNG CẤP THƯỢNG THỪA (PINNACLE ASCENSION)

Bộ Skill này đóng gói toàn bộ tri thức, giải thuật tối ưu và nguyên tắc phòng vệ tối thượng nhằm **phát hiện sớm, tự động chỉnh đốn, phân giải mờ nghĩa, phục hồi dữ liệu hỏng và chữa lành hoàn hảo mọi sai sót, nhầm lẫn từ phía người dùng** trên toàn bộ hệ sinh thái XBoss.

---

## 1. BẢY TRỤ CỘT TỰ CHỮA LÀNH TỰ TRỊ (THE 7 PILLARS)

1. **Bảo toàn Ý định Gốc & Zero Data Loss (Intent Preservation):**
   - Không bao giờ âm thầm loại bỏ dữ liệu thô của người dùng. Luôn lưu bản chụp gốc `raw_payload` trước khi qua bộ lọc.

2. **Bậc Thang Tự Chữa Lành 4 Cấp Độ (4-Tier Hierarchy):**
   - **L1 — Tự Sửa Trong Suốt:** Ký tự tàng hình (`\u200B`, `\u00A0`), font cũ TCVN3/VNI, số tiền lẫn chữ, ngày tháng hỗn hợp/Excel serial, chuẩn hóa mã BOQ.
   - **L2 — Khớp Mờ & Gợi Ý 1-Chạm:** Độ tương đồng $\ge 80\%$ cho tiếng lóng công trường, lỗi chính tả, danh mục vật tư.
   - **L3 — Hướng Dẫn Tương Tác & Lựa Chọn Thông Minh:** Tự động phát hiện logic bất hợp lý (ngày kết thúc < bắt đầu, vượt định mức), mở giao diện câu hỏi trực quan.
   - **L4 — Ngắt Mạch Khẩn Cấp & Cách Ly An Toàn:** Chặn đứng vi phạm quy chuẩn pháp lý/kỹ thuật (bỏ qua Hold-Point, hạ cấp nghiệm thu).

3. **Lũy Đẳng Tuyệt Đối & Chống Đúp Thao Tác (Idempotency):**
   - Mọi request đều được bảo vệ bằng `Idempotency-Key` hoặc hash SHA-256 nội dung, đảm bảo $f(f(x)) = f(x)$.

4. **Hợp Nhất Trường Độc Lập Chống Xung Đột (Field-Level CRDT & 3-Way Merge):**
   - Hợp nhất dữ liệu đa người dùng và ngoại tuyến PWA theo từng trường riêng biệt, không ghi đè mất mát dữ liệu của nhau.

5. **Tự Tái Thiết Ma Trận WBS & Sửa Lỗi Công Thức Excel Hỏng (`#REF!`, `#VALUE!`, `#DIV/0!`):**
   - Tự động nhận diện cấu trúc phân cấp Gói thầu $\rightarrow$ Task $\rightarrow$ Dimension và phục hồi các ô công thức bị gãy bằng quy luật tổng cân bằng.

6. **Phát Hiện Bất Thường Số Liệu Thời Gian Thực (Statistical $Z\text{-Score}$ Outlier Detection):**
   - Phân tích độ lệch chuẩn so với dữ liệu lịch sử để cảnh báo ngay lập tức khi kỹ sư nhập số liệu bất thường (gõ thừa số 0).

7. **Lá Chắn Giới Hạn Phạm Vi Tác Động & Du Hành Thời Gian (Blast-Radius Shield & Time-Travel Undo):**
   - Tự động tạo bản chụp thời gian (Time-Travel Snapshot) trước mọi thao tác hàng loạt, cho phép hoàn tác 1-chạm trong vòng 24 giờ.

---

## 2. QUY TRÌNH 5 BƯỚC CHỮA LÀNH LỖI THƯỢNG THỪA

```
[B1: Ingest & Quarantine] ──► [B2: Chẩn đoán Căn nguyên] ──► [B3: Động cơ Chữa lành Đa miền] ──► [B4: Xác minh Toàn vẹn] ──► [B5: Phản hồi Thấu cảm UX]
```

### Bước 1: Tiếp nhận, Cách ly An toàn & Lưu Giữ Ý định (Ingest & Quarantine)

- Đóng gói toàn bộ payload thô, headers, mốc thời gian và danh tính người dùng vào snapshot an toàn.

### Bước 2: Chẩn đoán Căn nguyên & Đo Lường Độ Lệch Chuẩn (Diagnostic & Z-Score)

- Phân tích cú pháp, ngữ nghĩa, logic WBS và tính toán chỉ số bất thường $Z\text{-Score}$.

### Bước 3: Động cơ Tự Chữa Lành Đa Miền (Domain-Specific Healing Engine)

- Áp dụng các công thức chuyên sâu từ 7 bộ cẩm nang tham chiếu:
  - **Bảng tính & Import:** [references/excel-data-healing-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/excel-data-healing-recipes.md)
  - **Công thức & Ma trận:** [references/excel-formula-and-matrix-healing.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/excel-formula-and-matrix-healing.md)
  - **Khẩu lệnh & So khớp mờ:** [references/nlp-fuzzy-intent-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/nlp-fuzzy-intent-recipes.md)
  - **Ý định Sâu & Bất thường AI:** [references/anomaly-detection-and-intent-ai.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/anomaly-detection-and-intent-ai.md)
  - **Trạng thái & Tiến độ:** [references/state-machine-repair-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/state-machine-repair-recipes.md)
  - **Xung đột & Đồng bộ:** [references/conflict-resolution-crdt-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/conflict-resolution-crdt-recipes.md)
  - **Phòng vệ & Hoàn tác:** [references/blast-radius-time-travel-undo.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/blast-radius-time-travel-undo.md)

### Bước 4: Xác minh Toàn vẹn & Khóa Bất biến (Integrity & Invariant Verification)

- Đảm bảo dữ liệu không có giá trị rác, tiến độ $[0, 1]$, số tiền chuẩn xác từng xu (BigInt), ngày bắt đầu $\le$ ngày kết thúc.

### Bước 5: Phản hồi Trực quan & Trải Nghiệm Thấu Cảm (Empathetic UX & One-Click Resolution)

- Cung cấp thông báo 3 phần rõ ràng, nhân văn kèm các nút hành động 1-chạm (Xem trước, Xác nhận, Hoàn tác).

---

## 3. TÀI LIỆU THAM CHIẾU KỸ THUẬT (REFERENCES)

- [references/excel-data-healing-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/excel-data-healing-recipes.md): Xử lý 10 dị tật bảng tính Excel/CSV.
- [references/excel-formula-and-matrix-healing.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/excel-formula-and-matrix-healing.md): Phục hồi công thức gãy `#REF!` và tái dựng ma trận WBS.
- [references/nlp-fuzzy-intent-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/nlp-fuzzy-intent-recipes.md): So khớp mờ và từ điển tiếng lóng công trường.
- [references/anomaly-detection-and-intent-ai.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/anomaly-detection-and-intent-ai.md): Thuật toán $Z\text{-Score}$ và bóc tách khẩu lệnh ngữ cảnh sâu.
- [references/state-machine-repair-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/state-machine-repair-recipes.md): Tự cân đối trạng thái tiến độ WBS và nghiệm thu 2 bước.
- [references/conflict-resolution-crdt-recipes.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/conflict-resolution-crdt-recipes.md): Phân giải xung đột 3-way merge và đồng bộ ngoại tuyến PWA.
- [references/blast-radius-time-travel-undo.md](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/references/blast-radius-time-travel-undo.md): Bản chụp thời gian Time-Travel và lá chắn phạm vi tác động.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/user_error_healer.ts](file:///c:/Users/liend/xboss/.agents/skills/user-error-healing-master/scripts/user_error_healer.ts): Bộ kịch bản CLI kiểm chứng toàn bộ 15 ca kiểm thử tự chữa lành đẳng cấp Thượng Thừa.
