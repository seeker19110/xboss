# M58 — Hiện trường mobile: mã QR + offline queue mở rộng (P2)

> **Mục tiêu**: hai nâng cấp ghép tự nhiên cho người dùng điện thoại tại công trường — (1) **mã QR** dán trên thiết bị/vật tư/tầng, quét là mở thẳng hồ sơ đúng ngữ cảnh; (2) **offline queue mở rộng** — hiện chỉ tick checkbox được xếp hàng khi mất mạng (`app/components/offlineQueue.ts`, localStorage, chỉ giữ thao tác mới nhất mỗi dimension); ảnh hiện trường/nhật ký/QC checklist mất mạng là mất công nhập lại.
>
> **Không làm**: app native, GPS/định vị (đã loại theo thiết kế), NFC, offline cho thao tác tài chính/nghiệm thu (thao tác nhạy cảm phải online — chủ đích).

## PR1 — QR resolve + tem in (`route: standard` — đặc tả kín, ít rủi ro)

### Thiết kế mã

- Nội dung QR = URL thật `https://<host>/r/<kind>/<id>` — quét bằng camera thường (không cần app) vẫn mở đúng trang. `kind ∈ { eq (equipment), mt (materials), wf (work-front theo tầng), tk (task) }`.
- Route mới `app/r/[kind]/[id]/page.tsx`: client redirect theo kind → `/equipment?id=`, `/materials?id=`, `/work-fronts/<floor>`, `/tracking/<sheet>?task=` (tra sheet qua API nhỏ `GET /api/r/:kind/:id` — auth như mọi API, 401 → login rồi quay lại đúng đích qua `?next=`). Không tạo bảng mới — QR chỉ là URL, không cần token/registry (tài nguyên đã có auth + project scope ở API đích).

### Tem in

- `GET /api/qr/labels?kind=eq&ids=1,2,3` (Admin/PM): trang in tem (khổ A4 lưới tem, mỗi tem: QR SVG + mã + tên), render QR **server-side hoặc client bằng thư viện QR thuần JS nhỏ** (1 dependency mới — chọn lib không phụ thuộc canvas native, pin version; dùng chung cho M56 PR1 QR TOTP — chọn lib TRƯỚC ở PR này, M56 tái dùng). Nút "In tem QR" ở trang `/equipment`, `/materials` (chọn nhiều dòng → in).
- Print-friendly theo chuẩn `/report` (ẩn nav, vừa khổ giấy).

### Test + tiêu chí

- `tests/qr-resolve.test.ts`: resolve đúng URL đích từng kind; id không tồn tại → 404 thông điệp Việt; chưa đăng nhập → login rồi về đúng đích; tài nguyên dự án khác → không lộ (project scope).
- Verify thật trên điện thoại: quét tem in từ màn hình → mở đúng hồ sơ thiết bị.

## PR2 — Khung offline queue tổng quát (`route: complex` — thiết kế khung, ranh giới quyết định: cấu trúc hàng đợi + chiến lược retry, KHÔNG đổi hành vi tick hiện có)

### Thiết kế

- `app/components/offlineQueue.ts` tổng quát hoá thành hàng đợi thao tác `{ id, kind, payload, queuedAt, tries }` trong **IndexedDB** (localStorage giữ cho tick cũ — di trú êm: đọc key cũ 1 lần, đẩy sang khung mới, xoá key cũ; ảnh blob KHÔNG nhét được localStorage nên IndexedDB là bắt buộc).
- Kind đợt này: `tick` (di trú từ khung cũ, hành vi giữ nguyên: mỗi dimension chỉ giữ thao tác mới nhất), `photo` (ảnh task — blob + taskId + caption), `diary_note` (ghi chú nhật ký text). Flush khi `online` + khi SW `sync` event (Background Sync nếu trình duyệt hỗ trợ, fallback listener `online` như hiện tại).
- Quy tắc kế thừa từ khung cũ (giữ nguyên, đã đúng): 4xx bỏ khỏi hàng đợi không retry (không kẹt queue); 5xx/mạng giữ lại, backoff theo `tries`; `clearOfflineQueue()` khi logout (chống gửi "chui" dưới tên người sau — bất biến bảo mật sẵn có, PHẢI phủ cả IndexedDB mới).
- Giới hạn: tổng dung lượng ảnh chờ ≤ 50MB (từ chối xếp hàng thêm kèm thông điệp rõ), ảnh nén client trước khi xếp hàng (canvas resize ~1920px — đằng nào server cũng giới hạn 10MB).
- UI: badge trạng thái hàng đợi trong `AppHeader` (đếm mục chờ, đang gửi, lỗi) — mở rộng indicator offline hiện có, không component mới.

### Test + tiêu chí

- Unit (logic thuần tách khỏi IndexedDB qua interface): dedup tick, backoff, 4xx bị loại, quota ảnh.
- Verify thật (Chromium DevTools offline): tick + chụp ảnh + ghi chú nhật ký khi offline → online lại tự đẩy đủ 3 loại đúng thứ tự, ảnh lên đúng task; logout khi còn hàng đợi → sạch.

## PR3 — Wire ảnh + nhật ký vào khung (`route: standard`, sau PR2)

- `/tracking/[sheet]` modal ảnh task + `/diary`: đường ghi khi offline chuyển qua queue (UI hiện trạng thái "chờ gửi" trên mục đã xếp hàng thay vì báo lỗi mạng). Route server KHÔNG đổi — idempotency ảnh qua hash sha256 sẵn có (M43): server nhận trùng hash cùng task trong 24h → trả bản ghi cũ thay vì nhân đôi (điểm chạm nhỏ `app/api/tasks/[id]/photos/route.ts`, chống double-submit khi flush retry).
- Tiêu chí: kịch bản thang máy công trường (offline 10 phút, 5 ảnh 2 nhật ký 10 tick) phục hồi đủ, không trùng, không mất.
