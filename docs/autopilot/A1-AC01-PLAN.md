# Autopilot — A1-AC01 ·22/10/2026

> Phiên chính tự duyệt theo D-001, tiếp tục chỉ dẫn /autopilot sau khi #663/#664/#665 đều merge; main9c13f54a. Không áp dụng AGENTS.md cũ đã được người dùng thu hồi.

## G0–G4: phạm vi và chỉ số hoàn tất

QUALITY-FINAL-1 Approved25/09/2026, A1-SCOPE §4 A1-AC01 và TEST-MATRIX §3 yêu cầu hai admin khác tổ chức không đọc/ghi/chọn/export xuyên org. S15 vẫn PARTIAL vì thiếu B hai org và M; lát này bổ sung đúng bốn luồng, cả hai chiều A↔B và desktop/mobile, không suy thành audit406route hoặc toàn1152MUST/639SHOULD.

Người dùng là admin tổ chức quản lý người/dự án và xuất tiến độ. Chỉ số: bốn ca B ×hai viewport +setup=9 lượt pass0skip, P/H hiện hành xanh, sáu MUST đối chiếu đủ, review khácmodel khôngP1/P2, finalverify/CI theo HEAD. Không đổi spec, app, schema, policy, dependency, CI/hook hoặc dữ liệu thật theo phạm vi dự kiến; nếu gặp bug nghiệp vụ thì ghi decision và sửa đúng contract đã duyệt trước khi mở PR.

Coverage của lát này là B cookie bốn luồng và P/H liệt kê trong RESEARCH. Không đóng toàn A1-AC01 hoặc toàn inventory auth; M, OIDC browser đầy đủ và API-key write hai org/hai chiều còn mở.

Research nguồn repo tại A1-AC01-RESEARCH.md. Giữ Node24/Next16/PostgreSQL/Playwright1.63/ExcelJS theo lock; không thư viện/dịch vụ mới. Lớp B dùng browser/cookie thật → route hiện hữu → DB disposable; SQL chỉ dựng input, không mock auth/API/DB/download. P/H hiện hành có mock transport next/headers và mạng Google theo từng suite, nhưng dùng DB/auth thật.

## Contract và ownership

Executor chỉ tạo e2e/helpers/a1-org-boundary-fixtures.ts và e2e/authed/a1-ac01-org-boundary.spec.ts. Root sở hữu docs/runtime/gates/git/PR; reviewer khácmodel chỉ đọc, không agent lồng.

Mỗi ca hai org, mỗi org hai project và bảy role hợp lệ admin/pm/engineer/subcon/bch/cdt/viewer; gọi riêng dungToChucCoLap(roles,2), không role trùng. Chỉ hai admin login, context cookie rỗng, giữ thiết bị/mobile; /auth/me chứng minh hai ID/org/role. WBS/sheet slug/sentinel riêng mỗi project, sheet code có thể trùng; fixture chỉ0%, không trực tiếp dựng output nghiệp vụ. Đóng mọi context/pool, giữ audit/input tới global-setup của DB disposable, không DELETE audit hoặc seed để dọn.

Read: cả hai /portfolio,/users và GET/api/projects,/api/users đúng tập own IDs/names; có own positive data trước kiểm loại foreign.
Write: cả hai chiều PATCH foreign user với roleviewer hợp lệ và DELETE foreign→404, DB mục tiêu không đổi. Chọn target ngoại tách khỏi đối chứng nội bộ. Cùngorg đổi role engineer→viewer bằng combobox, xóa user khác chưa có dữ liệu bằng dialog thật;200 và UI sau reload đúng.
Select: mỗi admin UI chọn project2 cùngorg→200, reload giữ pathname và cookiexboss_project đúngID. POST foreignProject→403, cookie/UI vẫnown. Khi kiểm foreignoption vắng phải mở listbox và chứng minh ownoption hiện, tránh vắng vì menu đóng.
Export: mỗi admin chọn project qua UI, click linkXuấtExcel thật, đọc file download bằng ExcelJS. Có task/project đangchọn và headers literal, loại sentinel org khác lẫn project cùngorg chưa chọn; filename chứa code đangchọn. Foreignslug→404, DB business khácorg khôngđổi; echo slug đãgửi không tính dữ liệu bịlộ.

Transient UI cần kiểm ngay cùng response trước observer/disk như D-007 A5; không dựa toast còn sống sauđọcDB. Một case nhiều bước hai chiều có timeout60s dự kiến, không nới domain assertions. Gate browser giữ fullmergedlog/output riêng bằngpipefail theo FB004.

## Ngân sách và điểm dừng

- Tối đa28 vòng, dự toán mềm45000token; không provider trả phí.
- Timeout mỗiGate3600s; loop mới giới hạn4giờ, không reset history/clock loop trước.
- L1 giữ nguyên. Quyền người dùng vừa cấp chỉ cho #664/#665; PR mới xétmerge-check khi code/CI hoàn tất, không tự đổi policy.
- Gate lỗi lầnhai đổi cách; ba lần cùngchữký thìblocked, không skip/nớiassertion. M/O/staging/production/tiền thật/thông báo nằm ngoài slice.

## Task

- [x] `T-001` Fixture và bốn ca browser compile — Gate: `npm run typecheck`
- [ ] `T-002` P/H org scope hiện hành trên DB disposable — Gate: `npm run test:single -- --experimental-test-module-mocks --test-concurrency=1 tests/route-users-cach-ly-org.test.ts tests/project-select-org.test.ts tests/s02c-dashboard-scope.test.ts tests/api-key-tenant-security.test.ts tests/s16-app-role-duong-phu.test.ts tests/traffic-token.test.ts tests/s02e-org-config.test.ts`
- [ ] `T-003` Build production — Gate: `npm run build`
- [ ] `T-004` B hai chiều desktop/mobile và download thật — Gate: `bash -o pipefail -c "npm run test:e2e -- e2e/authed/a1-ac01-org-boundary.spec.ts --workers=2 --output=.autopilot/runtime/a1-browser 2>&1 | tee .autopilot/runtime/a1-browser.log"`
- [ ] `T-005` Cổng tĩnh — Gate: `npm run gate`
- [ ] `T-006` Acceptance đủbằngchứng/review độc lập — Gate: `python3 .xtemplates/scripts/xt.py blueprint-status docs/autopilot/A1-AC01-ACCEPTANCE.md --strict`
- [ ] `T-007` MergePR slice theoL1 — Gate: `bash -c 'gh pr view codex/autopilot-a1-ac01 --json state --jq .state | rg -x MERGED'`

Một PR test/docs khi slice xong; base main mới nhất, không gộp với PR đãmerge. P50 2giờ/P90 4giờ cộngCI/người merge; thiếumột nhánh acceptance thì giữ PARTIAL.
