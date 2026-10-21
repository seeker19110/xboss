# Acceptance — A1 API-key write

Sáu MUST của lát P/H hai route session/claims, không SHOULD. A1 tổng thể, các route khác, B/OIDC và M/O giữ PARTIAL; không thay acceptance toàn sản phẩm.

- [x] `A1K-ROLE-001` **MUST** Handler chạy bằng xboss_app NOSUPERUSER/NOBYPASSRLS, không sở hữu bảng kiểm; sessions/claims/conflicts có RLS/FORCE RLS thực sự, own positive không rỗng.
- [x] `A1K-CONTEXT-002` **MUST** Hai org/admin/project/key thật, created_by/org/project/scopes đúng; mỗi request bắt đầu context rỗng, không cookie hoặc mock auth/DB; server tự đặt context đúng, owner pool oracle độc lập và cleanup/pool đóng qua finally.
- [x] `A1K-BOUND-003` **MUST** Cả A→B và B→A, key engineering gắn project gửi claim hợp lệ tới foreign session trả exact 422/body, snapshot đầy đủ business state cả hai project bất biến; own route 201/200 ghi đúng session/claim/conflict và round.
- [x] `A1K-GLOBAL-004` **MUST** Cả hai chiều global engineering key mở phiên và ghi claim với foreign project đều trả exact 404/body, business state cả hai project bất biến; own project qua 201/200 thành công.
- [x] `A1K-SCOPE-005` **MUST** Cả hai chiều read-only key không mở phiên hoặc ghi claim được dù payload/own target hợp lệ: exact 403/body và business state bất biến; cùng request qua engineering key ghi thành công.
- [x] `A1K-REGRESSION-006` **MUST** Đủ bảy ca mới và regression liên quan pass 0 skip, typecheck/build/static xanh, review khác model không P1/P2; strict đếm đúng sáu MUST, final verify/CI theo HEAD, giới hạn coverage giữ rõ.

Chỉ tick theo bằng chứng thật. Snapshot không gồm telemetry key last_used_at/rate-limit; không claim toàn DB bất biến. Source/budget/commands tại PLAN và RESEARCH cùng tiền tố.

Bằng chứng local 7/7 + 80/80, 0 skip, typecheck/build, static 18/18 và review độc lập tại QA. Final verify/CI đúng HEAD vẫn là Gate bắt buộc trước merge; receipt runtime/fingerprint và run URL được ghi ở PR, không suy từ dấu tick hoặc lần chạy local.
