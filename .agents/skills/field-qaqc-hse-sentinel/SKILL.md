---
name: field-qaqc-hse-sentinel
description: "Quy chuẩn chỉ huy hiện trường, chủ quyền mặt bằng, nhật ký thi công Thông tư 06/2021/TT-BXD, kiểm soát chất lượng QA/QC theo Nghị định 06/2021/NĐ-CP, điểm dừng kỹ thuật (Hold-Points), ngắt mạch an toàn công tác ngầm (Concealed Work Circuit Breaker), xử lý phiếu không phù hợp (NCR/Punch-List), nghiệm thu ký số e-Sign 3 bên, chống gian lận ảnh chụp (Dynamic Challenge & Anti-Fake-GPS), giám sát an toàn HSE AI Computer Vision theo QCVN 18:2021/BXD và đồng bộ PWA Offline Queue trong XBoss. Bắt buộc kích hoạt khi chỉ huy hiện trường, nghiệm thu, kiểm tra chất lượng hoặc giám sát an toàn lao động."
---

# FIELD OPERATIONS, QA/QC & HSE SENTINEL — CHỈ HUY HIỆN TRƯỜNG, CHẤT LƯỢNG 3 BÊN & AN TOÀN HSE AI

Bộ Master Skill này đóng gói toàn bộ tri thức chỉ huy công trường xây dựng, quy trình chuyển giao quyền kiểm soát mặt bằng thi công (Work-Front Custody), tiêu chuẩn nhật ký thi công điện tử theo **Thông tư 06/2021/TT-BXD**, kiểm soát chất lượng công trình theo **Nghị định 06/2021/NĐ-CP**, quy chuẩn điểm dừng kỹ thuật (Hold-Points ITP), ngắt mạch an toàn công tác ngầm (Concealed Work Circuit Breaker), quy trình ký số 3 bên không giấy tờ, xử lý phiếu không phù hợp NCR 3 bước, chống gian dối số liệu hiện trường (Dynamic Challenge & Anti-Fake-GPS), giám sát thị giác máy tính an toàn lao động theo **QCVN 18:2021/BXD**, và cơ chế đồng bộ ngoại tuyến bất biến (PWA Offline Queue) cho nền tảng XBoss.

---

## 1. MƯỜI HAI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 12 APEX INVARIANTS)

1. **Khóa Chặn Điểm Dừng Kỹ Thuật & Công Tác Ngầm (Hold-Point & Concealed-Work Hard Lock):** Đối với các hạng mục quan trọng (Ống luồn trong bê tông sàn/dầm, Thử áp lực ống nước $1.5 \times P_{\text{lv}}$, Thử kín ống gió DW143, Thử liên động PCCC): Tuyệt đối CẤM đổ bê tông, đóng trần hoặc lấp đất nếu chưa có Biên bản nghiệm thu (BBNT) ký duyệt 3 bên. Hệ thống ngắt mạch tự động (`pour_permits`) khóa cứng lệnh đổ bê tông nếu còn bất kỳ task ngầm nào chưa đạt.
2. **Bất biến Thử Thách Động Khi Chụp Ảnh (Dynamic Challenge Watermark Invariant):** Mọi hình ảnh chụp hiện trường để báo cáo tiến độ / nghiệm thu bắt buộc phải chứa Mã thử thách ngẫu nhiên (Dynamic Challenge Code) còn hiệu lực trong 90 giây sinh ra từ máy chủ, tọa độ GPS nằm trong bán kính dự án $\le 50\text{m}$ (không có cờ Mock GPS), và mã băm SHA-256 không trùng lặp trong 30 ngày.
3. **Bất biến Chữ Ký Số 3 Bên Pháp Lý (3-Party Paperless e-Sign Invariant):** Mọi Biên bản nghiệm thu công việc BBNT phải chứa đủ 3 chữ ký số điện tử: Kỹ sư Nhà thầu, Kỹ sư Giám sát TVGS, và Đại diện Chủ đầu tư/BCH.
4. **Quy Trình Khép Kín Phiếu NCR 3 Bước (3-Step NCR Closure Invariant):** Một phiếu Không phù hợp (NCR) hoặc Punch-List chỉ được phép chuyển trạng thái `CLOSED` khi có đủ 3 bước: (1) Ảnh hiện trạng sai lỗi ban đầu kèm tọa độ 3D; (2) Phân tích nguyên nhân gốc rễ 5-Whys và biện pháp khắc phục được TVGS duyệt; (3) Ảnh chụp nghiệm thu lại sau khắc phục đạt chuẩn.
5. **Thang Phân Cấp An Toàn HSE & Cảnh Báo Khẩn $\le 5$ Giây (HSE Critical Escalation Invariant):** Phát hiện vi phạm an toàn cấp độ `CRITICAL` qua AI Camera (Làm việc trên cao $\ge 2\text{m}$ không đeo dây an toàn móc điểm neo, mép sàn không lan can, đứng dưới tầm quay cẩu tháp): Hệ thống BẮT BUỘC tự động sinh Phiếu xử lý an toàn (HSE Action Ticket) và gửi cảnh báo khẩn cấp Push Notification/Telegram trong vòng $\le 5$ giây.
6. **Bất biến Chủ Quyền Mặt Bằng Duy Nhất (Single Work-Front Custody Invariant):** Tại một thời điểm, một phân vùng mặt bằng thi công (Tòa nhà $\rightarrow$ Tầng $\rightarrow$ Zone $\rightarrow$ Phòng kỹ thuật) chỉ có DUY NHẤT một đơn vị/tổ đội nắm quyền kiểm soát chính (Custody Owner). Chuyển giao mặt bằng phải có Biên bản bàn giao kèm ảnh hiện trạng sạch sẽ, mốc trắc đạc laser và nguồn điện/nước tạm.
7. **Bất biến Đầy Đủ 4 Khối Nhật Ký Thi Công (Circular 06/2021/TT-BXD Invariant):** Nhật ký thi công mỗi ngày (`daily_diary`) BẮT BUỘC có đủ 4 khối nội dung: (1) Thời tiết & Môi trường; (2) Quân số Nhân lực; (3) Thiết bị Thi công; (4) Khối lượng thi công & Nghiệm thu.
8. **Bất biến Lũy Đẳng Hàng Đợi Ngoại Tuyến (PWA Offline Queue Idempotency Invariant):** Khi thao tác tại tầng hầm hoặc vùng mất sóng, dữ liệu được đóng gói vào IndexedDB kèm UUID, hash SHA-256 và timestamp. Khi có mạng trở lại, hệ thống Replay theo cơ chế Lũy đẳng $f(f(x)) = f(x)$, không gây sinh thừa bản ghi hoặc ghi đè sai lệch dữ liệu người khác.
9. **Bất biến Đối Soát Định Lượng 4 Chiều (Quad-Reconciliation Invariant):** Khối lượng báo cáo ($Q_{\text{report}}$) và nghiệm thu thanh toán ($Q_{\text{IPC}}$) phải thỏa mãn:
   $$Q_{\text{report}} \le \min\left(Q_{\text{BIM}}, Q_{\text{BOQ}}, \sum Q_{\text{GRN\_Material}} - Q_{\text{Scrap}}\right)$$
10. **Bất biến Chống Gán Chồng Chéo Tài Nguyên (Resource Over-Allocation Invariant):** Tự động chặn hoặc cảnh báo khi 1 Kỹ sư giám sát hoặc 1 Thiết bị trọng yếu (Cần trục, Máy nén khí) bị phân công đồng thời ở $\ge 2$ vị trí cách xa nhau trong cùng một khung giờ làm việc.
11. **Bất biến Neo Căn Cứ Thực Tế Triệt Tiêu Ảo Giác (Grounded-AI-Fact Invariant):** Mọi nhận định AI về tiến độ/khối lượng phải gắn liền với ID cấu kiện BIM GUID, dữ liệu viễn trắc IoT (áp suất/nhiệt độ) và hình ảnh hiện trường có độ tin cậy hiệu chuẩn $C_{\text{calibrated}} \ge 0.85$.
12. **Bất biến Sổ Cái Niêm Phong Mật Mã (Cryptographic Merkle Proof):** Mọi sự kiện nghiệm thu BBNT, đóng phiếu NCR, giấy phép đổ bê tông đều được niêm phong băm SHA-256 vào Sổ cái Merkle Tree M73.

---

## 2. QUY TRÌNH 7 BƯỚC CHỈ HUY HIỆN TRƯỜNG & KIỂM SOÁT KHÔNG SAI SÓT

```
[B1: Bàn Giao Mặt Bằng Work-Front] ──► [B2: Triển Khai Thi Công & Nhật Ký TT06] ──► [B3: Giám Sát HSE AI Vision]
                                                                                            │
                                                                                            ▼
[B6: Đóng NCR & Sổ Cái Merkle] ◄── [B5: Nghiệm Thu BBNT Ký Số 3 Bên] ◄── [B4: Hold-Points & Thử Thách Ảnh Động]
         │
         ▼
[B7: Ngắt Mạch Đổ Bê Tông Pour-Permit Hoặc Chuyển Giai Đoạn]
```
