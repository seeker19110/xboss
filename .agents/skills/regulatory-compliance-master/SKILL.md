---
name: regulatory-compliance-master
description: "Quy chuẩn quản trị pháp lý xây dựng, kiểm soát điều kiện khởi công Điều 107 Luật Xây dựng, thẩm duyệt PCCC/ĐTM, cảnh báo sớm gia hạn giấy phép 30 ngày, kiểm định an toàn máy móc nghiêm ngặt Thông tư 36/2019/TT-BLĐTBXH trong XBoss. Bắt buộc kích hoạt khi xử lý pháp lý dự án, giấy phép, thanh tra kiểm tra hoặc kiểm định an toàn."
---

# REGULATORY & COMPLIANCE MASTER — QUẢN TRỊ PHÁP LÝ XÂY DỰNG & KIỂM ĐỊNH AN TOÀN

Bộ Skill này đóng gói toàn bộ tri thức pháp lý xây dựng Việt Nam (Luật Xây dựng 2014 & Luật 62/2020/QH14, Luật Đấu thầu 2023, Luật PCCC, Luật Bảo vệ Môi trường, Luật An toàn Vệ sinh Lao động), kiểm soát điều kiện khởi công, thẩm định giấy phép, cảnh báo sớm thời hạn hiệu lực hồ sơ, và quy chuẩn kiểm định kỹ thuật an toàn máy móc nghiêm ngặt theo **Thông tư 36/2019/TT-BLĐTBXH** cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bất biến Cảnh Báo Sớm Pháp Lý 30 Ngày (30-Day Legal Expiry Invariant):**
   - Hệ thống BẮT BUỘC tự động quét và gửi cảnh báo trước **30 ngày**, **15 ngày** và **7 ngày** đối với bất kỳ:
     - Giấy phép xây dựng, Giấy phép xả thải, Giấy phép thi công ban đêm/lòng đường.
     - Bảo lãnh ngân hàng (Bảo lãnh thực hiện hợp đồng, Bảo lãnh tạm ứng, Bảo lãnh bảo hành).
     - Chứng chỉ hành nghề của Kỹ sư trưởng, Kỹ sư An toàn, Giám sát viên.
     - Tem kiểm định an toàn kỹ thuật của thiết bị thi công.

2. **Bất biến Khóa Cấp Phép Làm Việc Máy Nghiêm Ngặt (Strict Machinery Inspection Lock):**
   - Các thiết bị có yêu cầu nghiêm ngặt về an toàn lao động (Cần trục tháp, Vận thăng lồng, Cần phân phối bê tông, Bình tích áp máy nén khí, Xe cẩu tự hành) tuyệt đối KHÔNG ĐƯỢC PHÉP vận hành nếu:
     1. Chưa có Giấy chứng nhận kết quả kiểm định kỹ thuật an toàn còn hiệu lực của đơn vị kiểm định được Bộ Xây dựng / Bộ LĐTBXH cấp phép.
     2. Thợ vận hành chưa có Chứng chỉ vận hành thiết bị nâng và Thẻ an toàn lao động Nhóm 3 (Nghị định 44/2016/NĐ-CP).

3. **Bất biến Điều Kiện Khởi Công (Permit-to-Start Invariant):**
   - Không được phép kích hoạt kế hoạch thi công thực tế trên hệ thống nếu chưa đạt $100\%$ các điều kiện khởi công theo Điều 107 Luật Xây dựng (Mặt bằng sạch, Giấy phép xây dựng, Thiết kế bản vẽ thi công được duyệt, Hợp đồng thi công, Biện pháp bảo đảm an toàn và bảo vệ môi trường, Đã gửi thông báo khởi công).

---

## 2. QUY TRÌNH 5 BƯỚC QUẢN TRỊ PHÁP LÝ & TUÂN THỦ QUY CHUẨN

```
[B1: Rà soát Pháp lý Đầu vào] ──► [B2: Giám sát Hiệu lực 30 ngày] ──► [B3: Kiểm định An toàn Thiết bị] ──► [B4: Quản trị Thanh tra & Kiểm toán] ──► [B5: Đóng gói Pháp lý Hoàn công]
```

### Bước 1: Rà Soát & Thiết Lập Danh Mục Hồ Sơ Pháp Lý Dự Án (Legal Inventory Setup)

- Số hóa và phân loại toàn bộ hồ sơ pháp lý (`legal_documents`):
  - Nhóm 1: Quyết định chủ trương đầu tư, Phê duyệt quy hoạch $1/500$.
  - Nhóm 2: Báo cáo đánh giá tác động môi trường (ĐTM) / Giấy phép môi trường (GPMT).
  - Nhóm 3: Giấy chứng nhận thẩm duyệt thiết kế PCCC (Cục Cảnh sát PCCC & CNCH).
  - Nhóm 4: Giấy phép xây dựng và Hồ sơ thông báo khởi công.

### Bước 2: Giám Sát Thời Hạn & Cảnh Báo Gia Hạn Tự Động (Legal Sentinel & Expiry Alert)

- Quét định kỳ mỗi 24h bảng `legal_documents`, `insurance_bonds`, `certifications`.
- Tự động kích hoạt thông báo Push Notification/Email/Telegram cho Ban Giám đốc và Kỹ sư Pháp lý khi tài liệu bước vào vùng cảnh báo $30$ ngày trước khi hết hạn.

### Bước 3: Kiểm Định Kỹ Thuật An Toàn Máy Móc & Thiết Bị Nghiêm Ngặt (Machinery Safety Pass)

- Tiếp nhận máy móc thiết bị vào công trường:
  - Kiểm tra hồ sơ lý lịch máy, biên bản kiểm định tĩnh/động của Trung tâm Kiểm định.
  - Dán tem kiểm định điện tử gắn mã QR trên thân máy.
  - Quản lý nhật ký bảo trì, bảo dưỡng định kỳ và kiểm tra an toàn đầu ca của thợ vận hành.

### Bước 4: Chuẩn Bị Hồ Sơ & Tiếp Đoàn Thanh Tra Xây Dựng (Audit & Inspection Readiness)

- Đóng gói nhanh hồ sơ phục vụ các đoàn kiểm tra liên ngành (Thanh tra Sở Xây dựng, Thanh tra Sở Lao động, Cảnh sát PCCC, Cảnh sát Môi trường).
- Trích xuất tự động: Sổ nhật ký thi công điện tử (TT 06/2021/TT-BXD), Hồ sơ quản lý an toàn lao động (QCVN 18:2021/BXD), và Hồ sơ quan trắc môi trường định kỳ.

### Bước 5: Đóng Gói Hồ Sơ Hoàn Thành Công Trình Bàn Giao Lưu Trữ (Legal Closeout Dossier)

- Lập Danh mục hồ sơ hoàn thành công trình theo Phụ lục VI Nghị định 06/2021/NĐ-CP và Thông tư 10/2021/TT-BXD.
- Kiểm tra tính đầy đủ của biên bản nghiệm thu, bản vẽ hoàn công, kết quả thí nghiệm kiểm định và văn bản chấp thuận của các cơ quan quản lý nhà nước có thẩm quyền.
- Lưu trữ điện tử vĩnh viễn với mã băm SHA-256 trên sổ cái Merkle.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] construction-permits-and-vietnam-laws

# CẨM NANG PHÁP LÝ XÂY DỰNG, ĐIỀU KIỆN KHỞI CÔNG & HỒ SƠ HOÀN CÔNG

## 1. ĐIỀU KIỆN KHỞI CÔNG XÂY DỰNG CÔNG TRÌNH (ĐIỀU 107 LUẬT XÂY DỰNG 2014)

Để khởi công một dự án hoặc gói thầu, hệ thống XBoss kiểm tra $100\%$ 6 điều kiện tiên quyết:

$$\text{Permit-to-Start} = \bigwedge_{k=1}^{6} \text{Condition}_k = \text{TRUE}$$

1. **Mặt bằng xây dựng:** Đã bàn giao toàn bộ hoặc từng phần theo tiến độ dự án.
2. **Giấy phép xây dựng:** Đã được cấp và còn hiệu lực (đối với công trình thuộc diện phải cấp phép).
3. **Hồ sơ Thiết kế:** Thiết kế bản vẽ thi công đã được phê duyệt và đóng dấu thẩm tra.
4. **Hợp đồng thi công:** Hợp đồng giao nhận thầu đã ký kết giữa Chủ đầu tư và Nhà thầu.
5. **Biện pháp An toàn & Môi trường:** Kế hoạch quản lý an toàn lao động và bảo vệ môi trường đã được phê duyệt.
6. **Thông báo khởi công:** Đã gửi thông báo bằng văn bản đến cơ quan quản lý nhà nước về xây dựng tại địa phương trước 03 ngày làm việc.

---

## 2. DANH MỤC HỒ SƠ PHÁP LÝ HOÀN THÀNH CÔNG TRÌNH (PHỤ LỤC VI NĐ 06/2021/NĐ-CP)

Danh mục 8 tập hồ sơ bắt buộc số hóa và lưu trữ vĩnh viễn trên XBoss:

1. **Tập 1:** Hồ sơ chuẩn bị đầu tư xây dựng và giấy phép xây dựng.
2. **Tập 2:** Hồ sơ khảo sát xây dựng (Địa chất, Địa hình, Thủy văn).
3. **Tập 3:** Hồ sơ thiết kế xây dựng (Thiết kế cơ sở, Thiết kế kỹ thuật, Thiết kế bản vẽ thi công có phê duyệt).
4. **Tập 4:** Hồ sơ quản lý chất lượng thi công xây dựng (Nhật ký, ITP, BBNT công việc, BBNT giai đoạn).
5. **Tập 5:** Hồ sơ nghiệm thu chạy thử liên động (T&C, TAB, Nghiệm thu PCCC, Môi trường).
6. **Tập 6:** Bản vẽ hoàn công As-Built Drawing có đóng khung con dấu chuẩn Nghị định 06/2021/NĐ-CP.
7. **Tập 7:** Văn bản chấp thuận kết quả nghiệm thu của Cơ quan Chuyên môn về Xây dựng (Điều 24 NĐ 06).
8. **Tập 8:** Hồ sơ quyết toán vốn đầu tư hoàn thành và thanh lý hợp đồng.

---

### 3.2. [Cẩm nang kỹ thuật] machinery-inspection-and-safety-pass

# CẨM NANG KIỂM ĐỊNH MÁY THI CÔNG NGHIÊM NGẶT & AN TOÀN LAO ĐỘNG

## 1. DANH MỤC THIẾT BỊ CÓ YÊU CẦU NGHIÊM NGẶT VỀ AN TOÀN (THÔNG TƯ 36/2019/TT-BLĐTBXH)

| Nhóm thiết bị                       | Chu kỳ kiểm định định kỳ    | Yêu cầu kỹ thuật bắt buộc                                                            | Điều kiện người vận hành                    |
| :---------------------------------- | :-------------------------- | :----------------------------------------------------------------------------------- | :------------------------------------------ |
| **Cần trục tháp**                   | 01 năm / lần                | Thử tải tĩnh $1.25 \times P_{\text{SWL}}$, thử tải động $1.10 \times P_{\text{SWL}}$ | Chứng chỉ thợ lái cẩu + Thẻ an toàn Nhóm 3  |
| **Vận thăng lồng chở người/hàng**   | 01 năm / lần                | Thử nghiệm phanh chống rơi (Drop Test) tự động dừng trong $\le 0.5\text{m}$          | Chứng chỉ vận hành vận thăng + Thẻ Nhóm 3   |
| **Bình tích áp máy nén khí**        | 02 năm / lần                | Thử áp lực thủy lực $1.5 \times P_{\text{thiết kế}}$, kiểm định van an toàn          | Thẻ an toàn lao động Nhóm 3                 |
| **Xe cẩu tự hành / Xe nâng người**  | 01 năm / lần                | Kiểm tra hệ thống chân chống thủy lực, cảm biến nghiêng lật                          | Bằng lái xe chuyên dùng + Thẻ Nhóm 3        |
| **Hệ giàn giáo bao che ngoài trời** | Trước khi sử dụng & Sau bão | Kiểm tra độ liên kết neo tường, tải trọng phân bố sàn thao tác                       | Thợ lắp dựng giàn giáo có chứng chỉ đào tạo |

---

## 2. QUY TRÌNH CẤP PHÉP LÀM VIỆC AN TOÀN (PERMIT TO WORK - PTW)

Đối với các công việc có nguy cơ rủi ro cao, hệ thống kích hoạt luồng ký số cấp phép PTW trước 24h:

1. **Hot Work Permit (Công việc sinh nhiệt/hàn cắt):** Yêu cầu chuẩn bị bình chữa cháy xách tay, bạt chống cháy cách ly và cử người canh lửa (Fire Watch).
2. **Working at Height Permit (Làm việc trên cao $\ge 2\text{m}$):** Yêu cầu dây an toàn toàn thân 2 móc, điểm neo cố định đạt lực kéo $\ge 22\text{kN}$ và lưới hứng rơi bên dưới.
3. **Confined Space Permit (Làm việc không gian kín/bể ngầm):** Yêu cầu đo nồng độ khí oxy ($19.5\% - 23.5\%$) và quạt hút thông gió cưỡng bức liên tục.

---
