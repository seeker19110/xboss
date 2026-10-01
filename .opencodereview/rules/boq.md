## BOQ / khối lượng (VÙNG RỦI RO CAO)

- BOQCODE duy nhất **toàn hệ thống** trên `tasks`, `work_packages`, `materials`, `boq_items`. Nguồn sự thật là ràng buộc DB (`boq_codes` + trigger); `boqTakenBy` (`lib/khoi-luong/boq.ts`) là lưới an toàn phụ — tạo/sửa mã phải kiểm `boqTakenBy` trước để trả lỗi 409 thân thiện, và vẫn phải bắt lỗi unique từ DB (race 2 request cùng mã).
- Import BOQ: đối chiếu theo mã với bản ghi có sẵn trước khi tạo mới (không sinh trùng); dòng lỗi báo rõ số dòng + lý do, không bỏ qua im lặng.
- Khối lượng/đơn giá là NUMERIC: tổng tiền làm trong SQL hoặc qua `lib/nen/money.ts`, không nhân float JS.
- Định mức (`norms`): chia cho định mức = 0 hoặc null phải xử lý rõ.
