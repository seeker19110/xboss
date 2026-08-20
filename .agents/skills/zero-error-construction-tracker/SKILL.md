---
name: zero-error-construction-tracker
description: "Quy chuẩn kỹ thuật tối thượng về Thi công & Tracking Không Sai Sót (Zero-Error Construction & Field Tracking), kết hợp đa tầng thủ công và công nghệ, chống ảo giác AI (Anti-Hallucination Ground Truth), triệt tiêu gian dối hiện trường (Anti-Fraud Challenge Watermark, Anti-Fake-GPS), đối soát định lượng 4 chiều (BIM-BOQ-PO-Field) và ngắt mạch an toàn đổ bê tông (Concealed Work Circuit Breaker) trong XBoss. Bắt buộc kích hoạt khi kiểm soát hiện trường, nghiệm thu công tác ngầm, xác minh dữ liệu thực địa hoặc giải quyết nghi vấn gian lận/sai lệch."
---

# ZERO-ERROR CONSTRUCTION TRACKER — QUY CHUẨN THI CÔNG & TRACKING KHÔNG SAI SÓT

Bộ Skill này đóng gói toàn bộ tri thức kỹ thuật, giải thuật bảo vệ đa tầng, quy chuẩn kiểm soát thực địa thủ công kết hợp công nghệ cao, phòng vệ chống ảo giác AI và triệt tiêu gian dối số liệu nhằm biến hệ thống XBoss thành **Hệ điều hành Thi công & Giám sát Không Sai Sót (Zero-Error & Tamper-Proof OS)**.

---

## 1. CÁC NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 5 INVARIANTS)

1. **Bất biến Khóa Chặn Công Tác Ngầm / Khuất (Concealed-Work Lock Invariant):**
   - Tuyệt đối KHÔNG được đổ bê tông sàn/dầm, đóng trần thạch cao hoặc lấp đất chôn ống nếu chưa có Biên bản nghiệm thu (BBNT) ký số 3 bên hợp lệ kèm bộ ảnh chụp/Scan-to-BIM chứng minh tọa độ.
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

5. **Bất biến Sổ Cái Niêm Phong Mật Mã (Cryptographic Merkle Proof Invariant):**
   - Mọi sự kiện cập nhật tiến độ, nghiệm thu, thay đổi hiện trường đều được băm SHA-256 đưa vào Merkle Tree. Bất kỳ sự can thiệp trực tiếp từ cơ sở dữ liệu sẽ làm gãy chuỗi Root Hash và kích hoạt cảnh báo an ninh toàn hệ thống.

---

## 2. QUY TRÌNH 5 BƯỚC THI CÔNG & TRACKING KHÔNG SAI SÓT

```
[B1: Kích hoạt Work-Front & Challenge] ──► [B2: Kiểm tra Thực địa 3 Bên] ──► [B3: Đối soát 4 Chiều & Viễn trắc IoT] ──► [B4: AI Swarm Debate & Grounding] ──► [B5: e-Sign & Niêm phong Merkle]
```

### Bước 1: Kích hoạt Mặt bằng & Nhận Mã Thử Thách (Work-Front & Challenge Activation)

- Kỹ sư mở App tại hiện trường, hệ thống xác thực GPS Geofencing và sinh mã Dynamic Challenge Code 6 ký tự.
- Đối chiếu Shopdrawing đã duyệt trên thiết bị di động.

### Bước 2: Kiểm tra Thực địa Vật lý 3 Bên (Tri-Party Physical Inspection)

- Kỹ sư Nhà thầu, TVGS và Giám sát CĐT trực tiếp đo đạc kích thước hình học, độ dốc, khoảng cách giá đỡ, mối hàn/dán keo.
- Chụp ảnh bằng chứng có nhúng mã Challenge Code vào khung hình thực địa.

### Bước 3: Đối Soát 4 Chiều & Xác Thực Viễn Trắc IoT (Quad-Reconciliation & IoT Telemetry)

- Hệ thống đối chiếu tự động khối lượng thi công với BOM mô hình BIM, định mức BOQ và phiếu nhập kho GRN.
- Đọc dữ liệu áp kế điện tử IoT: Kiểm tra thời gian duy trì áp thử thủy tĩnh $1.5 \times P_{\text{làm việc}} \ge 2\text{h}$ không sụt áp.

### Bước 4: Thẩm định Chống Ảo Giác AI & Swarm Debate (AI Grounding & Consensus)

- AI Computer Vision phân tích ảnh hiện trường, nhận diện chi tiết vật thể và tính toán độ tin cậy hiệu chỉnh.
- Hội đồng AI Swarm (Site, Quality, Cost, Schedule) chất vấn chéo số liệu.

### Bước 5: Ký Số 3 Bên & Niêm Phong Sổ Cái Merkle (e-Sign & Cryptographic Sealing)

- Ba bên ký số xác nhận BBNT trên thiết bị di động.
- Hệ thống tự động mở khóa chặng tiếp theo (Circuit Breaker Release) và niêm phong Leaf Hash vào Cây Merkle.

---

## 3. CÁC TÀI LIỆU THAM CHIẾU KỸ THUẬT (REFERENCES)

- [references/anti-fraud-field-protocols.md](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/references/anti-fraud-field-protocols.md): Giao thức chống gian dối ảnh, Fake GPS, sửa EXIF và nghiệm khống khối lượng.
- [references/anti-hallucination-ai-grounding.md](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/references/anti-hallucination-ai-grounding.md): Quy chuẩn triệt tiêu ảo giác AI, hiệu chuẩn độ tin cậy và Ground Truth.
- [references/zero-omission-mepf-checklist.md](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/references/zero-omission-mepf-checklist.md): Danh mục checklist 100% không bỏ sót hạng mục công việc MEPF.
- [references/concealed-works-and-hold-point-sop.md](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/references/concealed-works-and-hold-point-sop.md): Quy trình ngắt mạch an toàn công tác ngầm và cấp phép đổ bê tông Pour Permit.

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/zero_error_verifier.ts](file:///c:/Users/liend/xboss/.agents/skills/zero-error-construction-tracker/scripts/zero_error_verifier.ts): Bộ kịch bản CLI kiểm chứng tự động toàn diện các trường hợp gian lận và ảo giác.
