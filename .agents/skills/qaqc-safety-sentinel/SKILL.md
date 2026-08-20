---
name: qaqc-safety-sentinel
description: "Quy chuẩn kiểm soát chất lượng QA/QC theo Nghị định 06/2021/NĐ-CP, quy trình điểm dừng kỹ thuật (Hold-Points), xử lý phiếu không phù hợp (NCR/Punch-List), nghiệm thu ký số e-Sign 3 bên và giám sát an toàn HSE AI Computer Vision theo QCVN 18:2021/BXD trong XBoss. Bắt buộc kích hoạt khi xử lý chất lượng, nghiệm thu, an toàn lao động hoặc môi trường công trường."
---

# QA/QC & SAFETY SENTINEL — QUY CHUẨN CHẤT LƯỢNG 3 BÊN, BBNT & GIÁM SÁT HSE AI

Bộ Skill này đóng gói toàn bộ tri thức kiểm soát chất lượng công trình (**Nghị định 06/2021/NĐ-CP**), quy trình nghiệm thu điểm dừng (Hold-Point Inspection), quản lý lỗi NCR/Punch-list, quy trình ký số điện tử pháp lý 3 bên, và thuật toán thị giác máy tính AI phát hiện mối nguy an toàn lao động (**QCVN 18:2021/BXD**) cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Khóa Chặn Điểm Dừng Nghiệm thu (Hold-Point Lock Invariant):**
   - Đối với các hạng mục công việc quan trọng (Lắp đặt ống ngầm trong bê tông dầm sàn, Thử áp lực đường ống nước, Thử kín ống gió, Thử nghiệm liên động PCCC): Tuyệt đối KHÔNG được tiến hành công việc tiếp theo (Đổ bê tông, Đóng trần, Lấp đất) nếu chưa có Biên bản nghiệm thu công việc (BBNT) ký duyệt bởi Tư vấn Giám sát (TVGS).
   - Mọi nỗ lực cập nhật tiến độ công việc liên quan vượt quá giai đoạn Hold-Point sẽ bị API chặn đứng với mã lỗi 403 / 422.

2. **Quy trình Khép kín Phiếu Không phù hợp (NCR Closure Invariant):**
   - Một phiếu NCR (Non-Conformance Report) hoặc đầu việc Punch-List chỉ được phép đóng (Status = `CLOSED`) khi có đầy đủ bộ chứng cứ 3 bước:
     1. Bức ảnh chụp hiện trạng sai lỗi ban đầu kèm vị trí không gian 3D.
     2. Báo cáo nguyên nhân & Biện pháp khắc phục đã được TVGS phê duyệt.
     3. Bức ảnh chụp nghiệm thu lại sau khi nhà thầu đã sửa chữa hoàn tất.

3. **Thang Phân cấp An toàn & Cảnh báo Tức thời (Safety Escalation Invariant):**
   - Phát hiện vi phạm an toàn cấp độ `CRITICAL` (Công nhân làm việc trên cao $\ge 2\text{m}$ không đeo dây an toàn móc vào điểm neo cố định, Mép sàn/lỗ mở không có lan can rào chắn, Làm việc dưới tầm quay cẩu tháp không đội mũ bảo hộ):
   - Hệ thống BẮT BUỘC tự động sinh Phiếu xử lý an toàn (HSE Action Ticket) và gửi thông báo khẩn cấp Push Notification/Telegram cho Chỉ huy trưởng và Kỹ sư An toàn.

---

## 2. QUY TRÌNH 5 BƯỚC QUẢN LÝ CHẤT LƯỢNG QA/QC & AN TOÀN HSE

```
[B1: Kế hoạch ITP & Hold-Points] ──► [B2: Nghiệm thu Hiện trường & e-Sign] ──► [B3: Xử lý Sai lỗi NCR/Punch-list] ──► [B4: Camera AI Quét An toàn HSE] ──► [B5: Đóng dấu Hồ sơ Hoàn công]
```

### Bước 1: Thiết lập Kế hoạch Thí nghiệm & Nghiệm thu (ITP Setup)

- Xây dựng Kế hoạch Kiểm tra & Thí nghiệm (Inspection and Test Plan - ITP) cho từng gói thầu MEPF.
- Định nghĩa rõ ràng 3 cấp độ điểm kiểm tra:
  - **H (Hold Point):** Điểm dừng bắt buộc — TVGS phải có mặt nghiệm thu và ký biên bản mới được làm tiếp.
  - **W (Witness Point):** Điểm chứng kiến — Thông báo cho TVGS trước 24h; nếu TVGS không có mặt sau thời gian quy định, nhà thầu được quyền tiếp tục.
  - **R (Review Point):** Điểm rà soát hồ sơ chứng chỉ vật liệu (CO/CQ, Mill Test, Kết quả nén mẫu).

### Bước 2: Nghiệm thu Hiện trường & Ký số Điện tử 3 Bên (e-Sign Protocol)

- Kỹ sư nhà thầu gửi Yêu cầu Nghiệm thu (Request for Inspection - RFI) kèm vị trí và bản vẽ Shop.
- Nghiệm thu tại hiện trường qua thiết bị di động:
  - Kiểm tra kích thước hình học, độ phẳng, độ dốc, độ đồng trục.
  - Chụp ảnh hiện trường có gắn mốc tọa độ và thời gian thực.
- Quy trình ký số thông minh (Paperless Smart e-Signature `/engineering/esign`):
  - **Bên 1:** Kỹ sư Trưởng Nhà thầu ký số.
  - **Bên 2:** Kỹ sư Giám sát (TVGS) kiểm tra và ký số.
  - **Bên 3:** Đại diện Ban QLDA / Chủ đầu tư ký xác nhận.
  - Đóng gói mã băm SHA-256 niêm phong tài liệu và sinh Chứng chỉ Kiểm toán BBNT (`CERT-BBNT-...`).

### Bước 3: Quản trị Phiếu Không phù hợp (NCR & Punch-List Tracker)

- Khi phát hiện lỗi thi công không đạt chuẩn: Phát hành phiếu NCR ghi rõ điều khoản sai lệch (TCVN, Bản vẽ thiết kế, Quy chuẩn kỹ thuật).
- Phân loại mức độ lỗi: `Minor` (Lỗi nhẹ, thẩm mỹ) $\rightarrow$ `Major` (Ảnh hưởng độ bền, sai kích thước) $\rightarrow$ `Critical` (Nguy cơ sập đổ, mất an toàn).
- Yêu cầu nhà thầu gửi Biện pháp xử lý (Method of Rectification) trong 48h.
- Nghiệm thu đóng phiếu và lưu trữ vào sổ nhật ký chất lượng.

### Bước 4: Giám sát An toàn Lao động Tự động qua Camera AI Vision (HSE AI Sentinel)

- Phân tích luồng hình ảnh/video từ camera công trường (`/engineering/hse-vision`):
  - Nhận diện phương tiện bảo hộ cá nhân (PPE: Mũ bảo hộ, Áo phản quang, Dây đai an toàn, Kính bảo hộ).
  - Phát hiện vùng nguy hiểm: Khu vực bán kính quay cẩu tháp, Hố đào sâu không che chắn, Mép sàn chưa lắp lan can.
  - Phát hiện hành vi nguy hiểm: Hút thuốc nơi chứa vật liệu dễ cháy, Đi lại dưới vật thể đang cẩu nâng.
- Tính toán Chỉ số An toàn Công trường (Site Safety Index - SSI) hàng ngày:
  $$SSI = 100 - \sum (\text{Defect Count}_i \times \text{Weight}_i)$$
- Tự động sinh phiếu xử phạt vi phạm an toàn kèm ảnh trích xuất và căn cứ pháp lý QCVN 18:2021/BXD.

### Bước 5: Tiếp nhận Quan trắc Môi trường IoT & Đóng Dấu Hồ Sơ Hoàn Công Pháp Lý

- Kết nối dữ liệu cảm biến IoT trắc đạc, độ nghiêng lún, đo nồng độ bụi PM2.5 và độ ồn dB (QCVN 05:2023/BTNMT).
- So khớp kiểm tra dung sai hình học Scan-to-BIM / LiDAR trước khi cho phép đóng dấu bản vẽ hoàn công:
  - $\Delta \le 15\text{mm}$: Đạt chuẩn nghiệm thu.
  - $\Delta > 35\text{mm}$: Buộc phải có NCR đóng hoặc Phiếu phê duyệt thay đổi hiện trường (FCR) kèm chữ ký TVGS.
- Tự động đóng gói toàn bộ BBNT đã ký số 3 bên, kết quả thí nghiệm T&C và bản vẽ As-Built Redline có đóng khung dấu hoàn công theo **Nghị định 06/2021/NĐ-CP (Phụ lục II)** thành Hồ sơ Quản lý Chất lượng Hoàn công (As-Built Quality Dossier LOD 500) phục vụ bàn giao công trình.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] hold-points-and-ncr-closure-sop

# CẨM NANG ĐIỂM DỪNG KỸ THUẬT (HOLD-POINTS) & MA TRẬN ĐÓNG PHIẾU NCR 3 BƯỚC

## 1. MA TRẬN ĐIỂM DỪNG KỸ THUẬT (HOLD-POINT MATRIX)

| Hạng mục thi công                    | Điểm dừng (Hold Point)        | Tiêu chí nghiệm thu bắt buộc                                   | Bên ký duyệt          |
| :----------------------------------- | :---------------------------- | :------------------------------------------------------------- | :-------------------- |
| **Ống luồn điện/nước trong sàn dầm** | Trước khi đổ bê tông          | Cố định chắc chắn, bịt kín đầu ống, không gãy dập, đúng cao độ | Kỹ sư NT + TVGS       |
| **Đường ống cấp nước áp lực**        | Trước khi đóng trần / hộp gen | Thử áp lực $1.5 \times P_{\text{làm việc}}$ duy trì 2 giờ      | Kỹ sư NT + TVGS       |
| **Đường ống gió điều hòa/hút khói**  | Trước khi bọc cách nhiệt      | Thử kín khói / rò rỉ áp suất DW143                             | Kỹ sư NT + TVGS       |
| **Cáp điện động lực ngầm**           | Trước khi lấp đất mương cáp   | Đo điện trở cách điện Megger $\ge 10\text{ M}\Omega$           | Kỹ sư NT + TVGS       |
| **Liên động PCCC tòa nhà**           | Trước khi mời Cảnh sát PCCC   | $100\%$ kịch bản Cause \& Effect kích hoạt đúng                | Kỹ sư NT + TVGS + CĐT |

---

## 2. QUY TRÌNH ĐÓNG PHIẾU NCR 3 BƯỚC KHÉP KÍN

$$\text{Status(NCR)}: \text{ISSUED} \xrightarrow[\text{Bằng chứng ảnh lỗi}]{\text{Bước 1}} \text{UNDER\_RECTIFICATION} \xrightarrow[\text{Biện pháp khắc phục}]{\text{Bước 2}} \text{RE-INSPECTED} \xrightarrow[\text{TVGS ký duyệt}]{\text{Bước 3}} \text{CLOSED}$$

1. **Bước 1 (Phát hành):** TVGS/Kỹ sư QA chụp ảnh lỗi, gán mã vị trí tầng/zone và phát hành phiếu NCR với thời hạn khắc phục 48h-72h.
2. **Bước 2 (Khắc phục):** Nhà thầu tiến hành sửa chữa hiện trường, nộp Bản giải trình nguyên nhân & Biện pháp khắc phục kèm ảnh sau sửa.
3. **Bước 3 (Nghiệm thu lại & Đóng phiếu):** TVGS kiểm tra thực địa, nếu đạt yêu cầu thì ký số đóng phiếu NCR. Dữ liệu tự động lưu vào Sổ tay Chất lượng dự án.

---
