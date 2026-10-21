# Research — A1 API-key write · 22/10/2026

Spec: A1-SCOPE §4 A1-AC01, TEST-MATRIX §3 (Approved 25/09/2026); S15 checkpoint 12 và A1-AC01-RESEARCH sau #666. Reviewer Astra xác nhận gap: route-con-lai chỉ kiểm khác project và round_count, API-key tenant security chủ yếu helper, S16 chỉ v1 đọc.

Hai route hiện hữu: app/api/v1/engineering/agent-sessions/route.ts tạo session 201; app/api/v1/engineering/agent-sessions/[id]/claims/route.ts ghi claim 200, catch AgentSessionError thành 422. requireApiKey trong lib/bao-mat/api-keys.ts kiểm Bearer/hash/revoked/expiry, scope, rate-limit, project cùng org rồi đặt request context. Key bound ưu tiên project_id; global key mới đọc ?project=.

lib/ky-thuat/engineering-agents.ts: schema input 306/318, openAgentSession 459, addClaims 486, getAgentSession 543. Payload input intent + một claim specialist/topic đường kính/DN100; thêm DN150 cùng topic tạo conflict_requires_review, roundCount 2, closed false. Session setup phải qua route thật, không gọi helper domain trực tiếp để dựng output.

| Nhóm                                                        | Denial exact                                              | Positive                         |
| ----------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| Bound engineering key, foreign session                      | 422, Phiên không tồn tại hoặc không thuộc dự án đang chọn | own 201/200                      |
| Global engineering key, foreign project (mở phiên và claim) | 404, Dự án không tồn tại                                  | own ?project=, 201/200           |
| Read scope, own session/payload hợp lệ                      | 403, API key không có quyền truy cập tài nguyên này       | engineering key cùng request 200 |

Mỗi nhóm hai chiều, tổng sáu ca + một metadata role/RLS = bảy ca. Handler phải bọc runWithRequestContext({}, ...) mới (lib/nen/request-context.ts); không dùng helper goi để giả định nó tạo context vì helper đó chỉ await response/parse JSON. Không gọi dangNhap hoặc mock next/headers trong file mới.

App role theo mẫu tests/s16-app-role-duong-phu.test.ts, TEST_DATABASE_URL owner disposable, đổi username/password trong URL sang xboss_app/placeholder migration 0069. Kiểm NOSUPERUSER/NOBYPASSRLS và ownership bằng pg_has_role như rls-app-role-route; kiểm RLS/FORCE trên ba bảng engineering (0087, 0091/0092). Luôn restore global pool trong finally, không chạy song song đoạn đổi pool. Owner pool riêng dựng input và SELECT * snapshot cả hai project, không dùng app role làm oracle.

Chỉ business sessions/claims/conflicts phải bất biến khi deny; verifyApiKey vẫn có thể ghi last_used_at và hitRateLimit. Cleanup dữ liệu fixture theo ID, không DELETE audit/receipt bất biến; đóng mọi pool nếu setup/test đỏ. Không scope “toàn DB bất biến”.

Stack theo lock giữ Node 24.21.0, Next 16/PostgreSQL 16/node:test/tsx/pg hiện có; không dependency/provider mới. ENGINEERING-AGENTS nhận claim từ hệ ngoài nhưng test không gọi agent/model/mạng bên ngoài.

Sau lát này chỉ có bằng chứng H/P của hai route trên. engineering/ingest, engineering/intelligence, toàn auth inventory, OIDC browser, M/O/UAT và toàn A1-AC01 vẫn chưa được đóng.

Review source đóng băng: Astra không thấy P1/P2; xác nhận fresh empty context, global-pool finally, non-bypass/ownership metadata, non-vacuous full snapshot hai project và own positives. Review chỉ đọc; lần chạy DB đầu tiên sau đó xác nhận 7/7 mới + 80/80 regression, 0 skip. Chi tiết và điều kiện final verify/CI tại QA, không claim socket HTTP/B hoặc toàn A1.
