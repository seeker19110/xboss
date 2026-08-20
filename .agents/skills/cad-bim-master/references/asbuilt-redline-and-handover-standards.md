# QUY CHUẨN BẢN VẼ HOÀN CÔNG, MẪU DẤU PHÁP LÝ NGHỊ ĐỊNH 06/2021/NĐ-CP & DIGITAL PASSPORT LOD 500

Tài liệu này quy định chuẩn hóa kỹ thuật và pháp lý cho việc tự động tạo lập Bản vẽ Hoàn công (As-Built Redlining), đóng khung dấu bản vẽ hoàn công chuẩn Nghị định 06/2021/NĐ-CP, đối soát khối lượng quyết toán $(\Delta \text{QTO})$ và đóng gói hồ sơ bàn giao số LOD 500 trong XBoss.

---

## 1. NGUYÊN TẮC BẢN VẼ HOÀN CÔNG (AS-BUILT INVARIANTS)

1. **Bất biến Nguồn gốc Thay đổi (Change Provenance Invariant):**
   - Mọi nét vẽ điều chỉnh trên bản vẽ hoàn công so với bản vẽ Shopdrawing được duyệt bắt buộc phải có đám mây sửa đổi (Revision Cloud) màu đỏ, kèm mã tham chiếu đến Phiếu xử lý hiện trường (FCR - Field Change Request) hoặc Phiếu trả lời thiết kế (RFI) hoặc Biên bản nghiệm thu (BBNT) tương ứng.
2. **Bất biến Mẫu Dấu Pháp lý (Nghị định 06/2021/NĐ-CP - Phụ lục II):**
   - Mọi bản vẽ hoàn công phát hành chính thức phải có khung dấu hoàn công chuẩn kích thước $120\text{mm} \times 60\text{mm}$ hoặc $120\text{mm} \times 80\text{mm}$ đặt tại góc dưới bên phải bản vẽ (ngay phía trên Khung tên).
3. **Bất biến Dung sai Thực tế (Reality Scan Tolerance Invariant):**
   - Dữ liệu đo đạc trắc đạc / LiDAR 3D Point Cloud được so khớp với tọa độ thiết kế theo 3 ngưỡng:
     - $\Delta \le 15\text{mm}$: **PASS** $\rightarrow$ Chấp thuận nghiệm thu và cập nhật tọa độ As-Built trực tiếp.
     - $15\text{mm} < \Delta \le 35\text{mm}$: **WARNING** $\rightarrow$ Yêu cầu nắn chỉnh ty treo/giá đỡ hiện trường trước khi ký BBNT.
     - $\Delta > 35\text{mm}$: **CRITICAL DEFECT** $\rightarrow$ Tự động sinh Phiếu không phù hợp (NCR) và chặn xuất bản vẽ hoàn công.

---

## 2. QUY CHUẨN KHUNG DẤU BẢN VẼ HOÀN CÔNG (PHỤ LỤC II - NĐ 06/2021/NĐ-CP)

### 2.1. Mẫu số 01: Áp dụng cho Nhà thầu độc lập / Tổng thầu không có Thầu phụ

Kích thước tiêu chuẩn: $120\text{mm} \times 60\text{mm}$.

```
┌────────────────────────────────────────────────────────┐
│                   BẢN VẼ HOÀN CÔNG                     │
├────────────────────────────────────────────────────────┤
│ Tên nhà thầu: [Tên Tổng thầu / Nhà thầu thi công]      │
├──────────────────────────┬─────────────────────────────┤
│   NGƯỜI LẬP BẢN VẼ       │    CHỈ HUY TRƯỞNG           │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
├──────────────────────────┴─────────────────────────────┤
│   TƯ VẤN GIÁM SÁT TRƯỞNG (HOẶC GIÁM SÁT TRƯỞNG CĐT)    │
│   (Ký và ghi rõ họ tên)                                │
│   Ngày ..... tháng ..... năm 202...                    │
└────────────────────────────────────────────────────────┘
```

### 2.2. Mẫu số 02: Áp dụng khi có Nhà thầu phụ thi công

Kích thước tiêu chuẩn: $120\text{mm} \times 80\text{mm}$.

```
┌────────────────────────────────────────────────────────┐
│                   BẢN VẼ HOÀN CÔNG                     │
├────────────────────────────────────────────────────────┤
│ Tên nhà thầu chính: [Tên Tổng thầu / Nhà thầu chính]   │
│ Tên nhà thầu phụ:   [Tên Nhà thầu phụ thi công]        │
├──────────────────────────┬─────────────────────────────┤
│   NGƯỜI LẬP BẢN VẼ       │    CHỈ HUY TRƯỞNG THẦU PHỤ  │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
├──────────────────────────┼─────────────────────────────┤
│   CHỈ HUY TRƯỞNG THẦU CHÍNH│  TƯ VẤN GIÁM SÁT TRƯỞNG    │
│   (Ký và ghi rõ họ tên)  │    (Ký và ghi rõ họ tên)    │
│   Ngày ..... tháng ..... năm 202...                    │
└────────────────────────────────────────────────────────┘
```

---

## 3. CÔNG THỨC ĐỐI SOÁT MA TRẬN KHỐI LƯỢNG QUYẾT TOÁN 3 CHIỀU ($\Delta \text{QTO}$)

Hệ thống tính toán cân đối khối lượng thực tế hoàn công phục vụ quyết toán hợp đồng:

$$\Delta \text{QTO}_{\text{Quyết toán}} = \text{QTO}_{\text{As-Built}} - \text{QTO}_{\text{Hợp đồng}} - \text{QTO}_{\text{Phát sinh VO đã duyệt}}$$

- Nếu $|\Delta \text{QTO}_{\text{Quyết toán}}| \le 0.01$ (Khối lượng khớp tuyệt đối): **Status = `RECONCILED_CLEAN`** $\rightarrow$ Cho phép đóng hồ sơ quyết toán.
- Nếu $\Delta \text{QTO}_{\text{Quyết toán}} > 0$ (Khối lượng thực tế vượt khối lượng hợp đồng + VO): **Status = `OVERRUN_UNAPPROVED_RISK`** $\rightarrow$ Cảnh báo rủi ro xuất toán, yêu cầu bổ sung Phụ lục Hợp đồng.
- Nếu $\Delta \text{QTO}_{\text{Quyết toán}} < 0$ (Khối lượng thực tế thi công ít hơn hợp đồng): **Status = `DEDUCTION_SAVINGS`** $\rightarrow$ Tự động tính toán giá trị giảm trừ quyết toán cho Chủ đầu tư.

---

## 4. QUY TRÌNH KÝ SỐ 3 BÊN & ĐÓNG GÓI HỘ CHIẾU BÀN GIAO SỐ (LOD 500 PASSPORT)

```
[Bản vẽ As-Built & BBNT] ──► [Ký số 3 Bên SHA-256] ──► [Cân đối QTO] ──► [Gốc Cây Merkle Ledger] ──► [LOD 500 Digital Passport]
```

1. **Ký số Điện tử 3 Bên (Paperless 3-Way Smart e-Sign):**
   - **Bên 1:** Kỹ sư Shopdrawing / Kỹ thuật Nhà thầu ký số vào lớp chữ ký `SIG_CONTRACTOR_AUTHOR`.
   - **Bên 2:** Chỉ huy trưởng công trường ký số vào lớp chữ ký `SIG_SITE_COMMANDER`.
   - **Bên 3:** Tư vấn Giám sát trưởng / Giám đốc Dự án CĐT ký duyệt vào lớp `SIG_SUPERVISOR_LEAD`.
2. **Niêm phong Mật mã & Merkle Root Hash:**
   - Tập hợp mã băm SHA-256 của toàn bộ bản vẽ As-Built DWG/PDF, biên bản nghiệm thu BBNT, chứng chỉ vật liệu CO/CQ, và kết quả chạy thử T&C.
   - Nối vào Cây Merkle bất biến của dự án (`engineering_merkle_roots`), sinh chứng chỉ Token số:
     $$\text{Token Passport} = \text{"SIG-PASSPORT-LOD500-" } + \text{SHA256}(Dossier)_{\text{first 24 chars}}$$
3. **Bàn giao Vận hành Bản sao số sống (Living Digital Twin Handover):**
   - Tích hợp dữ liệu thuộc tính tài sản (Asset Tagging, Serial, Thông số kỹ thuật, Chu kỳ bảo trì MTBF/RUL) trực tiếp vào mô hình BIM/CAD phục vụ chuyển giao sang hệ thống Quản lý Tòa nhà BMS / CAFM.
