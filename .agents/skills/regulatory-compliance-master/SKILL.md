---
name: regulatory-compliance-master
description: "Quy chuẩn quản trị pháp lý xây dựng, kiểm soát điều kiện khởi công Điều 107 Luật Xây dựng, thẩm duyệt PCCC/ĐTM, cảnh báo sớm gia hạn giấy phép 30 ngày, kiểm định an toàn máy móc nghiêm ngặt Thông tư 36/2019/TT-BLĐTBXH trong XBoss. Bắt buộc kích hoạt khi xử lý pháp lý dự án, giấy phép, thanh tra kiểm tra hoặc kiểm định an toàn."
---

# REGULATORY & COMPLIANCE MASTER — QUẢN TRỊ PHÁP LÝ XÂY DỰNG & KIỂM ĐỊNH AN TOÀN ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức pháp lý xây dựng Việt Nam (Luật Xây dựng 2014 & Luật sửa đổi 62/2020/QH14, Luật Đấu thầu 2023, Luật PCCC, Luật Bảo vệ Môi trường 2020, Luật An toàn Vệ sinh Lao động 2015), kiểm soát điều kiện khởi công Điều 107, thẩm định hồ sơ giấy phép xây dựng, bộ quét cảnh báo sớm gia hạn pháp lý 30 ngày, quy chuẩn kiểm định kỹ thuật an toàn máy móc thiết bị có yêu cầu nghiêm ngặt theo **Thông tư 36/2019/TT-BLĐTBXH**, và danh mục hồ sơ hoàn thành công trình 8 tập theo **Phụ lục VI Nghị định 06/2021/NĐ-CP** cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Cảnh Báo Sớm Pháp Lý 30/15/7 Ngày (Proactive Legal Expiry Invariant):**
   - Hệ thống BẮT BUỘC tự động quét và gửi cảnh báo trước **30 ngày**, **15 ngày** và **7 ngày** đối với bất kỳ:
     - Giấy phép xây dựng, Giấy phép xả thải, Giấy phép thi công ban đêm/lòng đường.
     - Bảo lãnh ngân hàng (Bảo lãnh thực hiện hợp đồng, Bảo lãnh tạm ứng, Bảo lãnh bảo hành).
     - Chứng chỉ hành nghề của Kỹ sư trưởng, Kỹ sư An toàn, Giám sát viên (Nghị định 15/2021/NĐ-CP).
     - Tem kiểm định an toàn kỹ thuật của thiết bị thi công (Cần trục, Vận thăng, Xe cẩu).

2. **Bất biến Khóa Cấp Phép Làm Việc Máy Nghiêm Ngặt (Strict Machinery Inspection Lock):**
   - Các thiết bị có yêu cầu nghiêm ngặt về an toàn lao động theo **Thông tư 36/2019/TT-BLĐTBXH** (Cần trục tháp, Vận thăng lồng, Cần phân phối bê tông, Bình tích áp khí nén, Xe cẩu tự hành) tuyệt đối KHÔNG ĐƯỢC PHÉP vận hành nếu:
     1. Chưa có Giấy chứng nhận kết quả kiểm định kỹ thuật an toàn còn hiệu lực của đơn vị kiểm định được Bộ Xây dựng / Bộ LĐTBXH cấp phép.
     2. Thợ vận hành chưa có Chứng chỉ nghề vận hành và Thẻ an toàn lao động Nhóm 3 (Nghị định 44/2016/NĐ-CP).

3. **Bất biến Điều Kiện Khởi Công 6 Tiêu Chí (Article 107 Permit-to-Start Invariant):**
   - Không được phép kích hoạt kế hoạch thi công thực tế trên hệ thống nếu chưa đạt $100\%$ 6 điều kiện khởi công theo Điều 107 Luật Xây dựng 2014:
     $$\text{Permit-to-Start} = \bigwedge_{k=1}^{6} \text{Condition}_k = \text{TRUE}$$
     _(Mặt bằng sạch, Giấy phép XD, Thiết kế BVTC được duyệt, Hợp đồng thi công, Biện pháp An toàn/Môi trường, Đã gửi thông báo khởi công trước 03 ngày)._

4. **Bất biến Thẩm Duyệt & Nghiệm Thu PCCC (QCVN 06:2022/BXD Invariant):**
   - Mọi thay đổi thiết kế cơ điện (chuyển vị trí hộp kỹ thuật, thay đổi công suất quạt hút khói, thay đổi vị trí vách ngăn cháy) đều phải được Kỹ sư Pháp lý rà soát đối chiếu với Giấy chứng nhận thẩm duyệt PCCC ban đầu. Nếu thuộc diện điều chỉnh lớn, bắt buộc phải thẩm duyệt PCCC bổ sung trước khi thi công.

5. **Bất biến Đánh Giá Tác Động Môi Trường & Giấy Phép Môi Trường (Law on Environmental Protection 2020):**
   - Toàn bộ trạm xử lý nước thải thi công, hệ thống rửa xe tự động tại cổng công trường và kho lưu giữ chất thải nguy hại (dầu mỡ, giẻ lau dính dầu, pin ắc quy) phải tuân thủ nghiêm ngặt báo cáo ĐTM / Giấy phép môi trường đã được phê duyệt.

6. **Bất biến Huấn Luyện An Toàn Lao Động 6 Nhóm (Decree 44/2016/NĐ-CP Invariant):**
   - $100\%$ cán bộ, kỹ sư và công nhân vào công trường bắt buộc phải có Giấy chứng nhận huấn luyện an toàn lao động tương ứng với nhóm đối tượng (Nhóm 1: Quản lý; Nhóm 2: Cán bộ chuyên trách HSE; Nhóm 3: Lao động làm việc nghiêm ngặt; Nhóm 4: Người lao động phổ thông; Nhóm 5: Cán bộ y tế; Nhóm 6: An toàn vệ sinh viên).

7. **Bất biến Sẵn Sàng Hồ Sơ Thanh Tra Xây Dựng 1-Chạm (Inspectorate Defense Dossier Invariant):**
   - Hệ thống luôn duy trì trạng thái sẵn sàng xuất ngay trong vòng 60 giây bộ Hồ sơ phục vụ Đoàn thanh tra liên ngành (Thanh tra Sở Xây dựng, Thanh tra Sở Lao động, Cảnh sát PCCC, Cảnh sát Môi trường) bao gồm đầy đủ Sổ nhật ký thi công điện tử, Hồ sơ an toàn HSE và Nhật ký quan trắc môi trường.

8. **Bất biến Giấy Phép Lao Động Chuyên Gia Nước Ngoài (Foreign Expert Compliance Invariant):**
   - Các chuyên gia, kỹ sư nước ngoài làm việc tại dự án (ví dụ: Chuyên gia lắp đặt Chiller/Thang máy) bắt buộc phải có Giấy phép lao động (Work Permit) hoặc Văn bản xác nhận không thuộc diện cấp giấy phép lao động còn hiệu lực, kèm Visa/Thẻ tạm trú hợp pháp.

9. **Bất biến Lưu Trữ Hồ Sơ Hoàn Thành 8 Tập (Decree 06 Appendix VI Invariant):**
   - Toàn bộ 8 tập hồ sơ hoàn thành công trình theo Phụ lục VI Nghị định 06/2021/NĐ-CP và Thông tư 10/2021/TT-BXD bắt buộc phải được số hóa, gắn mã băm SHA-256 và lưu trữ vĩnh viễn trên kho lưu trữ đám mây an toàn.

10. **Bất biến Sổ Cái Pháp Lý Bất Biến (Cryptographic Legal Ledger Invariant):**
    - Toàn bộ nhật ký kiểm tra, văn bản đình chỉ/cảnh báo của cơ quan nhà nước, quyết định phê duyệt và giấy phép được ghi vào Sổ cái Merkle, chống tẩy xóa hoặc làm sai lệch lịch sử pháp lý của dự án.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN QUẢN TRỊ PHÁP LÝ & TUÂN THỦ QUY CHUẨN

```
[B1: Khởi tạo Danh mục Pháp lý] ──► [B2: Kiểm tra Điều kiện Khởi công] ──► [B3: Giám sát Hiệu lực 30 Ngày] ──► [B4: Kiểm định An toàn Máy]
                                                                                                                        │
                                                                                                                        ▼
[B8: Sẵn sàng Thanh tra Xây dựng] ◄── [B7: Đăng ký Giấy phép Chuyên gia] ◄── [B6: Huấn luyện An toàn NĐ 44] ◄── [B5: Quản trị Môi trường & PCCC]
        │
        ▼
[B9: Đóng gói 8 Tập Hồ sơ NĐ 06] ──► [B10: Lưu trữ Merkle & Đóng Hồ sơ Pháp lý]
```

### Bước 1: Khởi Tạo Danh Mục & Phân Loại Hồ Sơ Pháp Lý Dự Án

- Số hóa và phân nhóm toàn bộ văn bản pháp lý (`legal_documents`): Quyết định đầu tư, Quy hoạch 1/500, Giấy phép xây dựng, Báo cáo ĐTM, Thẩm duyệt PCCC.

### Bước 2: Thẩm Định Điều Kiện Khởi Công Theo Điều 107 Luật Xây Dựng

- Kiểm tra tự động 6 điều kiện tiên quyết. Nếu đủ $100\%$ $\rightarrow$ Cấp mã `PERMIT_TO_START_APPROVED` mở khóa hệ thống quản lý thi công.

### Bước 3: Vận Hành Bộ Quét Cảnh Báo Sớm Thời Hạn Hiệu Lực 30 Ngày

- Tiến trình Cron quét định kỳ 24h, tự động gửi cảnh báo đẩy (Push Notification/Email) về các giấy phép và bảo lãnh ngân hàng sắp hết hạn.

### Bước 4: Kiểm Định Kỹ Thuật An Toàn Máy Móc Thiết Bị Nghiêm Ngặt (TT 36/2019)

- Thử tải tĩnh/động cần trục tháp ($1.25 \times P_{\text{SWL}}$ / $1.10 \times P_{\text{SWL}}$), thử rơi phanh vận thăng lồng; dán tem kiểm định điện tử QR Code trên thân máy.

### Bước 5: Giám Sát Tuân Thủ Bảo Vệ Môi Trường & Thẩm Duyệt Thiết Kế PCCC

- Kiểm tra hệ thống rửa xe, quan trắc bụi PM2.5, nước thải thi công theo QCVN 05/2023; rà soát hồ sơ thẩm duyệt PCCC khi có thay đổi thiết kế.

### Bước 6: Quản Trị Đào Tạo & Cấp Thẻ An Toàn Lao Động Theo Nghị Định 44/2016

- Kiểm tra thẻ an toàn lao động Nhóm 1-6, quét mã QR nhận diện công nhân tại cổng trước khi cho phép vào khu vực sản xuất.

### Bước 7: Quản Lý Hồ Sơ Pháp Lý Chuyên Gia Nước Ngoài & Đơn Vị Tư Vấn Quốc Tế

- Theo dõi thời hạn Giấy phép lao động (Work Permit), Thẻ tạm trú và Hợp đồng chuyên gia kỹ thuật cao cấp.

### Bước 8: Đóng Gói Hồ Sơ Sẵn Sàng Đón Tiếp Đoàn Thanh Tra Xây Dựng 1-Chạm

- Trích xuất tự động Sổ nhật ký thi công điện tử TT 06, Hồ sơ an toàn lao động QCVN 18 và Báo cáo hoàn thành giai đoạn phục vụ cơ quan thanh tra.

### Bước 9: Đóng Gói 8 Tập Hồ Sơ Hoàn Thành Công Trình Theo Phụ Lục VI Nghị Định 06

- Chuẩn hóa toàn bộ bản vẽ hoàn công, biên bản nghiệm thu, chứng chỉ vật liệu và văn bản chấp thuận của các cơ quan quản lý nhà nước.

### Bước 10: Niêm Phong Sổ Cái Mật Mã Merkle & Bàn Giao Lưu Trữ Vĩnh Viễn

- Nối toàn bộ mã băm hồ sơ pháp lý vào Cây Merkle, lưu trữ vĩnh viễn trên kho lưu trữ điện tử phục vụ công tác thanh tra/kiểm toán sau này.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] construction-permits-and-vietnam-laws

# CẨM NANG PHÁP LÝ XÂY DỰNG, ĐIỀU KIỆN KHỞI CÔNG & HỒ SƠ HOÀN THÀNH

## 1. ĐIỀU KIỆN KHỞI CÔNG XÂY DỰNG CÔNG TRÌNH (ĐIỀU 107 LUẬT XÂY DỰNG 2014 & LUẬT 62/2020)

$$\text{Permit-to-Start} = \bigwedge_{k=1}^{6} \text{Condition}_k = \text{TRUE}$$

1. **Mặt bằng Xây dựng:** Đã bàn giao toàn bộ hoặc từng phần theo tiến độ dự án.
2. **Giấy phép Xây dựng:** Đã được cấp và còn hiệu lực pháp lý (với công trình thuộc diện phải cấp phép).
3. **Hồ sơ Thiết kế:** Thiết kế bản vẽ thi công của hạng mục/công trình đã được phê duyệt và đóng dấu thẩm tra.
4. **Hợp đồng Thi công:** Hợp đồng giao nhận thầu thi công xây dựng đã được ký kết hợp pháp giữa Chủ đầu tư và Nhà thầu.
5. **Biện pháp An toàn & Môi trường:** Kế hoạch quản lý an toàn lao động và bảo vệ môi trường đã được phê duyệt.
6. **Thông báo Khởi công:** Đã gửi văn bản thông báo ngày khởi công đến Cơ quan Quản lý Nhà nước về Xây dựng tại địa phương (Ủy ban Nhân dân cấp xã/phường và Sở Xây dựng) trước tối thiểu 03 ngày làm việc.

---

### 3.2. [Cẩm nang kỹ thuật] machinery-inspection-and-safety-pass

# CẨM NANG KIỂM ĐỊNH MÁY THI CÔNG NGHIÊM NGẶT THEO THÔNG TƯ 36/2019/TT-BLĐTBXH

## 1. QUY CHUẨN THỬ TẢI & CHU KỲ KIỂM ĐỊNH MÁY NGHIÊM NGẶT

| Nhóm Thiết Bị                |     Chu Kỳ Kiểm Định     | Yêu Cầu Kỹ Thuật Thử Tải Bắt Buộc                                                    | Điều Kiện Người Vận Hành                    |
| :--------------------------- | :----------------------: | :----------------------------------------------------------------------------------- | :------------------------------------------ |
| **Cần trục tháp**            |       01 năm / lần       | Thử tải tĩnh $1.25 \times P_{\text{SWL}}$, Thử tải động $1.10 \times P_{\text{SWL}}$ | Chứng chỉ thợ lái cẩu + Thẻ an toàn Nhóm 3  |
| **Vận thăng lồng**           |       01 năm / lần       | Thử nghiệm phanh chống rơi (Drop Test) tự dừng trong $\le 0.5\text{m}$               | Chứng chỉ vận hành vận thăng + Thẻ Nhóm 3   |
| **Bình tích áp máy nén khí** |       02 năm / lần       | Thử áp lực thủy lực $1.5 \times P_{\text{thiết kế}}$, kiểm định van an toàn          | Thẻ an toàn lao động Nhóm 3                 |
| **Xe cẩu tự hành / Xe nâng** |       01 năm / lần       | Kiểm tra hệ thống chân chống thủy lực, cảm biến nghiêng lật                          | Bằng lái xe chuyên dùng + Thẻ Nhóm 3        |
| **Hệ giàn giáo ngoài trời**  | Trước khi dùng & Sau bão | Kiểm tra neo tường, sàn thao tác tải trọng $\ge 200\text{kg/m}^2$                    | Thợ lắp dựng giàn giáo có chứng chỉ đào tạo |

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/regulatory_compliance_checker.ts](file:///c:/Users/liend/xboss/.agents/skills/regulatory-compliance-master/scripts/regulatory_compliance_checker.ts): Bộ kịch bản CLI kiểm chứng 6 điều kiện khởi công Đ107, tính toán thử tải cần trục tháp Thông tư 36 và bộ quét cảnh báo sớm gia hạn 30 ngày.
