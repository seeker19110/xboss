---
name: site-field-commander
description: "Quy chuẩn chỉ huy tác nghiệp hiện trường, điều phối mặt bằng thi công (Work-Fronts), quản lý nhật ký thi công điện tử theo Thông tư 06/2021/TT-BXD, tiếp nhận vật tư bằng mã vạch QR Logistics và vận hành đồng bộ ngoại tuyến (PWA Offline Queue) trong XBoss. Bắt buộc kích hoạt khi xử lý công việc hiện trường, điều phối mặt bằng, ghi nhật ký hoặc tiếp nhận vật tư thiết bị."
---

# SITE FIELD COMMANDER — QUY CHUẨN CHỈ HUY HIỆN TRƯỜNG, ĐIỀU PHỐI MẶT BẰNG & LOGISTICS QR ĐẲNG CẤP THẦN THÁNH

Bộ Skill này đóng gói toàn bộ tri thức chỉ huy công trường xây dựng, quy trình chuyển giao quyền kiểm soát mặt bằng thi công (Work-Front Custody), tiêu chuẩn nhật ký thi công điện tử 4 khối thông tin bắt buộc theo **Thông tư 06/2021/TT-BXD**, giải thuật cân bằng biểu đồ nhân lực/máy móc (Resource Leveling & Over-allocation Detection), quy trình tiếp nhận vật tư bằng mã QR di động và cơ chế vận hành ngoại tuyến bất biến (PWA Offline Queue) cho nền tảng XBoss.

---

## 1. MƯỜI NGUYÊN TẮC BẤT BIẾN TỐI THƯỢNG (THE 10 APEX INVARIANTS)

1. **Bất biến Chủ Quyền Mặt Bằng Duy Nhất (Single Work-Front Custody Invariant):**
   - Tại một thời điểm, một phân vùng mặt bằng thi công (theo Tòa nhà $\rightarrow$ Tầng $\rightarrow$ Phân khu Zone $\rightarrow$ Phòng kỹ thuật) chỉ có DUY NHẤT một đơn vị/tổ đội nắm quyền kiểm soát chính (Custody Owner).
   - Mọi hoạt động chuyển giao mặt bằng giữa Thầu chính - Thầu phụ hoặc giữa các Nhà thầu chuyên ngành bắt buộc phải có **Biên bản Bàn giao Mặt bằng (Site Handover Record)** kèm hình ảnh xác nhận hiện trạng mặt bằng sạch sẽ, mốc trắc đạc laser và hệ thống điện/nước tạm.

2. **Bất biến Đầy Đủ 4 Khối Nhật Ký Thi Công (Circular 06/2021/TT-BXD Invariant):**
   - Nhật ký thi công mỗi ngày (`daily_diary`) BẮT BUỘC có đủ 4 khối nội dung theo quy định pháp luật:
     1. Khối Thời tiết & Môi trường: Nhiệt độ, Trời nắng/mưa, Số giờ dừng thi công do mưa (`rain_impact_hours`).
     2. Khối Quân số Nhân lực: Tổng hợp kỹ sư, thợ chính, thợ phụ phân theo từng tổ đội (`contractor_personnel`).
     3. Khối Thiết bị Thi công: Danh mục xe cẩu, vận thăng, máy hàn, máy phát điện đang vận hành (`equipment_deployments`).
     4. Khối Khối lượng & Nghiệm thu: Chi tiết công việc đã hoàn thành, vị trí tầng/zone, vật tư sử dụng và sự cố phát sinh.

3. **Bất biến Lũy Đẳng Hàng Đợi Ngoại Tuyến (PWA Offline Queue Idempotency Invariant):**
   - Khi kỹ sư thao tác tại tầng hầm hoặc vùng mất sóng: Dữ liệu được đóng gói vào IndexedDB kèm UUID, mã băm SHA-256 nội dung và mốc thời gian cục bộ.
   - Khi kết nối mạng phục hồi: Tự động gửi lại (Replay) theo cơ chế Lũy đẳng $f(f(x)) = f(x)$ — lặp lại nhiều lần không gây sinh thừa bản ghi hoặc ghi đè sai lệch dữ liệu người khác.

4. **Bất biến Chống Gán Chồng Chéo Tài Nguyên (Resource Over-Allocation Invariant):**
   - Hệ thống tự động chặn hoặc cảnh báo khi 1 Kỹ sư giám sát hoặc 1 Thiết bị trọng yếu (Cần trục, Máy nén khí) bị phân công đồng thời ở $\ge 2$ vị trí cách xa nhau trong cùng một khung giờ làm việc.

5. **Bất biến Chụp Ảnh Kèm Mã Thử Thách Động & Dedup 24 Giờ (Anti-Fraud Photo Invariant):**
   - Mọi hình ảnh chụp hiện trường để báo cáo tiến độ/nghiệm thu bắt buộc phải chứa **Mã thử thách ngẫu nhiên (Dynamic Challenge Code)** còn hiệu lực trong 90 giây sinh ra từ máy chủ, tọa độ GPS nằm trong bán kính dự án $\le 50\text{m}$ (không cờ Mock GPS), và mã băm SHA-256 không trùng lặp trong 24 giờ (`0075_task_photos_hash.sql`).

6. **Bất biến Ghi Nhận Giờ Dừng Do Thời Tiết (Weather Delay Hour Invariant):**
   - Khi trời mưa lớn $\ge 4\text{ giờ}$ trong ca làm việc, hệ thống tự động ghi nhận số giờ gián đoạn vào cột `rain_impact_hours` của nhật ký ngày để làm căn cứ pháp lý tự động đòi gia hạn tiến độ EOT theo Điều 8.4 FIDIC.

7. **Bất biến Vùng Thao Tác Ngón Cái Điện Thoại (Thumb-Zone Touch Ergonomics Invariant):**
   - Toàn bộ các nút hành động tác nghiệp hiện trường trên giao diện di động (Tick tiến độ, Chụp ảnh, Quét QR, Ký số) bắt buộc phải có kích thước tối thiểu $44 \times 44\text{px}$ và bố trí tại nửa dưới màn hình để kỹ sư dễ dàng thao tác bằng 1 ngón tay khi đang mang găng tay bảo hộ.

8. **Bất biến Tiếp Nhận QR Cổng Đối Soát PO Tức Thời (QR Gate Verification Invariant):**
   - Quét mã QR tại cổng công trường lập tức đối chiếu danh mục hàng với đơn đặt hàng PO (`purchase_orders`), kiểm tra niêm phong chì và tự động sinh Phiếu nhập kho tạm (GRN) trong vòng $\le 3$ giây.

9. **Bất biến Bàn Giao Vệ Sinh Mặt Bằng Hoàn Trả (Housekeeping Turnover Invariant):**
   - Trước khi trả lại quyền kiểm soát mặt bằng hoặc chuyển sang tổ đội tiếp theo, tổ đội thi công hiện tại bắt buộc phải dọn dẹp sạch sẽ phế liệu, rác xây dựng và chụp ảnh nghiệm thu mặt bằng sạch (Housekeeping Pass).

10. **Bất biến Quy Trình Sơ Tán Khẩn Cấp Công Trường (Site Emergency Evacuation Invariant):**
    - Khi nhận tín hiệu cảnh báo khẩn cấp (Cháy nổ, Giông lốc sập giàn giáo, Rò rỉ khí gas hầm kín), hệ thống tự động phát cảnh báo còi hú Push Notification toàn bộ thiết bị di động của kỹ sư và điểm danh công nhân tự động qua cổng quét thẻ.

---

## 2. QUY TRÌNH 10 BƯỚC KHÉP KÍN CHỈ HUY TÁC NGHIỆP HIỆN TRƯỜNG

```
[B1: Bàn giao Quyền Mặt bằng] ──► [B2: Họp Tool-Box Giao Việc] ──► [B3: Quét QR Nhập Vật tư Cổng] ──► [B4: Cấp phát Vật tư Tầng thi công]
                                                                                                                │
                                                                                                                ▼
[B8: Chụp Ảnh Bằng Chứng & Dedup] ◄── [B7: Ghi Nhật ký NLP TT 06] ◄── [B6: Đo Khối lượng & Nghiệm thu] ◄── [B5: Điều phối Nhân lực & Máy]
        │
        ▼
[B9: Dọn Dẹp Mặt Bằng Housekeeping] ──► [B10: Đồng Bộ Ngoại Tuyến PWA & Đóng Ca]
```

### Bước 1: Điều Phối & Bàn Giao Mặt Bằng Thi Công (Work-Front Custody)

- Quản lý ma trận phân vùng theo Tòa tháp $\rightarrow$ Tầng $\rightarrow$ Phân khu Zone $\rightarrow$ Phòng kỹ thuật. Ký Biên bản bàn giao mặt bằng sạch.

### Bước 2: Họp Đầu Ca & Phổ Biến An Toàn (Daily Tool-Box Meeting)

- Tập hợp quân số đầu ca, điểm danh thợ qua thẻ QR, phổ biến biện pháp an toàn và kiểm tra giấy phép PTW còn hiệu lực.

### Bước 3: Tiếp Nhận Xe Chở Hàng & Quét QR Logistics Cổng Công Trường

- Dùng camera điện thoại quét mã QR/DataMatrix dán trên từng kiện pallet/đầu ống, đối chiếu PO, kiểm tra CO/CQ và sinh phiếu GRN.

### Bước 4: Cấp Phát Vật Tư Just-In-Time Lên Từng Tầng Thi Công

- Vận chuyển vật tư lên tầng thi công theo kế hoạch Lookahead 7 ngày, kiểm soát tải trọng phân bố sàn $\le 250\text{kg/m}^2$.

### Bước 5: Điều Phối Nguồn Lực & Chống Chồng Chéo Thiết Bị

- Giám sát biểu đồ Histogram nhân lực và máy móc thiết bị theo thời gian thực (`/resources`), điều chuyển linh hoạt giữa các zone.

### Bước 6: Đo Đạc Khối Lượng Hoàn Thành Thực Tế & Kiểm Tra Kỹ Thuật

- Kỹ sư hiện trường trực tiếp đo đạc kích thước hình học, độ phẳng, độ dốc và số lượng ô kiểm tra tiến độ WBS.

### Bước 7: Lập Nhật Ký Thi Công Tự Động Qua Trợ Lý NLP Voice/Chat Copilot

- Kỹ sư gửi khẩu lệnh/tin nhắn thoại qua Zalo/Telegram; động cơ NLP tự động bóc tách 4 khối thông tin và điền vào bảng `daily_diary`.

### Bước 8: Chụp Ảnh Bằng Chứng Hiện Trường Kèm Mã Thử Thách & Dedup 24h

- Chụp ảnh bằng chứng có Dynamic Challenge Code, kiểm tra tọa độ GPS và chống tải trùng ảnh bằng mã băm SHA-256.

### Bước 9: Vệ Sinh Công Nghiệp Mặt Bằng & Nghiệm Thu Dọn Rác (Housekeeping)

- Thu gom phế liệu, đóng bao rác xây dựng, dọn dẹp mặt bằng sạch sẽ trước khi bàn giao cho tổ đội tiếp theo.

### Bước 10: Đồng Bộ Hàng Đợi Ngoại Tuyến PWA & Báo Cáo Đóng Ca Sản Xuất

- Service Worker tự động giải phóng hàng đợi IndexedDB khi có mạng, thông báo kết quả đồng bộ thành công và khóa sổ nhật ký ca.

---

## 3. TẬP HỢP CẨM NANG & QUY CHUẨN THAM CHIẾU KỸ THUẬT CHI TIẾT (CONSOLIDATED TECHNICAL REFERENCE COMPENDIUM)

### 3.1. [Cẩm nang kỹ thuật] circular-06-electronic-diary-and-nlp

# CẨM NANG NHẬT KÝ THI CÔNG ĐIỆN TỬ THEO THÔNG TƯ 06/2021/TT-BXD

## 1. CẤU TRÚC 4 KHỐI THÔNG TIN BẮT BUỘC CỦA NHẬT KÝ NGÀY

1. **Khối 1 — Thời Tiết & Điều Kiện Môi Trường:**
   - `weather_condition`: Nắng ráo, Mưa nhỏ, Mưa to giông bão.
   - `temperature_c`: Nhiệt độ trung bình trong ngày ($^\circ\text{C}$).
   - `rain_impact_hours`: Số giờ dừng thi công do mưa (căn cứ đòi EOT).
2. **Khối 2 — Quân Số Nhân Lực Thi Công:**
   - Số lượng kỹ sư, thợ bậc cao, lao động phổ thông của từng nhà thầu phụ (`contractor_personnel`).
3. **Khối 3 — Thiết Bị & Máy Móc Hoạt Động:**
   - Tên máy, biển số/mã hiệu, số giờ hoạt động, tình trạng kỹ thuật (`equipment_deployments`).
4. **Khối 4 — Nội Dung Công Việc & Sự Cố:**
   - Vị trí thi công (Tòa/Tầng/Zone), khối lượng sản lượng hoàn thành, các vấn đề phát sinh và chỉ dẫn của Kỹ sư TVGS.

---

## 2. GIẢI THUẬT BÓC TÁCH NLP KHẨU LỆNH NHẬT KÝ HIỆN TRƯỜNG

```typescript
export function parseDiaryVoiceCommand(text: string) {
  // Bóc tách vị trí, khối lượng, thầu phụ, thời tiết từ câu thoại tự do
  const floorMatch = text.match(/tầng\s*(\d+)/i);
  const zoneMatch = text.match(/zone\s*(\d+|a|b)/i);
  const qtyMatch = text.match(/(\d+)\s*(m|mét|cây|căn)/i);
  const laborMatch = text.match(/(\d+)\s*(thợ|công nhân|người)/i);
  const rainMatch = text.match(/mưa\s*(\d+)\s*(tiếng|giờ)/i);

  return {
    floor: floorMatch ? Number(floorMatch[1]) : null,
    zone: zoneMatch ? zoneMatch[1].toUpperCase() : null,
    quantity: qtyMatch ? Number(qtyMatch[1]) : null,
    laborCount: laborMatch ? Number(laborMatch[1]) : null,
    rainHours: rainMatch ? Number(rainMatch[1]) : 0,
    rawText: text,
  };
}
```

---

## 4. CÔNG CỤ THỰC THI (SCRIPTS)

- [scripts/site_field_commander.ts](file:///c:/Users/liend/xboss/.agents/skills/site-field-commander/scripts/site_field_commander.ts): Bộ kịch bản CLI kiểm chứng bóc tách NLP nhật ký thi công Thông tư 06, đánh giá bàn giao mặt bằng Work-Front và phát hiện xung đột gán tài nguyên.
