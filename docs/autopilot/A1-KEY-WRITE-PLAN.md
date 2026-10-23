# Autopilot — A1 API-key write · 22/10/2026

> Tiếp tục sau #666 đã được người dùng cho phép merge, main `273a09d2`. D-001 tự duyệt lát test/docs theo QUALITY-FINAL-1 Approved 25/09/2026. Không áp dụng AGENTS.md cũ đã được người dùng thu hồi.

## G0–G4: phạm vi và chỉ số hoàn tất

A1-SCOPE §4 A1-AC01 và TEST-MATRIX yêu cầu cách ly tổ chức trên các auth method thực. #666 đã bổ sung bốn luồng B cookie; RESEARCH ghi còn thiếu API-key write hai org/hai chiều. Lát này bổ sung P/H cho POST engineering/agent-sessions và POST /:id/claims, không đổi capability hoặc auth policy.

Người dùng được bảo vệ là admin tạo key tích hợp: key của tổ chức mình không được ghi vào phiên/dự án tổ chức khác, dù cả hai người tạo key có cùng role admin. API-key path dùng scopes, không kiểm CAN theo role admin. Ba nhóm × hai chiều = sáu ca nghiệp vụ, cộng một ca kiểm metadata role/RLS = bảy ca mới, tất cả bắt buộc 0 skip. Typecheck/build, regression liên quan, 18 cổng tĩnh, strict sáu MUST, review khác model và final verify/CI theo HEAD đều phải xanh.

A1 tổng thể giữ PARTIAL. Chỉ bổ sung hai route trên; engineering/ingest, engineering/intelligence, toàn auth inventory, OIDC browser, M/O/UAT thiết bị và RELEASE_VERIFIED còn mở. Không thay blueprint toàn sản phẩm 1152 MUST/639 SHOULD.

Stack giữ theo lock: Node 24, Next 16, PostgreSQL 16, node:test/tsx/pg hiện có. Không dependency, dịch vụ hoặc credential thật mới. Handler thật + NextRequest/Bearer + DB disposable; không cookie/mock auth/mock DB, không gọi mạng AI hoặc agent bên ngoài. Đây là P/H handler, không phải B hoặc kiểm qua socket HTTP.

Kiến trúc kiểm: owner chỉ dựng org/admin/project/key đầu vào → request context rỗng mới → requireApiKey xác thực Bearer/đặt org/project/actor → route chạy qua app pool xboss_app NOBYPASSRLS → transaction ghi session/claim/conflict → owner pool độc lập quan sát cả hai project. Setup session cũng phải qua handler 201, không gọi trực tiếp openAgentSession hoặc SQL dựng output.

## Contract và ownership

Executor chỉ tạo tests/a1-api-key-write-org.test.ts. Root sở hữu docs/runtime/gates/git/PR; reviewer khác model chỉ đọc. Không agent lồng. Các đoạn đổi global pool phải tuần tự và luôn restore trong finally.

- Metadata: current_user xboss_app, rolsuper=false, rolbypassrls=false; không sở hữu trực tiếp/gián tiếp các bảng được kiểm. RLS và FORCE RLS phải bật trên sessions/claims/conflicts, không chấp nhận chỉ thấy dữ liệu rỗng.
- Mỗi handler gọi trong runWithRequestContext({}, ...) mới, không đặt sẵn org/project/actor hoặc cookie. Own positive phải chứng minh context do server đặt và các dòng được ghi đúng project/session/key.
- Key gắn project, scope engineering: claim hợp lệ tới foreign session → exact 422/body “Phiên không tồn tại hoặc không thuộc dự án đang chọn”. Own session 200, roundCount 2, conflict_requires_review, closed false với DN100→DN150 cùng topic.
- Global key, scope engineering: cả POST mở phiên và POST claim với ?project=foreign → exact 404/body “Dự án không tồn tại”; ?project=own tạo phiên 201 và ghi claim 200. Key đã gắn project không bị query đổi project; không mong 404 chỉ vì query foreign.
- Key chỉ read: cả POST mở phiên và POST claim với payload/own target hợp lệ → exact 403/body “API key không có quyền truy cập tài nguyên này”; cùng payload qua engineering key 200.
- Trước/sau mỗi denial, owner SELECT * đủ sessions/claims/conflicts trong CẢ HAI project, thứ tự ổn định; so sánh toàn snapshot, không chỉ round_count, không để RLS che oracle. Own positive ghi đúng session/claim/conflict, foreign business state giữ nguyên.
- Chỉ claim business state bất biến: api_keys.last_used_at và rate-limit có thể đổi khi deny. Cleanup chỉ dữ liệu fixture theo ID, không xóa audit/receipt bất biến; đóng owner/app pools kể cả khi setup hoặc assertion đỏ.

## Ngân sách và điểm dừng

- Tối đa 24 vòng, dự toán mềm 35000 token; không dịch vụ trả phí.
- Timeout mỗi Gate 3600 giây. Deadline không muộn hơn 01:43:42 UTC ngày 22/10/2026 của phiên A1 đang tiếp tục; loop mới dùng phần giờ còn lại trừ một phút, không reset loop/evidence cũ.
- Dự kiến chỉ test/docs. Nếu phát hiện bug nghiệp vụ thì ghi decision, sửa theo contract đã duyệt; không giảm assertions hoặc skip test.
- L1 giữ nguyên. Quyền merge #666 đã được thực hiện; PR mới theo merge-check sau QA/review/CI. M/O/production/tiền thật/thông báo nằm ngoài lát.

## Task

- [x] `T-001` Ca P/H mới compile — Gate: `npm run typecheck`
- [x] `T-002` Bảy ca mới trên app role thật, 0 skip — Gate: `npm run test:single -- --test-concurrency=1 tests/a1-api-key-write-org.test.ts`
- [x] `T-003` Regression API-key/engineering/RLS trên DB disposable — Gate: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/api-key-tenant-security.test.ts tests/s16-app-role-duong-phu.test.ts tests/engineering-agents.test.ts tests/route-con-lai.test.ts tests/api-keys.test.ts tests/rls-app-role-route.test.ts`
- [x] `T-004` Build production — Gate: `npm run build`
- [x] `T-005` Cổng tĩnh — Gate: `npm run gate`
- [x] `T-006` Sáu MUST có bằng chứng/review — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A1-KEY-WRITE-ACCEPTANCE.md --strict`
- [ ] `T-007` Merge PR theo L1 — Gate: `bash -c 'gh pr view codex/autopilot-a1-api-key-write --json state --jq .state | rg -x MERGED'`

Một PR test/docs từ main mới nhất. P50 một giờ/P90 hai giờ cộng CI/người merge, trong deadline trên; thiếu bằng chứng thì giữ PARTIAL.
