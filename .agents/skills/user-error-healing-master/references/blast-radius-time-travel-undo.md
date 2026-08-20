# CẨM NANG PHÒNG VỆ PHẠM VI TÁC ĐỘNG & BẢN CHỤP DU HÀNH THỜI GIAN (BLAST-RADIUS & TIME-TRAVEL UNDO)

Tài liệu này cung cấp kiến trúc và giải pháp kỹ thuật bảo vệ hệ thống trước các thao tác phá hoại hoặc sai sót diện rộng của người dùng.

---

## 1. NGUYÊN TẮC LÁ CHẮN PHẠM VI TÁC ĐỘNG (BLAST-RADIUS SHIELD)

Khi người dùng thực hiện các thao tác có khả năng gây ảnh hưởng diện rộng:

- **Thao tác 1:** Xóa hàng loạt $\ge 10$ công việc hoặc 1 Gói thầu lớn.
- **Thao tác 2:** Cập nhật hàng loạt (Bulk Update) ngày bắt đầu/kết thúc làm biến động đường găng CPM.
- **Thao tác 3:** Import đè file Excel mới vào dự án đang thi công.

Hệ thống BẮT BUỘC thực hiện chuỗi phòng vệ 3 bước:

1. **Kiểm tra Ngưỡng Nguy hiểm (Impact Threshold Check):** Đo lường số lượng bản ghi bị ảnh hưởng $(\Delta N)$ và giá trị tiền tệ biến động $(\Delta M)$.
2. **Kích hoạt Bản chụp Thời gian (Time-Travel Snapshot):** Đóng gói toàn bộ trạng thái trước khi sửa kèm mã băm SHA-256 vào bảng `system_snapshots`.
3. **Cửa sổ Hoàn tác Tức thời 24 Giờ (24h Instant Rollback Window):** Cung cấp nút **"Hoàn tác thao tác này (Undo)"** trên giao diện Toast thông báo và trang quản trị.

---

## 2. CẤU TRÚC ĐÓNG GÓI SNAPSHOT AN TOÀN

```typescript
export interface TimeTravelSnapshot<T> {
  snapshotId: string; // vd: SNAP-1724131200000-a1b2c3d4
  entityType: string; // 'tasks_bulk_update' | 'boq_import' | 'work_package_delete'
  entityId: string; // ID hoặc Scope của nhóm thực thể
  timestamp: string; // ISO 8601
  payloadHash: string; // SHA-256 Hash toàn bộ payload
  data: T; // Dữ liệu phục hồi nguyên trạng
}
```
