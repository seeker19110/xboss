# M67 — Đặc Tả Hệ Sinh Thái Trí Tuệ Nhân Tạo & Tự Động Hoá Đỉnh Cao Toàn Chuỗi Vòng Đời Thi Công MEPF

## (Autonomous & Cognitive MEPF Life-Cycle Engine)

| Thuộc tính       | Giá trị                                                |
| :--------------- | :----------------------------------------------------- |
| Issue / Goal     | GOAL-2026-PINNACLE-AUTONOMOUS-COGNITIVE-ENGINEERING-OS |
| Spec owner       | Seeker / Chief Engineering Architect                   |
| State            | **Approved for implementation**                        |
| Người/ngày duyệt | Seeker / 2026-08-19                                    |
| Cập nhật         | 2026-08-19                                             |

> **Nguyên tắc bất biến:** Không có bất kỳ hành động tự động hóa cấp A3+ nào (thay đổi trạng thái thanh toán hoặc sửa đổi thiết kế gốc) được phép thực thi mà không có sự phê duyệt có chữ ký điện tử (Single-use Cryptographic Token) của Kỹ sư trưởng / Giám đốc dự án.

---

## 1. Vấn Đề & Mục Tiêu

### 1.1 Điểm nghẽn ngành MEPF

1. **Thiết kế & Shopdrawing:** Tốn hàng trăm giờ phối hợp 3D để giải quyết va chạm (Clashes) giữa HVAC, PCCC, Cấp thoát nước và Kết cấu/Kiến trúc; mất nhiều công sức cắt đoạn gia công (Spooling).
2. **Bóc tách & QS (Takeoff):** Đếm thủ công hàng vạn van, cút, miệng gió, đầu phun; sai số khối lượng và rủi ro bỏ sót phát sinh thiết kế (Variation Order - VO).
3. **Tracking & Nghiệm thu hiện trường:** Phụ thuộc vào báo cáo Excel thủ công, chậm cập nhật và khó đối soát thực tế lắp đặt với bản vẽ hoàn công.
4. **Testing & Commissioning (T&C):** Thử nghiệm rời rạc, làm giả biên bản thử áp lực nước hoặc khó kiểm soát liên động PCCC.

### 1.2 Mục tiêu Đỉnh cao

- **Tự động bóc tách (Auto-QTO):** Đạt tốc độ $< 1.5\text{s}$ cho bản vẽ $\le 5,000$ đối tượng với độ chính xác $\ge 98\%$.
- **Tracking thực địa bằng 360°/AI Vision:** Tự động đồng bộ tiến độ 5 mốc lắp đặt vào WBS và biểu đồ S-Curve thời gian thực.
- **Tự động hóa QA/QC & BBNT:** Tự động phát hiện sai lệch hình học và sinh hồ sơ nghiệm thu kèm phụ lục khối lượng trong $< 2.0\text{s}$.
- **Closed-Loop Data:** Khép kín dòng dữ liệu từ Bản vẽ CAD $\rightarrow$ Khối lượng BOQ $\rightarrow$ Thi công thực tế $\rightarrow$ Nghiệm thu BBNT $\rightarrow$ Quyết toán $\rightarrow$ Digital Twin bàn giao vận hành.

---

## 2. Cấu Trúc 5 Phân Hệ Trọng Tâm

```text
┌───────────────────────────────────────────────────────────────────────────┐
│              AUTONOMOUS & COGNITIVE MEPF ENGINEERING ECOSYSTEM            │
├───────────────────────────────────────────────────────────────────────────┤
│  1. CAD/BIM Studio    : Generative Routing + Auto-Clash + Spool DfMA      │
│  2. AI Takeoff Engine : Multi-Modal VLM + Topological Net + 3-Way VO      │
│  3. Reality Capture   : 360° SLAM + 3D Gaussian Splatting + Scan-vs-BIM   │
│  4. QA/QC Gatekeeper  : Geometric Deviation + Code Compliance + Auto BBNT │
│  5. Smart T&C & Twin  : IoT Hydrostatic Test + Interlock Matrix + As-Built│
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Quy Chuẩn Kỹ Thuật & Kiến Trúc Dữ Liệu

### 3.1 Quy chuẩn Tiêu chuẩn Áp dụng

- **HVAC:** TCVN 5687:2010, SMACNA HVAC Duct Construction Standards.
- **PCCC:** QCVN 06:2022/BXD, TCVN 7336:2021, NFPA 13, NFPA 72.
- **Plumbing:** TCVN 4513:1988, IPC (International Plumbing Code).
- **Electrical:** TCVN 7447, IEC 60364, National Electrical Code (NEC).

### 3.2 Cơ Chế RLS & Bảo Mật

Mọi bảng kỹ thuật thuộc phân hệ MEPF đều kế thừa chính sách Row Level Security (ADR-0005):

```sql
CREATE POLICY p_eng_mepf_project ON engineering_cad_spools
  USING (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*')
  WITH CHECK (project_id::text = current_setting('app.project_id', true) OR current_setting('app.project_id', true) = '*');
```

---

## 4. Kế Hoạch Xác Minh & Gate Tiêu Chuẩn

1. `npm run lint` & `npm run typecheck`
2. `npm run check:migrations` (Đảm bảo chuỗi 100 migration liên tục, đúng định dạng)
3. `npm test -- --release-gate` (Tất cả test suite đạt 100% pass)
4. `npm run build` (Next.js App Router production build sạch sẽ)
