---
name: zero-error-construction-tracker
description: "Quy chuẩn kỹ thuật tối thượng về Thi công & Tracking Không Sai Sót (Zero-Error Construction & Field Tracking), kết hợp đa tầng thủ công và công nghệ, chống ảo giác AI (Anti-Hallucination Ground Truth), triệt tiêu gian dối hiện trường (Anti-Fraud Challenge Watermark, Anti-Fake-GPS), đối soát định lượng 4 chiều (BIM-BOQ-PO-Field) và ngắt mạch an toàn đổ bê tông (Concealed Work Circuit Breaker) trong XBoss. Bắt buộc kích hoạt khi kiểm soát hiện trường, nghiệm thu công tác ngầm, xác minh dữ liệu thực địa hoặc giải quyết nghi vấn gian lận/sai lệch."
---

# ZERO-ERROR CONSTRUCTION TRACKER — QUY CHUẨN THI CÔNG & TRACKING KHÔNG SAI SÓT ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật, giải thuật bảo vệ đa tầng, quy chuẩn kiểm soát thực địa thủ công kết hợp công nghệ cao, phòng vệ chống ảo giác AI (Anti-Hallucination Ground Truth), giao thức triệt tiêu gian dối số liệu (Anti-Fraud Dynamic Challenge & Geofencing) và ngắt mạch an toàn công tác ngầm nhằm biến hệ thống XBoss thành **Hệ điều hành Thi công & Giám sát Không Sai Sót (Zero-Error & Tamper-Proof OS)**.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Khóa Chặn Công Tác Ngầm / Khuất (Concealed-Work Hard Lock Invariant):**
   - Tuyệt đối CẤM đổ bê tông sàn/dầm, đóng trần thạch cao hoặc lấp đất chôn ống nếu chưa có Biên bản nghiệm thu (BBNT) ký số 3 bên hợp lệ kèm bộ ảnh chụp/Scan-to-BIM chứng minh tọa độ.
   - Hệ thống ngắt mạch tự động (`pour_permits`) sẽ khóa cứng lệnh đổ bê tông nếu còn bất kỳ task ngầm nào chưa pass.

2. **Bất biến Thử Thách Động Khi Chụp Ảnh (Dynamic-Challenge-Photo Invariant):**
   - Mọi hình ảnh chụp hiện trường để báo cáo tiến độ/nghiệm thu bắt buộc phải chứa **Mã thử thách ngẫu nhiên (Dynamic Challenge Code)** còn hiệu lực trong 90 giây sinh ra từ máy chủ, tọa độ GPS nằm trong bán kính dự án $\le 50\text{m}$ (không cờ Mock GPS), và mã băm SHA-256 không trùng lặp trong 30 ngày.

3. **Bất biến Đối Soát Định Lượng 4 Chiều (Quad-Reconciliation Invariant):**
   - Khối lượng báo cáo ($Q_{\text{report}}$) và nghiệm thu thanh toán ($Q_{\text{IPC}}$) phải thỏa mãn:
     $$Q_{\text{report}} \le \min\left(Q_{\text{BIM}}, Q_{\text{BOQ}}, \sum Q_{\text{GRN\_Material}} - Q_{\text{Scrap}}\right)$$
   - Khối lượng không thể tự sinh ra nếu chưa xuất kho vật tư và không có trong mô hình thiết kế.

4. **Bất biến Neo Căn Cứ Thực Tế Triệt Tiêu Ảo Giác (Grounded-AI-Fact Invariant):**
   - AI tuyệt đối không được đưa ra nhận định tiến độ/khối lượng dạng suy đoán mập mờ.
   - Mọi nhận định AI phải gắn liền với ID cấu kiện BIM GUID, dữ liệu viễn trắc IoT (áp suất/nhiệt độ) và hình ảnh hiện trường có độ tin cậy hiệu chuẩn $C_{\text{calibrated}} \ge 0.85$. Nếu thấp hơn, AI bắt buộc chuyển sang chế độ `REQUIRE_HUMAN_INSPECTION`.

5. **Bất biến Sổ Cái Niêm Phong Mật Mã Merkle Tree (Cryptographic Merkle Proof Invariant):**
   - Mọi sự kiện cập nhật tiến độ, nghiệm thu, thay đổi hiện trường đều được băm SHA-256 đưa vào Merkle Tree. Bất kỳ sự can thiệp trực tiếp từ cơ sở dữ liệu sẽ làm gãy chuỗi Root Hash và kích hoạt cảnh báo an ninh toàn hệ thống.

6. **Bất biến Thử Áp Viễn Trắc IoT Chống Bơm Bù Gian Lận (Pressure Test Tamper-Proof Invariant):**
   - Dữ liệu thử áp đường ống nước/PCCC được truyền liên tục về máy chủ mỗi 10 giây qua IoT. Nếu phát hiện đạo hàm áp suất $\frac{dP}{dt} > 0.05\text{ bar/phút}$ trong quá trình ngâm áp 2h mà không có lệnh của TVGS $\rightarrow$ Tự động hủy ca thử áp và phát hành phiếu NCR gian lận.

7. **Bất biến Lá Chắn Định Vị Chống Giả Mạo Geofencing (Anti-Fake-GPS Shield Invariant):**
   - Ứng dụng PWA kiểm tra cờ `isFromMockProvider` (Android) / `isSimulated` (iOS) và tính toán khoảng cách Haversine so với tâm dự án. Nếu khoảng cách $d > 50\text{m}$ hoặc phát hiện phần mềm giả lập GPS $\rightarrow$ Lập tức từ chối lưu dữ liệu và khóa quyền báo cáo của tài khoản.

8. **Bất biến Bàn Giao Mặt Bằng Kèm Mốc Trắc Đạc Laser (Survey Benchmark Invariant):**
   - Không được phép triển khai lắp đặt ống trục đứng (Riser) hoặc ống hành lang nếu chưa có mốc trắc đạc laser và cos chuẩn $\pm 0.000$ được TVGS và Trắc đạc trưởng xác nhận.

9. **Bất biến Danh Mục Checklist MEPF 100% Không Bỏ Sót (Zero-Omission Checklist Invariant):**
   - Toàn bộ 100 hạng mục kiểm tra chi tiết theo bảng Checklist chuẩn MEPF bắt buộc phải được tick xác nhận đầy đủ trước khi xuất hồ sơ nghiệm thu giai đoạn.

10. **Bất biến Phân Định Tranh Biện Swarm Đa Chiều (Swarm Cross-Examination Invariant):**
    - Mọi dữ liệu tiến độ bất thường ($Z\text{-Score} \ge 2.5$) đều phải qua phiên chất vấn chéo giữa 4 Persona AI (Hiện trường, Chất lượng, Chi phí, Tiến độ) trước khi trình Kỹ sư trưởng phê duyệt.

---

## 2. QUY TRÌNH 10 BƯỚC THI CÔNG & TRACKING KHÔNG SAI SÓT

```
[B1: Kích hoạt Work-Front & Geofence] ──► [B2: Sinh Mã Dynamic Challenge] ──► [B3: Kiểm tra Thực địa 3 Bên] ──► [B4: Chụp Ảnh & AI OCR Code]
                                                                                                                        │
                                                                                                                        ▼
[B8: Swarm Debate & Grounding] ◄── [B7: Đối Soát 4 Chiều BIM-BOQ-GRN] ◄── [B6: Đo Viễn Trắc Thử Áp IoT] ◄── [B5: Kiểm tra Checklist MEPF]
        │
        ▼
[B9: e-Sign 3 Bên & Mở Khóa Pour Permit] ──► [B10: Niêm Phong Sổ Cái Merkle Tree]
```

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] anti-fraud-field-protocols

# CẨM NANG GIAO THỨC CHỐNG GIAN DỐI HIỆN TRƯỜNG & BẢO VỆ TÍNH TOÀN VẸN SỐ LIỆU

## 1. PHÂN LOẠI 5 NHÓM THỦ ĐOẠN GIAN LẬN HIỆN TRƯỜNG

1. **Gian lận Hình ảnh:** Dùng ảnh cũ, ảnh mạng, chụp góc khuất che giấu lỗi.
2. **Giả mạo Tọa độ & Thời gian:** Fake GPS, chỉnh sửa EXIF timestamp trên điện thoại.
3. **Nghiệm khống Khối lượng:** Báo cáo vượt BOQ, tính trùng lặp đầu việc.
4. **Nghiệm thu "Ma":** Ký khống trên giấy, không ra kiểm tra hiện trường.
5. **Gian lận Thử áp:** Khóa cô lập van, bơm áp bù ngầm khi đường ống bị rò rỉ.

## 2. GIAO THỨC THỬ THÁCH ĐỘNG (DYNAMIC CHALLENGE CODE)

- Máy chủ sinh mã HMAC: $\text{Code} = \text{HMAC-SHA256}(\text{ProjectID} + \text{UserID} + \text{Timestamp}) \pmod{16^6}$ (TTL = 90 giây).
- Ứng dụng chèn Watermark mật mã chứa tọa độ GPS, Sensor Pitch/Roll và Challenge Code.
- AI OCR trích xuất mã và so khớp pHash/SHA-256 chống trùng lặp trong 30 ngày.

## 3. MA TRẬN ĐỐI SOÁT ĐỊNH LƯỢNG 4 CHIỀU (QUAD-RECONCILIATION)

$$Q_{\text{báo\_cáo}} \le Q_{\text{BIM}} \quad \land \quad Q_{\text{báo\_cáo}} \le Q_{\text{BOQ}} \quad \land \quad Q_{\text{báo\_cáo}} \le \sum Q_{\text{GRN}} - Q_{\text{Đã\_dùng}}$$

---

### 3.2. [Cẩm nang kỹ thuật] anti-hallucination-ai-grounding

# CẨM NANG CHỐNG ẢO GIÁC AI & NEO CĂN CỨ THỰC TẾ (GROUND TRUTH)

## 1. CÔNG THỨC HIỆU CHUẨN ĐỘ TIN CẬY (CONFIDENCE CALIBRATION ALGORITHM)

$$C_{\text{calibrated}} = C_{\text{raw}} \times f_{\text{light}} \times f_{\text{res}} \times f_{\text{geo}} \times f_{\text{element\_match}}$$

- $f_{\text{light}} \in [0.5, 1.0]$: Hệ số ánh sáng hiện trường.
- $f_{\text{res}} \in [0.7, 1.0]$: Hệ số độ phân giải ảnh.
- $f_{\text{geo}} \in \{0.0, 1.0\}$: Hệ số toạ độ Geofence ($d > 50\text{m} \rightarrow f_{\text{geo}} = 0$).
- $f_{\text{element\_match}} \in [0.6, 1.0]$: Tỷ lệ khớp danh mục cấu kiện BIM/Shopdrawing.

### Quy tắc Quyết định:

- $C_{\text{calibrated}} \ge 0.85$: Cho phép AI đề xuất cập nhật tiến độ (Cấp A1).
- $C_{\text{calibrated}} < 0.85$: AI bị tước quyền đề xuất, chuyển sang trạng thái `REQUIRE_HUMAN_INSPECTION`.

---

### 3.3. [Cẩm nang kỹ thuật] concealed-works-and-hold-point-sop

# CẨM NANG NGẮT MẠCH CÔNG TÁC NGẦM & CẤP PHÉP ĐỔ BÊ TÔNG (POUR PERMITS)

## 1. QUY TRÌNH CẤP PHÉP ĐỔ BÊ TÔNG 4 CỔNG KIỂM SOÁT

```
[Cổng 1: Nghiệm Thu Cốt Thép & Ván Khuôn] ──► [Cổng 2: Nghiệm Thu Sleeve & Ống Luồn MEP] ──► [Cổng 3: Vệ Sinh & Dọn Rác Sàn] ──► [Cổng 4: Ký Số Pour Permit]
```

Nếu còn bất kỳ 1 điểm dừng Hold-Point nào của hệ MEP hoặc Kết cấu chưa được ký duyệt Pass $\rightarrow$ Lệnh cấp phép Pour Permit tự động khóa cứng, không thể phát lệnh trộn bê tông thương phẩm.

---

### 3.4. [Cẩm nang kỹ thuật] zero-omission-mepf-checklist

# CẨM NANG CHECKLIST MEPF 100% KHÔNG BỎ SÓT

Checklist bao gồm 5 nhóm kiểm tra không bỏ sót:

1. **Hệ Cấp thoát nước:** Độ dốc ống $1-2\%$, bẫy nước ngăn mùi P-trap, van xả khí đỉnh trục, đai treo chống rung, thử áp $1.5 \times P_{\text{lv}}$.
2. **Hệ HVAC:** Khoảng cách ty treo $\le 1.5\text{m}$, bọc bảo ôn không đọng sương, van gió VCD/FD, thử kín DW143.
3. **Hệ Điện & ELV:** Bán kính uốn cong cáp $\ge 8D$, tiếp địa máng cáp, đo cách điện cáp $\ge 10\text{ M}\Omega$, đánh số dây cáp Ferrules.
4. **Hệ PCCC:** Khoảng cách đầu phun Sprinkler $2.4 - 3.7\text{m}$, van báo động Alarm Valve, công tắc dòng chảy Flow Switch.
5. **Hành lang chung:** Phân tầng độ cao 3 tầng, khoảng cách cách ly nhiệt/điện $\ge 150\text{mm}$.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/zero_error_verifier.ts](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/scripts/zero_error_verifier.ts): Bộ kịch bản CLI kiểm chứng tự động toàn diện các trường hợp chống gian lận ảnh, Fake GPS, đối soát 4 chiều và hiệu chuẩn độ tin cậy AI.
