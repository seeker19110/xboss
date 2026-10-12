# Cập nhật golden test — checklist (dán vào PR body)

> Dùng khi một PR đổi golden/snapshot test. Chi tiết luật: `docs/framework/quality-supplements.md`
> (Nhóm 2 mục 6, tiểu mục "Golden test"). **Không** `-u`/cập nhật golden mà không điền checklist này.

## Vì sao golden đỏ

- [ ] Đã đọc diff golden — thay đổi cụ thể là gì (dán đoạn diff chính dưới đây).
- [ ] Thay đổi này khớp với một đổi hành vi **có chủ đích** trong PR: `<mô tả 1 câu>`.
- [ ] Đã tự hỏi "có giải thích được diff này bằng thay đổi khác trong PR không?" — **có**, xem trên.
      (Nếu **không giải thích được** → ĐÂY LÀ HỒI QUY, dừng lại, sang `/debug`. Không điền tiếp checklist này.)

## Diff golden (dán trực tiếp, không tóm tắt)

```diff
<dán diff golden thật ở đây>
```

## Đã chuẩn hoá trước khi so (Nhóm 2 mục 6 — mục c)

- [ ] Không còn timestamp/UUID/đường dẫn tuyệt đối trôi trong golden mới.
- [ ] Thứ tự khoá object đã sort (nếu golden là JSON).
- [ ] Chạy lại test 2 lần (locale/timezone khác nhau nếu áp dụng) — cùng kết quả.

## Xác nhận

- [ ] Đây **không phải** phản xạ "chạy `-u` cho xanh" — đã đọc diff trước khi cập nhật.
- [ ] Fixture mới không chứa dữ liệu thật (PII/token/secret) — chỉ dữ liệu tổng hợp.
