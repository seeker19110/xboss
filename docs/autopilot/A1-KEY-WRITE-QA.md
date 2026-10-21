# QA — A1 API-key write · 22/10/2026

Base main `273a09d2` (#666 đã merge sau quyền người dùng). Source chỉ test/docs; không đổi app, auth policy, schema, dependency hoặc gate/allowlist. Không áp dụng AGENTS.md cũ đã bị thu hồi. PostgreSQL 16 disposable, Node 24.21.0 và đúng lockfile hiện có.

## Bằng chứng cục bộ trước source commit

| Gate                                  | Kết quả                           | Hoàn tất UTC 21/10/2026 |
| ------------------------------------- | --------------------------------- | ----------------------- |
| T-001 typecheck                       | PASS                              | 22:28:18                |
| T-002 file mới                        | 7/7 pass, 0 fail/skip/cancelled   | 22:28:41                |
| T-003 sáu suite regression trong PLAN | 80/80 pass, 0 fail/skip/cancelled | 22:29:13                |
| T-004 build production                | PASS                              | 22:32:25                |
| T-005 static                          | 18/18 PASS                        | 22:35:45                |
| T-006 strict                          | 6 MUST đạt, 0 mở/miễn             | 22:36:17                |

Các lệnh Gate nguyên văn tại PLAN; JSON máy tại .autopilot/evidence/T-001…T-006.json (runtime bị gitignore). Đây là lần DB đầu tiên của file mới, không có ca đỏ bị bỏ hoặc nới assertion. D-002 thêm guard không DB trước lần chạy đầu, tương thích integration harness hiện có; mọi bằng chứng ở bảng dùng TEST_DATABASE_URL thật và 0 skip.

## Oracle và contract đã chạy

- Một ca metadata chứng minh xboss_app NOSUPERUSER/NOBYPASSRLS, không sở hữu trực tiếp/gián tiếp các bảng; sessions/claims/conflicts đều có RLS/FORCE RLS. Hai admin cùng role, hai org/project và sáu key có created_by/org/project/scopes đúng.
- Sáu ca nghiệp vụ: ba nhóm bound/global/read scope, cả A→B và B→A. Mỗi handler bắt đầu context rỗng, không cookie; Bearer thật được requireApiKey kiểm rồi tự đặt org/project/actor. Global pool được assert và restore trong finally; owner/app pool luôn đóng cả khi fixture/assertion lỗi.
- Setup tạo session qua handler 201, không dựng business output bằng SQL/domain helper. Owner SELECT * ba bảng của cả hai project trước/sau từng denial, có hai session/claim thật trước khi so sánh. Bound foreign claim 422 exact body; global foreign project từ cả open/claims 404 exact body; read scope từ cả open/claims 403 exact body.
- Own 201/200 là positive controls: session đúng key/project, DN100 round 1 → DN150 round 2, conflict_requires_review/closed false; hai claim đúng session và một scope conflict chứa đúng hai claim ID. Foreign business state bất biến cả sau own positive.
- Snapshot chỉ business state; verifyApiKey.last_used_at và rate-limit có thể đổi hợp lệ. Cleanup chỉ ID của fixture, không xóa audit/receipt bất biến.

## Review và kiểm trước merge

Executor xác nhận ESLint, Prettier và full typecheck pass trên file đóng băng. Reviewer khác model Astra đã đọc file/PLAN/AC/RESEARCH và không thấy P1/P2 về context, pool, cleanup, oracle hoặc phạm vi; review chỉ đọc, không thay bằng chứng runtime.

Bảng trên xác nhận static 18/18 và strict đúng sáu MUST đạt, 0 mở/miễn (đã đọc JSON, không chỉ exit 0). Final replay/CI chưa được khẳng định bởi bảng trên. Sau khi mọi Gate cục bộ pass, commit source rồi chạy loop verify trên đúng HEAD với cây sạch; phải PASS STABLE và fingerprint không đổi. Toàn CI, review thread và merge-check phải kiểm lại theo HEAD mới nhất, ghi receipt/fingerprint/run URL ở PR; không lấy evidence cũ thay kiểm cuối. L1 giữ nguyên và merge cần quyền người dùng cho PR mới.

## Giới hạn

Đây là P/H qua NextRequest/handler thật và DB thật, không socket HTTP hoặc B. Không mock cookie/auth/DB, không gọi AI/agent/network ngoài. Chỉ hai route session/claims được bổ sung; engineering ingest/intelligence, toàn auth inventory, OIDC browser, M/O/UAT và RELEASE_VERIFIED vẫn mở. A1/S15 tổng thể PARTIAL, không sửa verdict lịch sử hoặc blueprint toàn 1152 MUST/639 SHOULD.
