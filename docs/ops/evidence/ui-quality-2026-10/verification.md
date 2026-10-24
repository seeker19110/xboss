# UI tin cậy, tra cứu ma trận và giảm lặp — 24/10/2026

Bugfix/refactor mức S trên main `079e79ef` sau PR #678. Chủ dự án ủy quyền:
“rồi làm tất cả các việc còn lại bạn có thể quyết, ưu tiên chất lượng, đơn giản hoá”.
Giữ UAT và usage WAITING; không xóa capability hoặc thay schema/API/quyền.

## Lỗi và cách sửa

- Admin/PM tạo hạng mục tại `/progress/acmv`: Enter khi POST chờ từng gửi ba request.
  Dùng form semantic và guard đồng bộ, giữ tên/lỗi khi abort/403/500, khóa đóng khi
  pending. Payload `name`/`systemId` và redirect giữ nguyên; retry cuối qua API test thật.
- Admin sửa nhãn: cache từng đổi và editor đóng trước PATCH thành công, HTTP lỗi bị
  bỏ qua. Chỉ commit cache sau `res.ok`, cùng handler cho Enter/Lưu/Mặc định; lỗi giữ
  draft, cancel/reset và focus về trigger. Label rõ, input mobile 16px, target 44px.
- Mặt bằng: GET lỗi từng trở thành dữ liệu rỗng hoặc rejection không bắt. Phân biệt
  loading/error/empty, có retry, giữ và đánh dấu ma trận cũ khi refresh lỗi, bỏ response
  cũ/aborted/unmounted. Form thêm/sửa dùng chung thay hai prompt nối tiếp, giữ draft,
  validation và guard pending; giữ payload, export và confirmation ẩn công tác.
- Review phát hiện cache `fetchMe()` giữ null sau lỗi tạm thời. Page dùng helper
  `invalidateMe()` hiện hữu khi tài khoản thiếu hoặc cycle hiện hành lỗi mạng;
  không reset từ request cũ/cancel. Matrix 401 đi qua flow purge/lock/redirect hiện hữu.
  Không sửa helper auth hoặc điều kiện phân quyền.
- HSE/Risks dùng hai module metadata thuần cho client/server. Giữ nguyên 17 khai báo,
  thứ tự/nhãn/enum, DTO/validation/query/payload và re-export server tương thích.
- Ma trận dùng index tầng → công tác memoized thay `fronts.find` trong mỗi ô. Helper
  giữ row đầu, object reference, nhãn phân biệt hoa/thường; ID công tác là số nguyên
  từ API. Tốn thêm Map O(N) references, không sao chép DTO hoặc đổi thứ tự render.

## Kiểm chứng hành vi

RED source UI `6b631f15`: POST thực tế 3 thay 1; editor biến mất trước PATCH success;
error/retry ma trận không hiện, source dùng empty thay lỗi; nút thêm cũ 32px.
RED riêng trên checkpoint `f370190e` sau sửa cache lần đầu: auth và matrix cùng abort,
bấm một lần retry vẫn chưa hiện ma trận. Trace chỉ có một GET auth và hai GET matrix.
Sau sửa catch hiện hành, ca này đạt trên cả desktop/mobile.

[red-summary.json](red-summary.json) ghi riêng checkpoint/build/hash và giới hạn.
Trace/raw log test local giữ ignored, không commit cookie hoặc nội dung trace.

- Trước sửa Modal, 38 ca browser mới + 1 setup đạt 39 pass/0 fail/skip.
- Bản cuối `b76fcc44`: nhóm kết hợp 135 ca trên desktop/mobile, **134 pass, 0 fail,
  1 skip cũ, retries 0**. Gồm 42 ca hành vi mới, 91 ca hành vi cũ và một setup đạt;
  skip là ca kéo bằng chuột M135 trên mobile có sẵn. Bao gồm abort/403/500/retry,
  pending/Enter, reset/focus, 401/cache auth lỗi kép, stale response, PM/viewer,
  mobile 360/393px, tạo sheet qua API test thật và axe hai theme.
- Rà tên Modal tái hiện RED trên bản trước: tên chứa cả “Sửa text (Admin)”. Sửa nhỏ
  tách span chữ đã lưu khỏi control, giữ nhãn đã tùy chỉnh và tên khi edit/pending/lỗi;
  chỉ đổi sau PATCH thành công. Targeted 15/15 mới/cũ đạt, sau đó toàn nhóm trên đạt.
  Assertion M137 cũ giữ nguyên. Xem lịch sử RED và kết quả ở JSON.
- 7 unit index đạt: empty, missing, duplicate-first, identity/DTO, free-text/Unicode,
  nhãn phân biệt hoa/thường và cặp khóa không nhập nhằng.
- Full release gate trên `f83a1fe9`: 385 file, **5.165 pass, 0 fail, 1 skip health**
  có sẵn trong allowlist. Lượt này trước sửa hai file UI Modal/EditableText; các domain,
  metadata/index/lock không đổi; browser cuối kiểm lại UI, CI sẽ chạy lại toàn bộ.
- Production build trên Node 24.22.1 tại `b76fcc44` đạt; gate tĩnh trên `612ba825`
  đạt **18/18**. Freshness ban đầu fail vì PROGRESS chưa commit, đã commit và chạy lại.
  Audit toàn bộ **0 vulnerability**. Hai review độc lập không tìm thêm P1/P2 trong
  phạm vi workfront/index/metadata và sửa Modal.

Số liệu/checkpoint/hash trong [checks.json](checks.json); không gộp các lượt riêng
thành số pass giả. Đây là nghiệm thu local trước PR/CI/phát hành.

Form/states dùng lại Modal/Button và token hiện hữu. Không hạ threshold, thêm skip,
thay timeout/assertion hoặc đổi cấu hình test/CI để làm xanh. Ca cũ costs-recovery
flaky trên main #677 được giữ nguyên và đưa vào hồi quy lần này.

## Phép đo lookup

Node 24.22.1, cùng input và helper thực, 30 warmup/variant rồi 31 mẫu ghép cặp đảo
thứ tự. Số p50 dưới tính **cả tạo Map**, đơn vị ms mỗi lượt tra toàn ma trận.

| Synthetic hợp lệ theo schema              |      Find | Tạo index + lookup |
| ----------------------------------------- | --------: | -----------------: |
| 30 tầng × 7 công tác / 210 rows           |  0,050016 |           0,007108 |
| 80 × 40 / 3.200 rows                      | 13,712814 |           0,122587 |
| 80 × 40, thêm 20 công tác ẩn / 4.800 rows | 20,954830 |           0,165198 |

Mỗi ô giữ cùng object; rolling checksum và SHA256 toàn selected rows khớp. Index được
memoize theo array fronts từ API; không dựng lại chỉ vì mở form. Raw/source hashes,
31 mẫu và môi trường ở [lookup-benchmark.json](lookup-benchmark.json). Chạy lại:

```bash
npx tsx scripts/bench-work-front-lookup.ts > /tmp/work-front-lookup.json
```

Đây là microbenchmark synthetic, không phải kích thước production đã quan sát;
không chứng minh tốc độ DOM/React/API, thời gian trang hoặc Core Web Vitals. Lợi ích
normal nhỏ; chủ yếu giảm lookup lặp ở ma trận lớn. Không đặt timing threshold vào test.

## Kiểm tra hình thức

Ảnh cuối trên Pixel 5 mô phỏng, viewport thực 393×727, source `b76fcc44`:
[form công tác báo lỗi](stage-error.png), [editor nhãn báo lỗi](editor-error.png).
Đã xem ảnh trực tiếp: draft còn nguyên, error đọc được, form trong viewport, body
không cuộn ngang; controls mới 44px, input mới 16px. Các input settings cha có sẵn
42px/16px, không thay trong lát này. [Metrics](visual-checks.json) ghi rõ nguồn;
mọi mutation khi chụp đều mock, không phải UAT người thật.

## Phát hành và giới hạn

Qua PR, CI đầy đủ và deploy hiện hữu; health-check/rollback giữ nguyên. Không migration,
không đổi payload/quyền, không gửi email thật hoặc ghi production trong kiểm thử.
Các form-error browser phần lớn mock lỗi; tạo hạng mục retry cuối có kiểm DB disposable.
UAT Safari/cảm ứng thật, usage và quyết định bỏ capability tiếp tục WAITING theo owner.
Runtime Node trên VPS chưa có bằng chứng patch; không suy ra từ Node major của deploy.

Đây là checkpoint local trước merge. Kết quả CI, SHA merge, deploy và public smoke
sau checkpoint được ghi tại mục **Kết quả phát hành** trong PR liên kết ở goal;
không coi build local là bằng chứng production.

Đối soát sau phát hành ngày 24/10: #679 DEPLOYED tại `6a6bc0bd`; CI/deploy/public smoke cuối ở [release.json](release.json). Checkpoint local phía trên được giữ riêng.
