# GIẢI THUẬT TỐI ƯU CẮT PHÔI 1D & 2D XƯỞNG GIA CÔNG (NESTING RECIPES)

Tài liệu cung cấp giải thuật toán học và công thức tối ưu xếp cắt phôi ống thép, máng cáp (1D Cutting Stock) và tôn ống gió (2D Sheet Metal Nesting) giúp giảm tỷ lệ phế liệu xuống dưới $1.8\%$.

---

## 1. Bài Toán Cắt Phôi Tuyến Tính 1D (1D Linear Cutting Stock Problem)

### 1.1 Thông số Đầu vào & Ràng buộc Kỹ thuật

- **Chiều dài cây phôi tiêu chuẩn ($L_{\text{stock}}$):** Thông thường $6000\text{mm}$ (6.0m) cho ống thép, ống đồng, máng cáp và thanh Unistrut.
- **Bề rộng mạch cắt cưa ($W_{\text{kerf}}$):** $3\text{mm} - 5\text{mm}$ cho mỗi lần cắt.
- **Đoạn đầu mút loại bỏ ($L_{\text{trim}}$):** $10\text{mm} - 20\text{mm}$ cho mỗi đầu cây nguyên phôi (đầu ba via hoặc vát xưởng).
- **Danh sách đoạn ống yêu cầu ($D = \{(l_1, q_1), (l_2, q_2), \dots, (l_n, q_n)\}$):**
  - Chiều dài đoạn gia công $l_i$ và số lượng $q_i$.

### 1.2 Giải thuật First-Fit Decreasing (FFD)

```python
def optimize_1d_nesting(demand_items, stock_length=6000, kerf_width=3, trim_loss=20):
    """
    demand_items: list of cut lengths [1200, 2400, 1500, 800, ...]
    returns: list of stocks, each containing cuts and remaining scrap
    """
    usable_length = stock_length - (2 * trim_loss)
    # Sắp xếp giảm dần chiều dài để ưu tiên phôi lớn
    sorted_items = sorted(demand_items, reverse=True)

    stocks = [] # [{'cuts': [], 'remaining': usable_length}]

    for item in sorted_items:
        placed = False
        for stock in stocks:
            # Kiểm tra khoảng trống còn lại tính cả bề rộng mạch cắt kerf
            needed_space = item if len(stock['cuts']) == 0 else (item + kerf_width)
            if stock['remaining'] >= needed_space:
                stock['cuts'].append(item)
                stock['remaining'] -= needed_space
                placed = True
                break

        if not placed:
            # Mở cây phôi mới
            stocks.append({
                'cuts': [item],
                'remaining': usable_length - item
            })

    total_material_used = len(stocks) * stock_length
    total_net_length = sum(demand_items)
    scrap_rate = (total_material_used - total_net_length) / total_material_used * 100

    return {
        'total_stocks': len(stocks),
        'scrap_rate_percent': round(scrap_rate, 2),
        'cut_patterns': stocks
    }
```

---

## 2. Bài Toán Xếp Cắt Tôn Tấm 2D (2D Sheet Metal Nesting)

### 2.1 Quy tắc Xếp Tôn Ống Gió (Guillotine Cut Invariants)

- **Kích thước cuộn tôn tiêu chuẩn:** Chiều rộng cuộn $1200\text{mm}$ hoặc tấm tiêu chuẩn $1200\text{mm} \times 2400\text{mm}$.
- **Đường cắt Suốt (Guillotine cut):** Máy xả băng và máy cắt tôn chỉ cắt thẳng xuyên suốt cạnh tấm tôn.
- **Quy tắc Ghép Khai Triển (Pattern Pairing):**
  - Luôn ghép cặp 2 chi tiết Cút 90° (Elbow Cheek) quay lưng vào nhau để lấp đầy hình chữ nhật bao.
  - Các chi tiết Côn thu (Reducer) xếp lồng đối đỉnh để triệt tiêu diện tích tam giác phế liệu.

---

## 3. Quản Lý Phôi Thừa Tái Sử Dụng (Remnant Management)

Khi lượng phế liệu thừa ($L_{\text{remnant}}$) của một cây phôi:

1. $L_{\text{remnant}} \ge 1200\text{mm}$: Tự động gán mã Barcode **Remnant Stock** và đưa vào kho phôi ưu tiên cho các đợt cắt chi tiết ngắn sau.
2. $300\text{mm} \le L_{\text{remnant}} < 1200\text{mm}$: Chuyển sang tổ gia công bích phụ, cút ngắn hoặc giá đỡ gối ngắn.
3. $L_{\text{remnant}} < 300\text{mm}$: Bán phế liệu tái chế kim loại (Scrap metal).
