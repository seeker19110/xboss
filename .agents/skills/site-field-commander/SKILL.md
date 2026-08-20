---
name: site-field-commander
description: "Quy chuẩn chỉ huy tác nghiệp hiện trường, điều phối mặt bằng thi công (Work-Fronts), quản lý nhật ký thi công điện tử theo Thông tư 06/2021/TT-BXD, tiếp nhận vật tư bằng mã vạch QR Logistics và vận hành đồng bộ ngoại tuyến (PWA Offline Queue) trong XBoss. Bắt buộc kích hoạt khi xử lý công việc hiện trường, điều phối mặt bằng, ghi nhật ký hoặc tiếp nhận vật tư thiết bị."
---

# SITE FIELD COMMANDER — QUY CHUẨN CHỈ HUY HIỆN TRƯỜNG, ĐIỀU PHỐI MẶT BẰNG & LOGISTICS QR

Bộ Skill này đóng gói toàn bộ tri thức chỉ huy công trường xây dựng, quy trình bàn giao mặt bằng thi công (Work-Front Custody), tiêu chuẩn nhật ký thi công điện tử theo Thông tư 06/2021/TT-BXD, và quy trình tiếp nhận vật tư bằng mã QR di động cho nền tảng XBoss.

---

## 1. NGUYÊN TẮC BẤT BIẾN (INVARIANTS)

1. **Bất biến Bàn giao Mặt bằng (Work-Front Custody Invariant):**
   - Một phân vùng mặt bằng thi công (theo Tầng, Zone, Phòng máy) tại một thời điểm chỉ có DUY NHẤT một đơn vị/tổ đội nắm quyền kiểm soát chính (Custody Owner).
   - Mọi hoạt động bàn giao mặt bằng giữa Thầu chính - Thầu phụ hoặc giữa các Nhà thầu chuyên ngành phải có Biên bản bàn giao hiện trường (Site Handover Record) kèm hình ảnh xác nhận hiện trạng mặt bằng sạch sẽ, mốc trắc đạc và hệ thống điện/nước tạm.
2. **Bất biến Nhật ký Thi công (Diary Completeness Invariant):**
   - Theo Thông tư 06/2021/TT-BXD, nhật ký thi công mỗi ngày BẮT BUỘC có đủ 4 trường nội dung:
     1. Tình hình thời tiết (Nhiệt độ, Trời nắng/mưa, Ảnh hưởng thi công).
     2. Quân số nhân lực thi công thực tế theo từng tổ đội/nhà thầu phụ.
     3. Danh mục máy móc, thiết bị thi công đang hoạt động trên công trường.
     4. Khối lượng và vị trí các công việc chính đã thực hiện trong ngày, các sự cố phát sinh (nếu có).
3. **Bất biến Ngoại tuyến Bất biến (Offline Queue Idempotency):**
   - Khi kỹ sư thao tác tại tầng hầm hoặc vùng mất sóng: Dữ liệu được đóng gói vào IndexedDB kèm UUID, mã băm SHA-256 nội dung và mốc thời gian cục bộ.
   - Khi kết nối mạng phục hồi: Tự động gửi lại (Replay) theo cơ chế Lũy đẳng (Idempotent) — lặp lại nhiều lần không gây sinh thừa bản ghi hoặc ghi đè sai lệch dữ liệu người khác.

---

## 2. QUY TRÌNH 5 BƯỚC CHỈ HUY TÁC NGHIỆP HIỆN TRƯỜNG

```
[B1: Bàn giao Mặt bằng] ──► [B2: Điều phối Nguồn lực & Máy] ──► [B3: Quét QR Logistics Cổng] ──► [B4: Ghi Nhật ký & NLP Copilot] ──► [B5: Đồng bộ Ngoại tuyến PWA]
```

### Bước 1: Điều phối & Bàn giao Mặt bằng Thi công (Work-Front Management)

- Quản lý ma trận mặt bằng theo Tòa nhà / Tầng / Phân khu (Tower $\rightarrow$ Floor $\rightarrow$ Zone).
- Kiểm soát trạng thái mặt bằng: `chua_nhan` $\rightarrow$ `dang_thi_cong` $\rightarrow$ `cho_ban_giao` $\rightarrow$ `da_ban_giao`.
- Cảnh báo xung đột không gian (Spatial Clash) khi 2 nhà thầu phụ cùng xin cấp phép làm việc trên một khu vực hẹp.

### Bước 2: Điều phối Nguồn lực & Chống Chồng chéo Thiết bị (Resource Allocation)

- Giám sát biểu đồ Histogram nhân lực và máy móc thiết bị theo thời gian thực (`/resources`).
- Phát hiện cảnh báo gán chồng chéo (Over-allocation): 1 Kỹ sư/Thiết bị được phân công đồng thời ở $\ge 2$ vị trí cách xa nhau trong cùng một khung giờ.

### Bước 3: Tiếp nhận Vật tư & Kiểm nhận Mã QR Hiện trường (QR Mobile Logistics)

- Tiếp nhận xe chở hàng tại cổng công trường (`/engineering/qr-logistics`):
  - Dùng camera điện thoại quét mã QR/DataMatrix dán trên từng kiện hàng/ống/cuộn cáp.
  - Tự động tra cứu mã đơn hàng PO (`purchase_orders`) và đối chiếu danh mục vật tư.
  - Nhập số lượng thực nhận, ghi nhận tình trạng bao bì và tự động sinh Phiếu nhập kho tạm (Goods Receipt Note - GRN).
  - Kích hoạt quy trình kiểm tra chất lượng đầu vào (QA/QC Receiving Inspection).

### Bước 4: Lập Nhật ký Thi công Tự động qua NLP Copilot (Smart Field Diary)

- Kỹ sư hiện trường gửi tin nhắn thoại hoặc văn bản tóm tắt qua Zalo / Telegram Copilot (`/engineering/zalo-copilot`):
  - _Ví dụ:_ "Hôm nay Zone 1 tầng 12 hoàn thành 120m ống thoát nước uPVC D110, nhân lực 14 thợ Minh Tâm, thời tiết nắng ráo".
- Động cơ NLP bóc tách tự động: Hệ thống (Cấp thoát nước), Vị trí (Tầng 12 - Zone 1), Khối lượng (120m D110), Nhân lực (14), Nhà thầu (Minh Tâm), Thời tiết (Nắng).
- Điền tự động vào bảng `daily_diary` và trình Chỉ huy trưởng ký duyệt.

### Bước 5: Đóng gói Ngoại tuyến & Đồng bộ Hai chiều (Offline PWA Sync)

- Lưu trữ dữ liệu tác nghiệp (Tick tiến độ, Chụp ảnh hiện trường, Ghi nháp nhật ký) vào IndexedDB bộ nhớ đệm 50MB.
- Cơ chế Dedup ảnh 24h bằng mã băm SHA-256 (`0075_task_photos_hash.sql`) chống gửi trùng ảnh khi mạng chập chờn.
- Khi online: Service Worker tự động giải phóng hàng đợi, hiển thị Toast thông báo kết quả đồng bộ thành công cho kỹ sư.
