# CẨM NANG PHỤC HỒI CÔNG THỨC EXCEL & TÁI CẤU TRÚC MA TRẬN PHÂN CẤP (FORMULA & MATRIX HEALING)

Tài liệu này hướng dẫn giải thuật tự động tái cấu trúc bảng tính đa tầng và phục hồi các ô công thức bị gãy `#REF!`, `#VALUE!`, `#DIV/0!` trong XBoss.

---

## 1. GIẢI THUẬT PHỤC HỒI CÔNG THỨC GÃY (FORMULA HEALING ENGINE)

Khi import bảng tính dự toán hoặc bảng theo dõi tiến độ, người dùng thường làm gãy liên kết công thức do:

- Xóa dòng/cột tham chiếu dẫn đến `#REF!`.
- Tính toán trên ô chứa chuỗi ký tự dẫn đến `#VALUE!`.
- Chia cho ô rỗng hoặc bằng 0 dẫn đến `#DIV/0!`.

### Quy Trình Suy Luận Cân Bằng Hàng/Cột (Row/Column Balance Invariant)

```
[Phát hiện #REF! / #VALUE!] ──► [Thu thập các Ô Thành phần (Siblings)] ──► [Xác định Loại Công thức] ──► [Tái sinh Giá trị Phục hồi]
```

1. **Công thức Tổng (`SUM`):**
   $$Value_{\text{healed}} = \sum_{i=1}^{k} \text{Siblings}_i$$
2. **Công thức Bình Quân (`AVERAGE`):**
   $$Value_{\text{healed}} = \frac{1}{k} \sum_{i=1}^{k} \text{Siblings}_i$$
3. **Công thức Tích (`MULTIPLY` — Khối lượng $\times$ Đơn giá):**
   $$TotalCost_{\text{healed}} = Quantity \times UnitPrice$$

---

## 2. GIẢI THUẬT TÁI CẤU TRÚC MA TRẬN PHÂN CẤP WBS (HIERARCHY RECONSTRUCTION)

Bảng tính xây dựng Việt Nam thường không có cột `parent_id` mà chỉ phân cấp bằng định dạng thị giác (Font bôi đậm, mã nhóm `A1`, sub-tasks `A1.01`, `A1.02`).

### Thuật Toán State-Machine Matrix Parser

1. Quét từng dòng từ trên xuống dưới.
2. Nếu mã hiệu không chứa dấu chấm (`A1`, `A2`, `M1`) và không có khối lượng $\rightarrow$ Đặt làm `currentGroup`.
3. Mọi dòng tiếp theo có mã hiệu dạng `A1.xx` $\rightarrow$ Tự động gán vào mảng con `currentGroup.tasks`.
4. Nếu gặp mã nhóm mới (`A2`) $\rightarrow$ Đóng nhóm `A1` và mở nhóm `A2`.
5. Nếu file hoàn toàn không có mã nhóm $\rightarrow$ Tự động bọc vào nhóm ảo `GENERAL ("Hạng mục chung")`.
