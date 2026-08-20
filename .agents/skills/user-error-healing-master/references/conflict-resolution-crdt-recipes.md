# CẨM NANG HỢP NHẤT XUNG ĐỘT TRƯỜNG ĐỘC LẬP & NGOẠI TUYẾN (CONFLICT RESOLUTION CRDT RECIPES)

Tài liệu này cung cấp giải thuật hợp nhất 3 chiều (3-Way Merge), cơ chế giải quyết xung đột cấp độ trường (Field-Level CRDT) và kỹ thuật chống trùng lặp thao tác mạng ngoại tuyến trong XBoss.

---

## 1. MÔ HÌNH HỢP NHẤT DỮ LIỆU 3 CHIỀU (3-WAY MERGE ARCHITECTURE)

Khi đồng bộ giữa **Cơ sở dữ liệu XBoss**, **Google Sheets**, và **Thiết bị Di động Ngoại tuyến (PWA Offline Queue)**:

```
          [Base Snapshot (Trạng thái chung ban đầu)]
                       /               \
                      /                 \
                     ▼                   ▼
    [Current Database State]        [Incoming State (Mobile / Sheet)]
                     \                   /
                      \                 /
                       ▼               ▼
           [Field-Level 3-Way Merge Resolver]
                           │
                           ▼
              [Merged Consistent State]
```

---

## 2. MA TRẬN PHÂN GIẢI XUNG ĐỘT CẤP ĐỘ TRƯỜNG (FIELD-LEVEL MATRIX)

| Tình Huống                      | Base Value   | Current DB   | Incoming     | Kết Quả Hợp Nhất                       | Ghi Chú Giải Thích                                               |
| :------------------------------ | :----------- | :----------- | :----------- | :------------------------------------- | :--------------------------------------------------------------- |
| **1. Chỉ Incoming Đổi**         | $A$          | $A$          | $B$          | **$B$**                                | Áp dụng incoming mượt mà không có xung đột.                      |
| **2. Chỉ Current Đổi**          | $A$          | $B$          | $A$          | **$B$**                                | Giữ current DB, incoming không thay đổi gì.                      |
| **3. Cả Hai Đổi Giống Nhau**    | $A$          | $B$          | $B$          | **$B$**                                | Cả hai cùng cập nhật cùng một giá trị.                           |
| **4. Xung Đột Trường Độc Lập**  | $(A_1, A_2)$ | $(B_1, A_2)$ | $(A_1, B_2)$ | **$(B_1, B_2)$**                       | User 1 sửa Field 1, User 2 sửa Field 2 $\rightarrow$ Giữ cả hai! |
| **5. Xung Đột Cùng Một Trường** | $A$          | $B_1$        | $B_2$        | **DB Ưu tiên hoặc Giá trị Không rỗng** | Ghi nhận conflict audit trail.                                   |

---

## 3. GIẢI THUẬT LŨY ĐẲNG & CHỐNG ĐÚP THAO TÁC (IDEMPOTENCY)

1. **Khóa Lũy Đẳng (Idempotency-Key Header):**
   - Mỗi request thay đổi trạng thái sinh UUIDv4 hoặc hash SHA-256 từ payload:
     $$\text{Request-Key} = \text{SHA256}(UserID + Action + TargetID + TimestampWindow_{5s})$$
   - Lưu vào bảng bộ nhớ đệm `idempotency_keys` với thời gian sống TTL = 10 phút.
   - Nếu phát hiện key đã được xử lý trong vòng 5 giây trước $\rightarrow$ Trả về ngay kết quả đã lưu trong cache, không chạy lại query DB.

2. **Hàng Đợi Ngoại Tuyến PWA (IndexedDB Replay):**
   - Khi mất mạng: thao tác tick tiến độ ghi vào IndexedDB.
   - Khi có mạng: Service Worker gửi tuần tự theo cơ chế FIFO.
   - Nếu server trả về 409 Conflict hoặc 422: Hệ thống chạy hàm `fieldLevel3WayMerge()` để cứu vãn các trường hợp lệ thay vì hủy toàn bộ gói dữ liệu.
