# PR #677 — bổ sung vá Undici khi kiểm cổng audit

Ngày 24/10/2026, sau khi push phần UI tại `cd1a2cee`, audit production cùng lock tái
hiện exit 1: một high ở Undici, một moderate ở Nodemailer. Đây là dependency có sẵn
trên main #676, không phải dependency được thêm bởi phần UI.
[CI đầu](https://github.com/seeker19110/xboss/actions/runs/40053581102) sau đó kết thúc:
chỉ static/audit production thất bại, cùng advisory trong cả sáu lượt; build, full
PostgreSQL, coverage và bốn E2E shard đều đạt. Không tính lượt này là CI xanh.

Lock thực tế là **Undici 8.10.2**, range gốc `^8.10.0`; `8.12.1` trong audit là cuối
dải bị ảnh hưởng, không phải version đang cài. [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)
và [release chính thức 8.12.2](https://github.com/nodejs/undici/releases/tag/v8.12.2)
xác nhận affected `>=8.0.0 <8.12.2`, patched `8.12.2`. Phản hồi HTTP độc hại có quá
nhiều content-encoding có thể làm tiến trình kết thúc vì lỗi stream chưa được xử lý.
Không kết luận XBoss đã bị khai thác từ kết quả audit package.

## Phạm vi bổ sung M137-R1

Trong yêu cầu triển khai tiếp đã được owner giao, agent thực hiện bản sửa cần thiết để
qua cổng phát hành: pin riêng `undici` **8.12.2**, cùng major 8, không thêm capability.
Hai manifest chỉ đổi range gốc và version/resolved/integrity của đúng một package.
Không dùng `npm audit fix`, không sửa CI/threshold, app/API/auth, schema hoặc guard SSRF.
Đây là ngoại lệ được ghi rõ cho phạm vi ban đầu không đổi dependency của M137.

`lib/bao-mat/webhooks.ts` là direct import runtime duy nhất: dùng `Agent` và `fetch` từ
cùng gói. Giữ DNS pinning/fail-closed khi có IP private, redirect manual, HMAC, timeout,
retry và tenant scope; không chuyển sang fetch toàn cục của Node.

## Kiểm chứng và giới hạn

- Sau pin, cùng audit exit 0: **0 high, 0 critical**, còn một package moderate
  **Nodemailer 10.0.14** có sẵn. Không tuyên bố audit bằng không, không nâng gói khác.
- `webhooks.test.ts`, `audit-webhook-tenant.test.ts`, `webhook-inbound.test.ts`: 18 pass,
  0 fail/skip; gồm ca DNS rebinding qua **Agent/fetch thật** bị chặn tại connect.
- `audit-push-ssrf.test.ts`: 3 pass, 0 fail/skip. Chạy tuần tự trên DB disposable local,
  không gọi provider hoặc production; không sửa test/guard để đạt.
- Build production mới đạt; gate 18/18 và browser chạy lại trên package mới: 128 pass,
  0 fail, một skip sidebar có sẵn (gồm setup), 50 ca mới đều đạt, không retry. Đo lại
  20 mẫu candidate, 40 hash baseline/candidate khớp. [Kết quả/giới hạn](verification.md).
- Full local 5.152 pass trong hồ sơ UI thuộc checkpoint `cd1a2cee` trước nâng Undici.
  Full CI trên HEAD mới phải đạt, không lấy CI của HEAD trước vá thay thế.

Review độc lập package diff không còn P1/P2. Pin npm Undici không cập nhật Undici tích
hợp trong Node hoặc global fetch: local Node 24.21.0 báo bundle 7.29.1; chưa đối soát
bundle/patch production. Chỉ kết luận dependency trực tiếp/webhook đã dùng bản sửa,
không kết luận toàn bộ HTTP client hoặc runtime production đã hết advisory.

Merge/deploy theo L1; không phát hành khi CI đỏ. Nếu phát sinh lỗi tương thích, giữ
NO-GO tới khi có bản sửa phù hợp, không quay lại dependency bị advisory để bỏ qua cổng.
