# Đặc tả pilot xác minh artifact trên staging cô lập

| Thuộc tính | Giá trị |
| ---------- | ------- |
| Issue / Goal | X-Templates T-3712 và T-3713, pilot artifact của xboss |
| Spec owner | Chủ repo xboss |
| State | **Approved for implementation** |
| Người/ngày duyệt | Chủ dự án, yêu cầu triển khai và chọn staging cô lập ngày 2026-11-08 |
| Cập nhật | 2026-11-08 |

## 1. Vấn đề và bằng chứng

Workflow VPS ghim SHA của CI và chuyển archive, còn health check hiện chỉ xác nhận dịch vụ đáp ứng. Pilot cần chứng minh tiến trình staging phục vụ đúng artifact do CI tạo. Nguồn đối chiếu ngày 2026-11-08 gồm [workflow VPS](../../.github/workflows/deploy.yml), [health](../../app/api/health/route.ts), [readiness](../../app/api/ready/route.ts) và [runbook staging](../ops/staging.md).

## 2. Kết quả và giới hạn

- Hai lượt CI tách biệt, mỗi lượt build một lần, upload artifact và dùng đúng archive đã tải lại trong job staging.
- Staging dùng app thật, PostgreSQL dùng một lần và dữ liệu giả. Mạng truy cập app giới hạn ở loopback.
- Quyền job chỉ đọc nội dung. Phạm vi pilot nằm ngoài workflow VPS và production. Cấu hình Vercel chỉ tắt deploy tự động cho nhánh pilot để giữ môi trường cô lập. Quyền duyệt production nằm ở hệ đích hiện hành.
- Rollback và restore thuộc mốc sau khi pilot đạt. Pilot dọn tiến trình và môi trường dùng một lần khi kết thúc.

## 3. Phương án

| Phương án | Lợi ích | Đánh đổi |
| --------- | ------- | -------- |
| Dùng SHA hoặc HTTP health | Tận dụng luồng hiện có | Không đủ chứng minh bytes và bản đang phục vụ |
| Chạy app thật trong job staging tách khỏi job build | Đối chiếu archive đã tải, filesystem đã cài và HTTP qua tuyến thực | Chỉ xác nhận runtime cô lập của pilot |
| Gắn ngay vào VPS | Đo trực tiếp tuyến VPS | Cần đích và quyền staging tách riêng |

Chọn chạy app thật trong staging cô lập theo lựa chọn của chủ dự án. Hai job liên kết qua artifact của cùng workflow run.

## 4. Yêu cầu và hợp đồng

- **FR1** `node scripts/ops/artifact-pilot.mjs pack <project-dir> <source-sha> <archive> <metadata.json>` đóng gói `.next-ci` và `public`, lập manifest hash cho phần bất biến và thêm marker tại đường dẫn cố định `/__xboss-pilot-build.json` trong artifact. Marker chứa SHA nguồn, build ID và vân tay của cây trước marker. Metadata ngoài archive có schema, SHA nguồn, build ID, SHA-256 archive và manifest. Bỏ runtime cache khỏi tập bất biến.
- **FR2** `install <archive> <metadata.json> <empty-release-dir>` đối chiếu hash archive trước khi giải nén, rồi kiểm manifest và tệp đã cài. Workflow khởi động app từ thư mục cài riêng, cấu hình Next dùng `.next-ci` và dependencies từ lockfile.
- **FR3** `verify <archive> <metadata.json> <release-dir> <base-url> <receipt.json>` đọc marker qua HTTP từ app đang chạy, kiểm một static asset thật, `/api/health` và `/api/ready`. Mỗi probe có timeout. Verifier nhận đích loopback, bỏ chuyển hướng và kiểm bytes nhận được theo manifest của bản đã cài. Marker cố định giúp phát hiện route còn phục vụ bản cũ.
- **FR4** Biên nhận có schema, repo, môi trường staging, source SHA, run ID/attempt, deployment ID, hash archive đã xác nhận, hash manifest đã cài, build ID quan sát được, từng probe, thời điểm và trạng thái `verified`, `failed` hoặc `inconclusive`. Metadata phải khớp source SHA của workflow. Thiếu bằng chứng hoặc lệch đối chiếu trả khác 0.
- **NFR1** Giữ cấu hình và luồng deploy production hiện hành. Marker chỉ nằm trong artifact pilot. Biên nhận chỉ lưu metadata và trạng thái kiểm.
- **NFR2** Pilot không gọi dịch vụ dữ liệu thật. Job staging có PostgreSQL riêng, thông tin kết nối dùng một lần và bước migrate trước readiness.

## 5. Nghiệm thu

| ID | Given / When / Then | Bằng chứng |
| -- | ------------------- | ---------- |
| AC1 | CI build gói, staging tải và cài đúng gói, app thật trả marker và asset đã đóng gói | Hai run khác nhau có exit 0, biên nhận `verified` và link artifact |
| AC2 | Archive hoặc tệp bất biến đã cài bị đổi | Hash check thất bại, không công nhận bản đang phục vụ |
| AC3 | Verifier trỏ vào app cũ hoặc marker/asset trả sai, redirect hay quá hạn | Exit khác 0, biên nhận ghi kết quả probe tương ứng |
| AC4 | App vẫn trả health nhưng readiness lỗi hoặc sai SHA workflow | Exit khác 0 và trạng thái khác `verified` |
| AC5 | Chạy job pilot trên nhánh của nó | Workflow pilot không đổi pipeline VPS, quyền hoặc bí mật production |

## 6. Kiến trúc và quyền

Script Node dùng thư viện chuẩn và công cụ tar của runner. Build và staging chạy ở job riêng, cùng SHA và lockfile. Bằng chứng ghép theo run và attempt. Phần ứng dụng, API công khai, quyền người dùng, schema, DDL, giao diện và PWA nằm ngoài pilot. Log và biên nhận chỉ chứa định danh, hash, trạng thái và thời gian.

## 7. Test, rollout và vận hành

- Kiểm script với archive/tệp sửa, marker cũ, lỗi readiness, HTTP timeout và đích không hợp lệ.
- Chạy job staging bằng app Next production và DB giả sau khi migrate. Lưu metadata, hash và biên nhận cùng workflow run.
- Pilot ghi nhận trên staging cô lập. Mỗi kết quả đối kháng giữ trạng thái riêng. Chỉ mở mốc rollback/restore sau khi hai lượt đạt.

## 8. Phê duyệt

**Kết luận:** Approved for implementation
**Người/ngày duyệt:** Chủ dự án, 2026-11-08, phạm vi pilot staging cô lập.
