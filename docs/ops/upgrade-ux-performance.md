# M136 — Kiểm chứng trải nghiệm, hiệu năng và tinh gọn

Nguồn: kế hoạch nâng cấp được chủ dự án duyệt ngày 23/10/2026; đặc tả
`docs/nang-cap/M136-trai-nghiem-hieu-nang-tinh-gon.md` và goal
`docs/goals/upgrade-ux-performance-2026-10.md`.

Kết quả ngày 23/10/2026 và dữ liệu đo nguyên bản ở
[`evidence/m136/verification.md`](evidence/m136/verification.md).

## Benchmark có thể chạy lại

`scripts/bench-app.ts` đo bản production trên server loopback và DB test/e2e/bench local.
Script không tạo fixture hay migrate. Chuẩn bị DB disposable bằng công cụ E2E hiện có, chạy
`npm run build` rồi `npm run start -- --port 3147` với cấu hình DB test và secret test tương ứng.
Không dùng dữ liệu hoặc credential production.

```bash
E2E_DATABASE_URL='<DB e2e local biệt lập>' npx tsx scripts/bench-app.ts \
  --url http://127.0.0.1:3147 --phase baseline \
  --samples 5 --concurrency 5 --out .autopilot/upgrade-baseline.json
```

Chạy lại cùng fixture/thiết bị/mạng sau thay đổi, đặt `--phase candidate` và output khác. Không
chạy test/build hay tác vụ nặng đồng thời với phép đo. Script đăng nhập bằng tài khoản test
`e2e/constants.ts`; nếu cần tài khoản test khác, dùng `BENCH_APP_EMAIL` và `BENCH_APP_PASSWORD`.

Output gồm API p50/p95, số request, kích thước và SHA-256 response, thời gian dữ liệu chính hiện,
số request/byte ở trang chủ và tracking. Mobile mô phỏng Pixel 5, mạng trễ 150ms/tốc độ tải
200.000 byte/s, CPU chậm 4 lần; context mới mỗi lượt và SW bị chặn để tách biến cache.

LCP/CLS trong output là snapshot lab tại lúc dữ liệu chính sẵn sàng, không phải kết luận Core
Web Vitals thực tế. Không đo được INP người dùng thật bằng vài lượt tải trang. Số mẫu nhỏ và tải
concurrent trong lab không chứng minh mọi dự án đều đạt SLO; luôn báo dataset, số lượt, cấu hình
và phân vị. Hash response phải đối chiếu với fixture bất biến; khác hash cần giải thích trước
khi quy kết là hồi quy.

## Kiểm kê trước khi bỏ module

```bash
INVENTORY_DATABASE_URL='<kết nối kiểm kê chỉ đọc>' \
  npm run dem:engineering -- --org 1 --project 2 --tat-ca
```

CLI dùng kết nối riêng, transaction REPEATABLE READ READ ONLY và scope cụ thể. Role bị RLS
lọc/thiếu quyền sẽ trả `unknown`, không phải 0. Bảng không có đường scope đã kiểm chứng hoặc
không tồn tại làm báo cáo không đầy đủ và exit code 1. Không tăng quyền tài khoản ứng dụng để
làm báo cáo xanh; operator kiểm kê bằng role đã được cấp cho nhiệm vụ đọc phù hợp.

Không suy ra “không ai dùng” từ bảng 0 dòng hoặc tỷ lệ số dòng giữa hai lớp. Đối chiếu UI,
caller API/cron, chu kỳ nghiệp vụ, hồ sơ cần lưu và người chịu trách nhiệm. Dòng tiền thực tế và
kịch bản dự báo vẫn khác nghĩa; số lượng bản ghi không thay quyết định giữ/gộp/gỡ.

## Quan sát sử dụng

Traffic monitor là ring buffer mỗi process, không đại diện cửa sổ 30 ngày. Audit trail hiện có
có thể cung cấp bằng chứng một phần về thao tác ghi theo dự án/vai trò; không phải tất cả page
view, tác vụ tracking hay lượt sử dụng chỉ đọc. Mẫu truy vấn tổng hợp chỉ đọc dưới đây dành cho
công cụ đã xác minh scope org/project; `$1/$2/$3` là tham số ràng buộc, không nối chuỗi SQL:

```sql
SELECT (a.at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
       a.actor_role, a.entity_type, a.action,
       COUNT(*) AS changes, COUNT(DISTINCT a.actor_id) AS actors
FROM audit_log a
JOIN projects p ON p.id = a.project_id
WHERE p.org_id = $1 AND p.id = $2 AND a.at >= $3::timestamptz
GROUP BY day, a.actor_role, a.entity_type, a.action
ORDER BY day, a.actor_role, a.entity_type, a.action;
```

Chỉ xuất số tổng hợp cần thiết. Kết hợp phỏng vấn và quy trình theo kỳ để giải thích số thấp;
30 ngày không đủ cho nghiệp vụ theo quý/năm. Nếu cần page view hoặc tỷ lệ hoàn tất đầy đủ,
thiết lập telemetry được duyệt về dữ liệu/retention trước pilot, rồi xác nhận dữ liệu thu thực.

## UAT với người sử dụng

Thử trên 3–5 người đại diện: kỹ sư/thầu phụ dùng điện thoại và PM dùng desktop. Mỗi người làm
cùng bộ tác vụ trước/sau; ghi số lần cần hỗ trợ và thời gian hoàn tất. Hai thao tác điều hướng
là tới đúng công việc/màn hình nhập, chưa tính chụp ảnh, gõ nội dung và lưu.

| Tác vụ                                                    | Kết quả cần kiểm                                        | Trước/sau          | Đã nghiệm thu |
| --------------------------------------------------------- | ------------------------------------------------------- | ------------------ | ------------- |
| Mở việc được giao rồi cập nhật tiến độ                    | Đúng phạm vi, dễ chạm, xác nhận lưu rõ                  | Chưa đo người thật | Chưa          |
| Nhập dữ liệu, mất mạng khi lưu, kết nối và thử lại        | Giữ input, nhả pending, không gửi lặp do bấm nhanh      | Chưa đo người thật | Chưa          |
| Tìm hồ sơ từ trang bất kỳ trên mobile                     | Một nút tìm kiếm, kết quả đúng quyền/module, focus đúng | Chưa đo người thật | Chưa          |
| PM đổi lý do trễ/thứ tự và gặp HTTP 403/500               | Không báo lưu thành công giả, khôi phục thứ tự khi cần  | Chưa đo người thật | Chưa          |
| Mở nhóm tracking bằng phím; kéo thả, chọn vùng, export/in | Chức năng cũ còn đúng, focus nhìn thấy                  | Chưa đo người thật | Chưa          |

Kiểm thêm theme sáng/xanh đậm, 360/390px, modal đang mở, tab ẩn/hiện, hai người cùng thao tác,
đổi dự án và đổi tài khoản trên thiết bị dùng chung. Browser tự động bổ sung bằng chứng kỹ
thuật; Safari/iOS và thao tác cảm ứng thực vẫn cần thiết bị/người dùng thật.

## Phát hành và theo dõi

Chỉ dùng bản build đã qua các cổng và E2E tương ứng; rollout nhóm pilot, theo dõi lỗi/lưu dữ
liệu/p95 và phản hồi người dùng trên cùng chu kỳ báo cáo. Nếu lỗi mới ảnh hưởng quyền, dữ liệu,
tiến độ/nghiệm thu hoặc offline thì dừng mở rộng và revert thay đổi tương ứng. Đợt này không
thay schema/dependency nên không cần migration dữ liệu để quay lại.

Không đánh dấu toàn goal Complete khi mới có bằng chứng kỹ thuật; UAT, usage và production
verification được ghi đúng trạng thái trong hồ sơ goal.
