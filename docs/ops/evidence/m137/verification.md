# M137 — kiểm chứng UI và tải việc hiện trường

Ngày 24/10/2026. Baseline production build từ main
`9afb984d46d5e2e0f0d14e6f65e3186b836a2800` (#676). Candidate trên nhánh
`codex/m137-ui-performance`; [builds.json](builds.json) ghi BUILD_ID và SHA-256 từng
nguồn ứng dụng/script đo. Chưa merge hoặc phát hành M137 tại checkpoint này.

## Kết quả thay đổi

- Thêm trang: form semantic/Enter, nhãn và mô tả liên kết, vùng chạm 44px/input mobile
  16px. Ref guard chặn submit lặp đồng bộ; đang gửi giữ form, lỗi mạng/403/500 giữ cả
  bốn giá trị và cho thử lại thủ công. Payload, nguồn sao chép mặc định và redirect giữ nguyên.
- Hiện trường: my-tasks quyết định loading/lỗi chính; ba nguồn phụ khởi chạy song song,
  có trạng thái và retry riêng. Cycle/controller bỏ kết quả cũ sau refresh/unmount.
  Giữ 401/404/role, ngưỡng server, tính/sắp việc, API và liên kết hiện hữu.
- Mobile: nhãn KPI/thao tác vừa khung ở 360/393px, có xuống dòng; giữ tên/link/badge
  99+ và icon desktop. Kiểm cả glyph thật, chiều cao 44px và nội dung cuối không bị
  thanh đáy che ở 360/393/1280px.
- Modal: chỉ lớp trên cùng nhận Escape/Tab, bỏ control ẩn/disabled kế thừa; không còn
  control thì focus panel. Giữ scroll lock tới khi đóng lớp cuối và trả focus đúng trigger,
  kể cả cha unmount trước con.
- Tìm kiếm: bỏ transition màu chữ option gây tương phản tạm thời lúc đổi theme; nguyên
  test M136 axe tối/sáng chạy ngay sau đổi theme, không thêm chờ/hạ ngưỡng.

Diagnostic riêng: trước sửa, đổi sáng lỗi tương phản ngay 3/3 lượt; sau sửa, sáu lượt
đổi tối/sáng đều sạch ngay, màu option ổn định từ mẫu 0ms. Raw snapshots:
[trước sửa](contrast-baseline.json), [sau sửa](contrast-candidate.json).

Không đổi API/schema/auth/permission/dependency/lock/CI/service worker, không thêm
telemetry hoặc xóa capability sống. Checkout gốc có 1.508 tệp xóa từ trước được giữ nguyên.

## Browser RED → GREEN và các cổng

RED trên production build trước sửa: tám ca mobile form/nguồn phụ thất bại đúng hành vi;
modal tái hiện Escape đóng cả cha, Tab ra ngoài hoặc chọn control hidden/disabled và rò
scroll khi cha unmount trước. Oracle fieldset được sửa dùng thuộc tính DOM `disabled`
(Playwright `toBeDisabled()` không hỗ trợ fieldset); chạy RED lại tới lỗi focus panel.
Responsive có bốn ca 360/393px thất bại vì glyph tràn/cắt và thanh đáy cao hơn phần chừa,
hai ca desktop 1280px đạt. Không tính lỗi oracle ban đầu thành bằng chứng lỗi ứng dụng.

GREEN cuối trên production build, Chromium desktop + Pixel 5:

- Form: tám ca; field loading/retry/abort/role/empty/responsive: 32 ca; modal: mười ca.
- Kèm bảy file hồi quy M127/M136/AppShell/dashboard/modal a11y hiện hữu; kết quả tổng
  **128 pass, 0 fail, 1 skip có sẵn** (thu gọn sidebar chỉ dành desktop), gồm một setup.
  Không sửa test cũ, thêm skip hoặc tắt rule axe. Cả 50 ca mới đạt, không retry.
- Quick check cuối: tám ca responsive/search và một setup đạt (9/9).
- Build production cuối đạt; gate tĩnh **18/18** đạt. Full unit release gate cuối:
  **383 file, 5.152 pass, 0 fail, 1 skip đúng allowlist** (`health.test.ts`: tình huống
  cố ý không có DB không chạy khi đã có DB). Các script sửa nhãn sau phép đo qua lint/typecheck.

Full unit dùng PostgreSQL 16 disposable riêng (`xboss_test` + bốn worker); browser dùng
`xboss_e2e` riêng, migrations/seed như CI. Lượt unit đầu có 24 ca DR bị hủy do `pg_dump`
thiếu thư viện khi test cố ý làm sạch env. Sửa launcher runtime local; không sửa test,
guard restore hoặc allowlist. Chạy lại riêng DR: 24/24 đạt, sau đó chạy lại full release gate.
Lượt full tiếp theo bị SIGTERM (exit 143) khi đang chạy nhóm worker, không có tổng kết;
không tính là đạt. Chạy lại full trong terminal riêng, sau khi browser/gate đã hoàn tất.
Lượt cuối exit 0, gồm DR 24/24 và toàn bộ nhóm DB, không sửa timeout/guard/test để đạt.

## Phép đo trước–sau

Mỗi build: 20 lượt, năm lượt mỗi tình huống, context mới; Pixel 5 393×727, CPU chậm 4×,
latency 150ms, down 200.000 B/s, up 93.750 B/s, service worker blocked. Tình huống chậm
giữ phản hồi thật của đúng nguồn phụ thêm 3.000ms. Không chạy build/test nặng đồng thời
với phép đo. Mốc ready: thấy “Việc hôm nay”; hash lấy toàn bộ body `/api/my-tasks` thật.

Fixture có 160 task tổng, chỉ **ba task được giao cho engineer** trong cả hai build.
40/40 mẫu cùng ba task, summary total 3 và cùng primary hash; không dùng fixture rỗng
để kết luận tốc độ. [Baseline](baseline.json), [candidate](candidate.json),
[tổng hợp](summary.json).

Đính chính metadata: hai JSON raw ban đầu ghi nhãn cứng `393x851`; cấu hình chạy thật
luôn lấy `devices["Pixel 5"]` của Playwright pin, có viewport **393×727**, screen 393×851
và DPR 2,75. Giữ nguyên hai JSON raw và 40 số đo; [metadata-correction.json](metadata-correction.json)
ghi đính chính cùng hash script lúc đo/sau sửa nhãn động. Ca geometry riêng chủ động
đặt chiều cao 851px, khác viewport mặc định của benchmark/ảnh preview.
`bench-app.ts` của M136 có cùng lỗi nhãn: sửa nhãn động và thêm errata vào báo cáo M136,
giữ nguyên JSON/số đo lịch sử; không thay cấu hình hoặc kết luận đo.

| Tình huống     | Median trước | Median sau | Chờ sau primary trước → sau |
| -------------- | -----------: | ---------: | --------------------------: |
| Bình thường    |      3.368ms |    3.361ms |                 424 → 415ms |
| Thông báo chậm |      5.956ms |    3.364ms |               3.010 → 411ms |
| Danh sách chậm |      5.958ms |    3.365ms |               3.026 → 425ms |
| Tên dự án chậm |      5.950ms |    3.359ms |               3.023 → 426ms |

Nguồn phụ chậm không còn chặn phần việc chính; tình huống bình thường gần như giữ nguyên.
Đây là lab latency có kiểm soát, không phải field CWV/INP, tải lớn hoặc tốc độ mọi trang.
Script không tự kiểm version/assignment DB hoặc ghi bộ đếm interceptor delay; fixture được
đối soát riêng và task count/hash được ghi từng mẫu. `requestsAtReady` chỉ đếm tới mốc ready,
không chứng minh giảm tổng request/payload. Abort form được mô phỏng trước khi POST tới DB;
chưa chứng minh exactly-once khi server đã commit nhưng mất ACK, nên không tự retry.

Chạy lại `scripts/bench-field-loading.ts --phase baseline|candidate --samples 5 --url
http://127.0.0.1:3148 --out <file.json>` bằng `tsx`, với production server và
`E2E_DATABASE_URL` của DB local test/e2e/bench. Script chặn URL/DB ngoài loopback và không
theo redirect khi login; [tám kiểm tra guard](benchmark-guards.json) đạt, gồm HTTP307
không chuyển tiếp POST. Không ghi credential/cookie/task body trong evidence.

## Giới hạn và bàn giao

Review độc lập source A/B/C/D không còn finding P1/P2. Ảnh preview fixture local:
[form lỗi giữ nội dung](form-mobile.png), [Hiện trường mobile](field-mobile.png).
Hai ảnh là viewport 393px; không phải ảnh production hoặc UAT người thật.

UAT 3–5 người, Safari/cảm ứng thật và usage theo org/project vẫn **WAITING** theo quyết định
owner “Chưa có; giữ hai mục này chờ”. Không miễn trừ tiêu chí, không đóng toàn mục tiêu.
Merge/deploy theo L1 hiện tại của `xt.yaml`; rollback bằng revert PR.
