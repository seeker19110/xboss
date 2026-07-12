# Tiêu chuẩn Audit toàn diện — XBoss

> Chuẩn hoá lại cách audit đã làm nhiều lần trong dự án (xem `PROGRESS.md` các mục "Đợt audit toàn dự án") thành
> một checklist lặp lại được, thay vì mỗi lần audit lại nghĩ từ đầu nên rà gì. Đây là tài liệu **đặc thù XBoss**
> (dùng thẳng vào schema/route/luồng thật của dự án) — khác `docs/framework/*` là khung chung tái dùng mọi dự án.
> Đọc cùng `CLAUDE.md` (đặc biệt mục Auth, Chuỗi tính toán tiến độ) trước khi audit.

## 1. Ba trụ & nguyên tắc chung

Mọi đợt audit phủ đủ 3 trụ: **Bảo mật & phân quyền**, **Logic nghiệp vụ & toàn vẹn dữ liệu**, **UI/UX & khả năng tiếp cận**.

- **Ground-truth trước, ước đoán chỉ là ứng viên.** Đọc code/grep chỉ khoanh vùng nghi ngờ; xác nhận lỗi thật bằng cách chạy thử (Postgres cục bộ + gọi API/Playwright thật) trước khi coi là bug — đúng phương pháp đã chứng minh hiệu quả ở `docs/a11y/contrast-audit.md` (grep 399 ứng viên → xác nhận thật chỉ ~10 nút FAIL sau khi tính tương phản + axe).
- **Ưu tiên theo mức ảnh hưởng tới dữ liệu thật**: sai % tiến độ / sai tiền / rò rỉ chéo dự án / mất quyền riêng tư nghiêm trọng hơn vấn đề thẩm mỹ.
- **Audit không thay thế test.** Mọi lỗi logic tìm thấy phải có ít nhất 1 test hồi quy trước khi coi là đóng.
- **Không big-bang.** Audit hẹp theo vùng rủi ro (mục 6) khi PR chạm vào; audit toàn dự án định kỳ dùng nhiều agent song song theo miền.

## 2. Khi nào chạy

- **Audit toàn dự án**: sau khi gộp xong một nhóm module lớn, trước mốc release, hoặc khi nghi ngờ có lỗ hổng hệ thống (đã làm nhiều lần — xem lịch sử trong `PROGRESS.md`). Chia theo miền, chạy song song nhiều subagent độc lập (mẫu đã dùng: bảo mật/phân quyền, correctness/race-condition, frontend a11y/UX, dependency/CI/migration/test).
- **Audit hẹp**: bắt buộc tự soát theo checklist tương ứng (mục 3/4/5) trước khi merge PR chạm vùng rủi ro cao (mục 6), kể cả khi không có ai yêu cầu.

## 3. Checklist Bảo mật & Phân quyền (API là ranh giới duy nhất)

Dựa trên các lớp lỗ hổng **đã từng phát hiện thật** trong dự án — audit mới phải rà đúng các lớp này trước tiên vì chúng có xu hướng lặp lại ở route mới:

- [ ] Mọi route mới gọi `getCurrentUser()`, trả **401** (không phải 403) khi chưa đăng nhập.
- [ ] Mọi thao tác/đọc dữ liệu nhạy cảm kiểm đúng `CAN.<quyền>` — **đối chiếu route "anh em" cùng tài nguyên**: nếu `POST` có `canTouchTask`, `GET`/`PATCH`/`DELETE` cùng resource cũng phải có (lỗi thật đã gặp: `GET /api/tasks/:id/photos` và `.../documents` thiếu check dù `POST` cùng file có).
- [ ] Thao tác cấp **work package/nhóm** cần `canTouchPackage` tương đương `canTouchTask` (lỗi thật: upload/xoá biên bản nghiệm thu + bản vẽ theo package thiếu kiểm).
- [ ] Đa dự án (M22): mọi truy vấn tài chính/danh sách cảnh báo mới nhận `projectId` lọc đúng — đối chiếu route đã scope đúng (`contracts`, `purchase-orders`) làm mẫu (lỗi thật: `/api/payment-certs` từng quên scope hoàn toàn).
- [ ] Sở hữu dữ liệu cá nhân (note, comment...): sửa/xoá kiểm đúng người tạo hoặc vai trò quản lý, không chỉ "đã đăng nhập".
- [ ] SQL luôn qua placeholder `?` của `lib/db` — không nối chuỗi chèn giá trị.
- [ ] Upload file: kiểm mime thật khi khả thi (không chỉ tin `Content-Type` client); có giới hạn dung lượng hợp lý.
- [ ] Endpoint cron chỉ nhận `CRON_SECRET` qua header `Authorization: Bearer`, không qua query param.
- [ ] Rate-limit endpoint nhạy cảm (login...) atomic qua `ON CONFLICT` — không phải Map trong process (race đọc-rồi-ghi khi nhiều instance).

## 4. Checklist Logic nghiệp vụ & Toàn vẹn dữ liệu

Lớp lỗi nguy hiểm nhất: code biên dịch sạch, type đúng, nhưng **tính sai** % tiến độ / tiền / trạng thái.

- [ ] Làm tròn số tiến độ: không để `Math.round` biến gần-xong (vd 99.5%+) thành "xong 100%" — chỉ `=1` khi đúng bằng tổng số ô (lỗi thật đã sửa ở `recomputeTask`/`recomputePackage`).
- [ ] Mọi cặp đọc-sửa-ghi trên `tasks`/`work_packages` (đặc biệt recompute %, nghiệm thu) bọc `withTransaction` + `SELECT ... FOR UPDATE` — đối chiếu route "anh em" đã bọc để tìm route thiếu đối xứng.
- [ ] **Race condition**: 2 request đồng thời trên cùng tài nguyên (tick 2 checkbox, duyệt nghiệm thu 2 lần, PO nhận hàng 2 lần) không sinh audit trùng / ghi đè mất dữ liệu (lost update).
- [ ] **Idempotency**: gửi lại cùng thao tác (mạng chập chờn công trường, bấm 2 lần) không tạo bản ghi trùng / cộng dồn sai.
- [ ] Đồng bộ 2 chiều Google Sheet: `material_sync` snapshot chỉ lưu **sau khi** ghi thành công lên Sheet, không lưu trước (tránh lỗi mạng giữa chừng khiến lần sync sau tưởng đã đồng bộ rồi âm thầm hoàn tác dữ liệu DB).
- [ ] Mọi luồng import/sync đối chiếu theo **Mã BOQ** với bản ghi có sẵn trước khi tạo mới — tránh sinh trùng lặp vĩnh viễn (lỗi thật: dòng Sheet mất ID từng bị tạo material mới thay vì merge).
- [ ] BOQCODE duy nhất xuyên toàn hệ thống (`tasks`/`work_packages`/`materials`/`boq_items`) — có ràng buộc DB thật (`boq_codes` + trigger), không chỉ check ở tầng ứng dụng (`boqTakenBy` là lưới an toàn phụ, không phải nguồn sự thật).
- [ ] Ngày giờ: so sánh **chuỗi** `YYYY-MM-DD`; cộng/trừ ngày qua `daysFromTodayISO`/`todayISO`; mọi mốc "hôm nay" ép múi giờ `Asia/Ho_Chi_Minh` — tránh lệch 1 ngày lúc 0h–7h sáng giờ VN do server chạy UTC.
- [ ] `nghiem_thu` không bao giờ bị hạ cấp tự động; chỉ đặt/huỷ qua `POST/DELETE /api/tasks/:id/approve` hoặc `/api/approvals`, luôn ghi `task_history`.
- [ ] Migration mới **append-only**, `IF NOT EXISTS`, chạy lại không lỗi (idempotent); nếu backfill dữ liệu cũ có khả năng đã trùng/xung đột — ghi rõ quyết định xử lý, không giả định dữ liệu cũ sạch.
- [ ] Mọi nhánh logic phức tạp mới có ít nhất 1 test biên (rỗng/1 phần tử/nhiều phần tử, `null`/0, off-by-one).

## 5. Checklist UI/UX & Accessibility

Kế thừa quy trình ground-truth đã chứng minh hiệu quả ở `docs/a11y/contrast-audit.md`: grep/đọc code chỉ là ứng viên, **axe trên bản production là trọng tài cuối**.

- [ ] Mỗi màn hình dữ liệu xử lý đủ 4 trạng thái: đang tải (skeleton, không màn trắng/nhảy layout), rỗng (thông điệp + hành động gợi ý), lỗi (thân thiện, không phơi stack trace, có thử lại), có dữ liệu.
- [ ] Mọi `fetch` ghi dữ liệu quan trọng có `try/catch` — mất mạng công trường (bối cảnh thật của app) không được để nút kẹt "Đang lưu..." vĩnh viễn mà không báo lỗi (lớp lỗi thật đã lặp lại ở nhiều form: đổi mật khẩu, PO/PR, quản lý user...).
- [ ] Nút icon-only có `aria-label` tiếng Việt mô tả đúng hành động — đặc biệt nút xoá/đóng dữ liệu quan trọng.
- [ ] Tương phản màu đạt AA ở **cả 5 theme** (`dark/light/kingblue/darkblue/navy`) — tra bảng quy tắc đã tính sẵn ở `docs/a11y/contrast-audit.md` §2-3 trước khi thêm màu mới, không đoán bằng mắt.
- [ ] Trang/luồng mới bắt buộc có 1 spec axe (`e2e/authed/*.spec.ts`) chạy desktop + mobile, assert không vi phạm `serious`/`critical` — coi đây là **cổng merge**, không phải việc "nên làm thêm".
- [ ] Vùng chạm ≥ 40px; bảng dày sticky header + cho cuộn ngang, giữ cột mã/tên dễ đọc; không có thanh cuộn ngang toàn trang ở breakpoint nào.
- [ ] Không truyền tải thông tin chỉ bằng màu (kèm icon/nhãn) — đặc biệt badge trạng thái/cảnh báo ngưỡng chi phí/vật tư.
- [ ] Optimistic UI (tick checkbox lưới tracking...) rollback đúng khi server trả lỗi + báo rõ lý do cụ thể (không chỉ "thất bại") — lỗi thật đã gặp khi bị chặn bởi hold-point QAQC nhưng checkbox vẫn hiện đã tick.

## 6. Vùng rủi ro cao (audit hẹp bắt buộc khi PR chạm vào)

`lib/recompute.ts` · mọi route PATCH tiến độ/nghiệm thu (`tasks/:id/progress`, `dimensions/*`, `tasks/:id/approve`, `approvals`) · `lib/material-sync.ts` · `lib/boq.ts` · `lib/auth.ts` (`CAN`/`canTouchTask`/`canTouchPackage`) · mọi route tài chính (`/api/costs`, `/api/payment-certs`, `/api/contracts`, `/api/purchase-orders`) · mọi route/khối notification tính theo dự án (M22).

## 7. Quy trình chạy 1 đợt audit toàn dự án

1. Chia theo miền, chạy song song bằng nhiều subagent độc lập (mẫu đã dùng nhiều lần: bảo mật/phân quyền, correctness/race-condition, frontend a11y/XSS/hardcode, dependency/CI/migration/test) — mỗi agent đọc code thật, không đoán.
2. Mỗi phát hiện: xác nhận bằng cách đọc code kỹ + khi khả thi, chạy thử thật (Postgres cục bộ + Playwright) trước khi coi là lỗi.
3. Sửa xong: viết/bổ sung test hồi quy cho lỗi logic; verify `npm run lint && npm run typecheck && npm test && npm run build` xanh.
4. Ghi kết quả vào `PROGRESS.md` mục **"Đợt audit toàn dự án ..."** (thêm mục mới, không sửa mục cũ) theo đúng format đã có: mức độ nghiêm trọng, mô tả lỗi thật kèm file/hàm, cách sửa, cách verify.
5. Việc chưa sửa hoặc cần cân nhắc kỹ thuật thêm (không phải bug logic, đánh đổi có chủ đích) → ghi rõ vào `PROGRESS.md` mục **Nợ kỹ thuật**, không được bỏ sót.

## 8. Cổng "đạt chuẩn" cho một đợt audit

- [ ] Cả 3 checklist (Bảo mật §3, Logic §4, UI/UX §5) đã được rà ít nhất một lượt cho phạm vi audit.
- [ ] Không còn phát hiện mức Cao/Trung bình chưa xử lý hoặc chưa ghi nợ kỹ thuật rõ ràng kèm lý do.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` xanh.
- [ ] `PROGRESS.md` đã cập nhật đúng mục audit + nợ kỹ thuật (nếu có việc chưa đóng).
