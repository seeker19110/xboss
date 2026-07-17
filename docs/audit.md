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
- **Audit = ĐỌC + BÁO CÁO trước, SỬA sau.** Một lượt audit trước hết là chụp trạng thái toàn repo ở một thời điểm (kể cả khi working tree sạch, không có diff nào) rồi xuất báo cáo (mục 12). Việc sửa tách thành thay đổi riêng có PR — trừ khi người dùng yêu cầu sửa luôn. Lịch sử XBoss thường sửa-trong-lượt vì đa số phát hiện là bug logic tự sửa được; vẫn phải **báo cáo phát hiện trước khi sửa** để có dấu vết so sánh giữa các đợt, không trộn lẫn "phát hiện" và "sửa" thành một khối mờ.
- **Phân loại việc rõ ai xử lý.** Mỗi phát hiện gắn `[AI]` (Claude tự sửa được: lỗi code/logic/format/test) hoặc `[Người dùng]` (cần thao tác tay ngoài tầm AI: cấp/xoay secret trên VPS như `SENTRY_DSN`/`XBOSS_SECRET`, chạy migration đụng dữ liệu trên production, bật branch protection, nâng gói GitHub cho CodeQL). Không gộp chung — kẻo việc `[Người dùng]` bị bỏ quên vì tưởng AI đã lo.
- **Đối chiếu, không tin trí nhớ.** Trạng thái thật đọc từ repo/lệnh/DB, **không** lấy từ hook đầu phiên hay ghi chú cũ (dễ lỗi thời — đã từng lệch với trạng thái migration). Migration đã áp production tra thẳng bảng `schema_migrations`, không đoán.

## 2. Khi nào chạy

- **Audit toàn dự án**: sau khi gộp xong một nhóm module lớn, trước mốc release, hoặc khi nghi ngờ có lỗ hổng hệ thống (đã làm nhiều lần — xem lịch sử trong `PROGRESS.md`). Chia theo miền, chạy song song nhiều subagent độc lập (mẫu đã dùng: bảo mật/phân quyền, correctness/race-condition, frontend a11y/UX, dependency/CI/migration/test).
- **Audit hẹp**: bắt buộc tự soát theo checklist tương ứng (mục 3/4/5) trước khi merge PR chạm vùng rủi ro cao (mục 6), kể cả khi không có ai yêu cầu.
- **Audit định kỳ (khuyến nghị)**: trước mỗi đợt deploy production, hoặc mốc cuối tuần làm việc. Có thể tự hẹn bằng `send_later`/Routine (đã dùng thật trong dự án để theo dõi PR) để không quên — mỗi lần fire chạy lại đúng quy trình mục 9 và xuất báo cáo mục 12.

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

## 6. Checklist Hiệu năng, Dependency & CI/CD

- [ ] Ngân sách Lighthouse (`lighthouserc.json`, đo `/login`, 3 lần chạy) không tụt dưới ngưỡng `error` hiện tại (performance/accessibility/best-practices ≥ 0.9, seo ≥ 0.8) — đây là cổng cứng, không phải `warn`; kiểm job `lighthouse-ci.yml` không bị `continue-on-error` che mất kết quả thật.
- [ ] `npm audit` sạch mức cao trở lên; lỗ hổng qua dependency gián tiếp (vd `uuid` dưới `exceljs`) xử lý bằng `overrides` trong `package.json`, không bỏ qua âm thầm.
- [ ] Mọi `uses:` trong `.github/workflows/*.yml` pin theo **SHA đầy đủ** (kèm comment version), không dùng tag nổi (`@v4`).
- [ ] Mọi workflow khai báo `permissions:` tường minh (least-privilege), không dựa vào mặc định rộng của GitHub Actions.
- [ ] `deploy.yml` chỉ deploy khi job CI trước đó thật sự `success` (kể cả E2E) — không để CI đỏ vẫn lọt qua vì thiếu `needs`/điều kiện đúng.
- [ ] Query mới trên bảng lớn (`tasks`, `progress_dimensions`, `task_history`, `notifications`) có index cho cột lọc/sắp xếp/join hay chưa — đặc biệt route dashboard/notification chạy mỗi lần fetch (on-fetch sync), không phải cron.
- [ ] **Độ phủ test (định lượng)**: đo bằng coverage built-in của `node:test` (Node 22): `node --experimental-test-coverage scripts/run-tests.mjs` (hoặc `tsx --test --experimental-test-coverage tests/<file>` cho 1 file). Chỉ soi **logic thuần** (`lib/**`, `app/api/**`), không đo component UI. Cơ chế **ratchet — không tệ hơn lần đo trước**: ghi mốc `stmts/branches/funcs/lines` mới nhất vào `PROGRESS.md`; thêm test mới thì nâng dần, không để trôi xuống. *(Chưa có script `test:coverage`/ngưỡng CI cứng — nếu muốn chốt thành cổng CI thì mở thay đổi riêng, không tự thêm trong lượt audit.)*
- [ ] **Rà vùng thiếu test (định tính)**: với mỗi hàm logic phức tạp trong vùng rủi ro cao (mục 8) còn nhánh chưa phủ, đối chiếu checklist ca biên §4 (rỗng/`null` vs 0/off-by-one/race-idempotency/ngày UTC↔`Asia/Ho_Chi_Minh`/nhánh lỗi mạng-DB). Vùng thiếu → ghi danh sách **đề xuất bổ sung test** vào báo cáo, không tự viết test trong lượt audit (trừ khi người dùng yêu cầu).

## 7. Checklist Vận hành, Đồng bộ real-time, Offline (PWA) & Xuất bản

- [ ] **SSE/đồng bộ đa người dùng** (`/api/events?sheet=`): watermark `sheetVersion` tăng đúng mọi thao tác đổi dữ liệu sheet đó; client có fallback poll khi EventSource lỗi/bị cắt (serverless/reverse-proxy timeout) — không được im lặng mất đồng bộ.
- [ ] **Offline queue** (`useOfflineTickQueue`, localStorage): thao tác lặp lại khi online trở lại phải idempotent (đối chiếu §4 Idempotency); lỗi 4xx phải bị bỏ khỏi hàng đợi (dữ liệu/quyền không hợp lệ), không được kẹt hàng đợi retry vô hạn; lỗi 5xx/mất mạng thì giữ lại để thử tiếp.
- [ ] **App Shell / service worker** (`public/sw.js`): đổi logic cache phải tăng version `CACHE`, nếu không thiết bị cũ kẹt cache cũ vĩnh viễn; route `/api/events`, `/api/photos/*` loại trừ khỏi cache network-first như đã quy ước.
- [ ] **Xuất PDF/Excel** (`@react-pdf/renderer`, `exceljs`): font hỗ trợ đủ dấu tiếng Việt (đã từng vỡ dấu do dùng Helvetica mặc định — dùng `lib/pdf-fonts.ts` cho mọi route PDF mới); cột SQL tham chiếu đúng tên thật (đã từng có route 500 vì tham chiếu cột không tồn tại như `work_package_id`/`deadline` — chạy thử route thật, không chỉ đọc query bằng mắt).
- [ ] **Dedup thông báo** (loại mới trong `/api/notifications`): dùng đúng cơ chế partial unique index + on-fetch sync + tự dọn khi hết điều kiện — kiểm cả trường hợp tắt dashboard qua `nav_settings` vẫn còn sinh notification cho mục người dùng không thấy trên sidebar nữa (nợ đã ghi nhận với M25-M31).
- [ ] **Backup & rollback**: trước migration đụng dữ liệu thật trên production, xác nhận đã có backup gần nhất + biết cách phục hồi; `deploy.sh` build vào thư mục tạm rồi swap atomic, không đè trực tiếp `.next` đang chạy.
- [ ] **Quan sát lỗi production**: nơi nào nuốt lỗi im lặng (catch rỗng, chỉ trả `null`) — tối thiểu `console.error` khi chưa có Sentry (`SENTRY_DSN` chờ người vận hành cấp) để còn dấu vết trong log.

## 8. Vùng rủi ro cao (audit hẹp bắt buộc khi PR chạm vào)

`lib/recompute.ts` · mọi route PATCH tiến độ/nghiệm thu (`tasks/:id/progress`, `dimensions/*`, `tasks/:id/approve`, `approvals`) · `lib/material-sync.ts` · `lib/boq.ts` · `lib/auth.ts` (`CAN`/`canTouchTask`/`canTouchPackage`) · mọi route tài chính (`/api/costs`, `/api/payment-certs`, `/api/contracts`, `/api/purchase-orders`) · mọi route/khối notification tính theo dự án (M22) · `lib/push.ts` + service worker (`public/sw.js`) · mọi route xuất PDF/Excel mới · `.github/workflows/*.yml`.

## 9. Quy trình chạy 1 đợt audit toàn dự án

1. Chia theo miền, chạy song song bằng nhiều subagent độc lập (mẫu đã dùng nhiều lần: bảo mật/phân quyền, correctness/race-condition, frontend a11y/XSS/hardcode, dependency/CI/migration/test) — mỗi agent đọc code thật, không đoán.
2. Mỗi phát hiện: xác nhận bằng cách đọc code kỹ + khi khả thi, chạy thử thật (Postgres cục bộ + Playwright) trước khi coi là lỗi.
3. Sửa xong: viết/bổ sung test hồi quy cho lỗi logic; verify `npm run lint && npm run typecheck && npm test && npm run build` xanh.
4. Ghi kết quả vào `PROGRESS.md` mục **"Đợt audit toàn dự án ..."** (thêm mục mới, không sửa mục cũ) theo đúng format đã có: mức độ nghiêm trọng, mô tả lỗi thật kèm file/hàm, cách sửa, cách verify.
5. Việc chưa sửa hoặc cần cân nhắc kỹ thuật thêm (không phải bug logic, đánh đổi có chủ đích) → ghi rõ vào `PROGRESS.md` mục **Nợ kỹ thuật**, không được bỏ sót.

## 10. Khoảng trống hạ tầng chất lượng đã biết — đề xuất cụ thể

Rà lại `package.json` + `.github/workflows/*` (2026-07-12): axe-core/Playwright, Lighthouse CI, gitleaks, Dependabot, husky/commitlint, CODEOWNERS **đã đủ**. Còn 2 khoảng trống thật:

- [x] **Sentry (observability) — scaffold đã cài** (2026-07-12): `@sentry/nextjs` + `instrumentation.ts` (register server/edge theo `NEXT_RUNTIME`) + `sentry.server.config.ts`/`sentry.edge.config.ts` (đọc `process.env.SENTRY_DSN` trực tiếp, `enabled: false` khi thiếu — no-op hoàn toàn, cùng pattern `VAPID_*`/`GOOGLE_SERVICE_ACCOUNT_JSON`) + `next.config.mjs` bọc `withSentryConfig` (tắt upload sourcemap mặc định vì cần `SENTRY_AUTH_TOKEN` riêng — không chặn build). `SENTRY_DSN` đã thêm vào `lib/env.ts` (chỉ để liệt kê, không phải nguồn đọc thật) + `.env.example`. Verify: `npm run lint`/`typecheck`/`test` (50 file)/`build` xanh, build không cần `DATABASE_URL` (đúng nguyên tắc lazy env). **Còn lại: chỉ chờ người vận hành cấp `SENTRY_DSN`** (secret nhạy cảm — không tự tạo/đoán) để bật gửi lỗi thật; client-side capture (nút bấm/lỗi React trên trình duyệt) cố ý để riêng — cần thêm `NEXT_PUBLIC_SENTRY_DSN` và phá vỡ bất biến hiện tại "XBoss không có biến client nào" trong `lib/env.ts`, nên để quyết định sau, không âm thầm đổi trong đợt này.
- [ ] **CodeQL** — bị chặn (repo private, cần GHAS trả phí — xem `SECURITY.md`), không phải thiếu sót có thể tự cài; giữ nguyên hiện trạng, chỉ đổi khi công ty nâng cấp gói GitHub.

## 11. Cổng "đạt chuẩn" cho một đợt audit

- [ ] Cả 5 checklist (Bảo mật §3, Logic §4, UI/UX §5, Hiệu năng/CI §6, Vận hành/Offline/Xuất bản §7) đã được rà ít nhất một lượt cho phạm vi audit.
- [ ] Không còn phát hiện mức Cao/Trung bình chưa xử lý hoặc chưa ghi nợ kỹ thuật rõ ràng kèm lý do.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` xanh.
- [ ] `PROGRESS.md` đã cập nhật đúng mục audit + nợ kỹ thuật (nếu có việc chưa đóng).
- [ ] Đã xuất **báo cáo audit** theo mẫu §12 (kể cả khi mọi mục xanh) — để so sánh được giữa các đợt.

## 12. Mẫu báo cáo audit

Xuất báo cáo theo khung dưới sau mỗi lượt (dán vào `PROGRESS.md` mục "Đợt audit toàn dự án ..." hoặc reply cho người dùng). Mọi mục ❌ ở nhóm **chặn** (Cổng tự động §3-Bảo mật §... ) → kết luận phải là "Cần xử lý", không được "Sẵn sàng".

```
=== BÁO CÁO AUDIT TOÀN DIỆN — <ngày giờ, giờ VN> · nhánh <tên> · <commit ngắn> ===

CỔNG TỰ ĐỘNG (chặn)
  lint ✅/❌ | typecheck ✅/❌ (lỗi: ..) | test ✅/❌ (X/Y file, A/B ca) | build ✅/❌

§3 BẢO MẬT & PHÂN QUYỀN
  Route mới có getCurrentUser()+401 ✅/❌ | CAN/canTouchTask/canTouchPackage đối xứng ✅/❌
  | scope projectId (M22) ✅/❌ | secret hardcode: 0/.. | .env track: chỉ .env.example ✅/❌
  | npm audit (high/critical: ..) | cron Bearer-only ✅/❌ | rate-limit atomic ✅/❌

§4 LOGIC & TOÀN VẸN DỮ LIỆU
  Làm tròn % ✅/❌ | FOR UPDATE trong transaction ✅/❌ | race/idempotency ✅/❌
  | tiền tính trong SQL (không float JS) ✅/❌ | ngày Asia/Ho_Chi_Minh ✅/❌
  | nghiem_thu không tự hạ cấp ✅/❌ | migration append-only idempotent ✅/❌

§5 UI/UX & A11Y
  4 trạng thái màn hình ✅/❌ | axe serious/critical: 0/.. (5 theme) | aria-label icon ✅/❌
  | vùng chạm ≥40px / không cuộn ngang toàn trang ✅/❌ | không chỉ-bằng-màu ✅/❌

§6 HIỆU NĂNG / DEPENDENCY / CI
  Lighthouse ≥ ngưỡng error ✅/❌ | uses: pin SHA ✅/❌ | permissions tường minh ✅/❌
  | deploy needs CI success ✅/❌ | index bảng lớn ✅/❌
  | Coverage (lib/**, app/api/**): stmts../branches../funcs../lines.. (so mốc trước: ↑/↓/=)
  | Vùng thiếu test đề xuất: [..]

§7 VẬN HÀNH / OFFLINE / XUẤT BẢN
  SSE watermark+fallback ✅/❌ | offline queue idempotent, bỏ 4xx ✅/❌
  | sw.js tăng CACHE version ✅/❌ | PDF/Excel font VN + cột SQL đúng ✅/❌ | dedup notif ✅/❌

ĐỐI CHIẾU TÀI LIỆU & HẠ TẦNG (git/PROGRESS/migration — đọc trạng thái thật, không tin trí nhớ)
  Git: ahead X / behind Y | working tree ✅/❌ | PROGRESS khớp thực tế ✅/❌
  | Migration chưa áp production (tra schema_migrations): [..] | Nợ kỹ thuật còn đúng: [..]

--- PHÂN LOẠI VIỆC ---
  [AI] tự làm được: [..]
  [Người dùng] cần thao tác tay: [.. vd cấp SENTRY_DSN trên VPS, chạy migration đụng dữ liệu qua staging→production, nâng gói GitHub cho CodeQL ..]
  Rủi ro/ảnh hưởng: ..
  Góp ý cải tiến: ..

KẾT LUẬN: Sẵn sàng / Cần xử lý: [..]
```
