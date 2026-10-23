# M136 — Trải nghiệm công trường, hiệu năng và tinh gọn XBoss

| Thuộc tính        | Giá trị                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| State             | **Approved for implementation**                                                           |
| Người/ngày duyệt  | Chủ dự án, 23/10/2026, trong chat: “duyệt, triển khai hoàn thiện đi”; tiếp tục: “tiếp đi” |
| Nguồn             | Kế hoạch nâng cấp 6 tuần ngày 23/10/2026 đã được duyệt                                    |
| Base đã đối chiếu | `efd31ba0`, sau M135 kéo thả tracking                                                     |
| Goal              | `docs/goals/upgrade-ux-performance-2026-10.md`                                            |

## 1. Bối cảnh và quyết định phạm vi

Kỹ sư/thầu phụ cần cập nhật tiến độ trên mobile mạng yếu; PM cần thấy việc phải xử lý và tin rằng thao tác đã lưu. Khảo sát ban đầu dùng `a2b9d7b9`; đối chiếu main mới xác nhận private cache/vault, loại DDL khỏi runtime và kéo thả đã được cải thiện. Giữ các cải tiến này, chỉ sửa phần còn thiếu bằng bằng chứng hiện tại.

Đợt mã nguồn này thực hiện các thay đổi đảo ngược được trong kế hoạch. UAT với người thật, cửa sổ usage 30 ngày và quyết định xóa dữ liệu/module sống có phụ thuộc thực tế, phải giữ trạng thái chưa nghiệm thu tới khi có bằng chứng. Không suy ra “đã hoàn thiện sản phẩm” từ test kỹ thuật.

## 2. Outcome, contract và guardrail

- FR1: form sửa sheet/thêm nhóm không kẹt pending khi mạng lỗi; giữ input; khóa gửi lặp; lỗi hiện tại form và có thể thử lại.
- FR2: đổi thứ tự sheet/lý do trễ có pending, phản hồi thất bại, rollback đúng nếu dùng optimistic UI. Không thay route hoặc quyền hiện có.
- FR3: nhóm tracking mở/thu bằng button thật, có aria-expanded và tên; dùng Enter/Space; giữ kéo thả, chọn vùng, sticky, export/in.
- FR4: search mobile dùng được từ mọi trang AppShell; một instance search đảm bảo shortcut/focus không trùng. Thường dùng 4–6 mục theo vai trò lấy từ cây nav đã lọc quyền, nav settings và feature flags. “Tất cả phân hệ” vẫn mở được; giữ lựa chọn gập/mở đã lưu.
- FR5: bỏ copy quảng bá capability đã gỡ, dùng nhãn nghiệp vụ tiếng Việt; reduced-motion và input mobile theo master, không đổi palette hay thêm dependency.
- FR6: chuông không poll tab ẩn, không request chồng; quay lại tab tải mới; bỏ kết quả request sau unmount. Không đổi đồng bộ backend, schema, phạm vi hoặc thời điểm đánh dấu đọc.
- FR7: dashboard không tính báo cáo ngân sách nếu response không sử dụng; caller khác của bySystemBlock vẫn nhận trường và công thức cũ. KPI/mốc tuần dùng chung trong một request, giữ thuật toán history, tiền exact và trọng số.
- FR8: dữ liệu dashboard chính hiện ngay khi có; nguồn phụ tải riêng, có lỗi/retry và bảo vệ race/unmount.
- FR9: kiểm kê engineering chạy với transaction chỉ đọc và scope rõ; lỗi hoặc RLS không kiểm chứng được phải là unknown, không gộp thành 0 hay tự khuyên DROP. Không import helper ứng dụng để khởi tạo schema. Identifier phải validate/quote; không log connection string.
- FR10: bổ sung bằng chứng performance cho trang sau đăng nhập trên production build, gồm request count/bytes, thời gian API và mobile. Mọi số so sánh ghi rõ dataset, thiết bị/mạng và số lượt; không hứa mức tăng tốc chưa đo.

Guardrail: không đổi schema, dependency/lockfile, auth/RBAC, công thức tiền, tiến độ/nghiệm thu, audit trail, chính sách vault/SW, dữ liệu thật. Không đưa migration lịch sử về bản cũ. Không xóa module sống khi chưa có usage/caller/hồ sơ và owner quyết định.

## 3. Các luồng và trạng thái

Form: idle → pending → thành công (đóng/cập nhật) hoặc lỗi HTTP/mạng (nhả pending, giữ input, lỗi rõ, thử lại); các thao tác quản trị giữ confirm/quyền. Dashboard: skeleton chính → dữ liệu chính; nguồn phụ có skeleton/empty/error riêng, không chặn tác vụ. Search: nút mobile → dialog hiện tại → chọn kết quả hoặc Escape/đóng trả focus. Nav: thường dùng → tất cả phân hệ, không tạo link ngoài quyền. Notifications: mount/visible → tải nếu chưa có request; hidden/unmount → hủy/dọn; trở lại → tải lại.

## 4. Điểm chạm và giao việc

| Slice                       | File sở hữu                                                                                                                                                                                  | Contract / nghiệm thu                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| A — độ tin cậy và keyboard  | `app/tracking/[sheet]/page.tsx`, `TrackingGrid.tsx`, `app/components/home/HomeDieuHanh.tsx`, test/E2E mới tên `upgrade-field-*`                                                              | FR1–3; test mạng lỗi/500/retry và keyboard, giữ M135                  |
| B — AppShell và nội dung    | `app/components/AppHeader.tsx`, `GlobalSearch.tsx`, `HomeRail.tsx`, `app/site/page.tsx`, `app/globals.css`, `app/components/ui/Select.tsx`, helper nav và test/E2E mới tên `upgrade-shell-*` | FR4–5; quyền/nav override, 390px, focus, themes, axe                  |
| C — poll và kiểm kê         | `app/components/NotificationBell.tsx`, helper poll nếu cần, `scripts/dem-du-lieu-engineering.ts`, helper script và test/E2E mới tên `upgrade-ops-*`                                          | FR6/FR9; single-flight/visibility, read-only, không nuốt lỗi          |
| D — dashboard và bằng chứng | `app/api/dashboard/route.ts`, `lib/tien-do/dashboardext.ts`, `app/components/home/useDieuHanhData.ts`, benchmark và test/E2E mới tên `upgrade-performance-*`                                 | FR7–8/FR10; response không đổi, tránh query lặp, chứng minh trước/sau |

Agent chỉ sửa file trong slice, không sửa docs chung/lockfile/schema. Phiên chính tích hợp bằng diff và chạy cổng; chưa commit/push/merge trong đợt này. Root giữ tài liệu và cấu hình kiểm thử.

## 5. API và data contract

API công khai giữ nguyên request/response/status/auth/project/org. `bySystemBlock` có thể thêm options nội bộ `includeBudget` mặc định true; API dashboard chọn false. `weekDeltaBlock` có thể nhận KPI/previous rows đã tính, fallback hành vi cũ cho caller không truyền. Không cache kết quả riêng tư giữa request. SQL cũ giữ tham số hóa và project scope.

CLI kiểm kê nhận connection chỉ đọc riêng qua biến được mô tả, `--org`/`--project` cho scope; thiếu/không đủ scope báo chưa thể kết luận. Transaction dùng READ ONLY; lỗi bảng/permission/query phân biệt với số 0. Không có DDL/migration, không tự dùng số dòng để kết luận giá trị sản phẩm.

## 6. Verification và rollout

Fix logic có test hồi quy đỏ trước sửa, targeted Node test hoặc Playwright production thực. Dữ liệu PostgreSQL disposable; không dùng secret/DB thật. Chạy format/lint/typecheck/check UI/SW/layers/dead-code/route-scope và các cổng repo cần thiết, full test release gate + production build, E2E desktop/mobile và audit diff.

Trước rollout cần báo cáo bằng chứng, lỗi/rủi ro còn lại; rollback bằng revert thay đổi tương ứng. UAT/đo usage/production không được đánh dấu hoàn tất khi chưa diễn ra. Phần loại bỏ capability và hợp nhất schema tiếp tục theo điều kiện của kế hoạch được duyệt.

## 7. Kết quả triển khai 23/10/2026

A–E đã được kiểm chứng trên mã nguồn: 18/18 cổng static, production build, full release gate
exit 0 (383 file, 5.152 pass, 0 fail, 1 skip theo allowlist), 45 E2E mới và các hồi quy liên quan.
Dashboard API p95 trong lab giảm khoảng 29%, bản tuần khoảng 50%; hash response không đổi.
Trang chủ mobile vẫn khoảng 4,1 giây tới dữ liệu chính; chưa có bằng chứng Core Web Vitals
người dùng thật. [Báo cáo và dữ liệu nguyên bản](../ops/evidence/m136/verification.md).
UAT, usage và rollout chưa diễn ra; trạng thái toàn mục tiêu vẫn NOT COMPLETE.
