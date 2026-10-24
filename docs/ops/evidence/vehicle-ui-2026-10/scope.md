# Xe ra vào — UI và request theo nhu cầu

- Ngày:24/10/2026. Owner ủy quyền kiểm tra sau đăng nhập, tự sửa/kiểm kỹ/merge/deploy.
- Baseline main `8f5e6702ca2f96e2dafbf7db1b7f9b5ed64e5b86` (#684), managed worktree;
  checkout gốc1.508 tracked deletion giữ nguyên. UAT/usage F2/F3 vẫn WAITING.
- Mức S: fix giao diện capability Xe ra vào hiện hữu. Không đổi API/backend/auth/role policy,
  schema, migration, dependency, tiền, trạng thái xe hoặc payload. Không capability mới.
- Người dùng:Admin/PM/kỹ sư đăng ký và điều phối, thầu phụ thao tác theo quyền API hiện hữu,
  viewer/BCH/CĐT chỉ xem. Context hiện trường/mobile và desktop văn phòng.

## Hiện trạng và lựa chọn

`app/vehicles/page.tsx` tải suppliers ngay cả khi chỉ đọc; load theo date không cancel/guard,
không có loading nên có thể giả rỗng hoặc thao tác snapshot sai ngày. Form overlay riêng không
có dialog/focus trap; label chưa nối input; text-sm gây zoom iOS. PATCH chưa có pending guard;
UI enter/exit hiện cả cho role mà API cấm. Đã đọc contract tại routes vehicles và procurement;
server/RBAC/project scope giữ nguyên. Đọc thêm Họp/Đề xuất, giữ ngoài lát này để có kiểm chứng gọn.

Tái dùng Modal/Button và pattern AbortController/current URL đã có ở Nhân sự. Không thêm loader
framework hoặc package. Chỉ fetch suppliers khi mở đăng ký; cache trong page, không qua project/
actor change (ngữ cảnh ứng dụng hiện hữu buộc reload). Lỗi có retry riêng; không nuốt thành []
hoặc cho gửi form trước khi xác minh danh mục. Các lỗi mạng/HTTP giữ input, không tự gửi lại.

## Acceptance criteria

1. Chỉ xem hoặc đổi ngày:0GET suppliers. Mở form:1GET; mở lại dùng cache. Đóng khi đang tải,
   mở lại và retry không áp response cũ, không mắc loading. Empty hợp lệ vẫn đăng ký được.
2. Chỉ request/ngày hiện tại được áp; lỗi/mạng/malformed không giả danh sách rỗng. Loading/error/
   empty rõ. Snapshot cũ giữ chỉ xem, ghi nhãn ngày và khóa nút ghi lên xe cũ cho tới retry đúng.
3. Modal có tên, labels thật, Escape/trap/return focus và scroll; mobile360px không tràn, input16px,
   target44px; Light/Dark Blue axe không serious/critical, gồm thẻ quá giờ, lỗi/snapshot và hover nút ra. Nền trung tính giữ nhãn/viền cảnh báo, trạng thái/đếm quá giờ không đổi. Nội dung dài wrap.
4. Form giữ draft khi lỗi; loading danh mục có thể nhập draft nhưng chưa submit. POST pending
   chặn gửi lặp/đóng/đổi input; PATCH pending chặn gửi lặp/đổi ngày. Payload/action/export/sort/late
   semantics giữ nguyên, API401 đi theo redirect hiện hữu. Không tự retry write.
5. Role UI khớp API đang có:chỉ role xem không hiện nút ghi; không cấp quyền server mới.
6. RED baseline trước sửa; GREEN desktop/mobile, hồi quy vehicles, tests procurement PostgreSQL,
   gate/build/full CI exact HEAD. Merge khi xanh; mainCI/deploy cùng SHA; public smoke sau deploy.

## Giới hạn

Không dùng DB/secret hoặc tài khoản thật production để test. Authenticated tests dùng PostgreSQL
16 disposable + login thật; route fixtures synthetic chỉ để tiêm lỗi/delay/count và kiểm payload,
không thay nghiệm thu người thật. Kiểm production chỉ đọc public/login/health/readiness/API401;
không có phiên production được xác minh. Count fixture không phải CWV/latency/usage production.
Rollback:revert squash, không migration. Cùng failure tối đa3 repair, không skip/nới gate.
