# Nhật ký quyết định tự duyệt

> Ghi bởi `xt.py loop decide`. Phiên chính tự duyệt điểm quyết định theo tiêu chí chất lượng cuối (`LOOP-STOP-018`, ADR-0008 của khung). Người xem lại bất cứ lúc nào; đổi ý → quyết định mới ghi "thay D-NNN", không sửa mục cũ.

### D-001 · 2026-10-21T21:43:42+00:00 · Tiếp tục autopilot sau khi mọi PR đãmerge bằng lát nào?

- Phương án: (1) A1-AC01 B haiadminhaiorg cảhai chiều read/write/select/export, bốnca×desktop/mobile, PHhiệnhành,6MUST, không thêmcapability · (2) Mở rộng audit toàn406route hoặc lặp lại A4/A5 đãcóbằngchứng
- Chọn: A1-AC01 B haiadminhaiorg cảhai chiều read/write/select/export, bốnca×desktop/mobile, PHhiệnhành,6MUST, không thêmcapability
- Lý do (tiêu chí chất lượng cuối): Người dùng yêu cầu tiếp tục hoàn thiện và/autopilot;663/664/665đãmerge, khôngcònPRmở. QUALITY-FINAL-1 Approved25/09 choA1-AC01, S15thiếuđúngBhaiorg; researchchứngminhtesthiệnhànhchưaphủadminCRUD/export. Lát4giờ test/docs cópositivecontrols/cookie/fileoracle đủbổsungkhoảngtrống, khôngđổi spec/dependency/policy.
- Đường lùi: GiữPARTIAL nếu thiếunhánh/QAđỏ, ghi decisionnếuphát hiệnbughànhvi; khôngnângtoànaudit/MO hoặcđổi mergeL1

### D-002 · 2026-10-21T21:47:23+00:00 · Làm rõ giới hạn A1 và auth inventory sau review nguồn spec?

- Phương án: (1) Bổ sung bốn luồng B cookie và chạy lại P/H session/API-key/cron/2FA/OIDC/traffic; giữ A1 tổng thể PARTIAL · (2) Coi bốn ca browser là đã đóng toàn A1-AC01
- Chọn: Bổ sung bốn luồng B cookie và chạy lại P/H session/API-key/cron/2FA/OIDC/traffic; giữ A1 tổng thể PARTIAL
- Lý do (tiêu chí chất lượng cuối): Làm rõ D-001: S15 thiếu B hai org VÀ M, không chỉ B. Matrix yêu cầu auth inventory; P/H có sẵn bổ sung bằng chứng nhưng API-key write hai org/hai chiều và OIDC browser đầy đủ chưa được chứng minh. Cam kết không mock áp dụng B; P/H mock transport next/headers và mạng Google nhưng DB/auth thật.
- Đường lùi: Giữ mọi nhánh thiếu bằng chứng mở; chỉ nâng verdict sau Gate và review tương ứng, không đổi spec hoặc bỏ MUST.

### D-003 · 2026-10-21T21:52:12+00:00 · Sửa observer response khi UI chọn project tự reload?

- Phương án: (1) Đọc exact status/body/request payload ngay khi response tới, trước chờ navigation; giữ đầy đủ reload/cookie/menu assertions và kiểm lặp · (2) Bỏ body assertion hoặc tăng timeout
- Chọn: Đọc exact status/body/request payload ngay khi response tới, trước chờ navigation; giữ đầy đủ reload/cookie/menu assertions và kiểm lặp
- Lý do (tiêu chí chất lượng cuối): T004 RED: 4 select/export desktop/mobile đều timeout tại response.json sau reload, 5 ca gồm setup/read/write pass. Page-closed là hậu quả teardown, chưa chứng minh app bug. Cần thu body response gốc sớm để observer không phụ thuộc tài liệu đã reload; reviewer độc lập đồng ý hướng sửa hẹp, vẫn cần runtime proof.
- Đường lùi: Giữ RED artifacts và toàn oracle; nếu early-read chưa đủ thì đổi cách quan sát, không bỏ assertion hoặc nới timeout.

### D-004 · 2026-10-21T21:55:26+00:00 · Thay cách quan sát sau khi early-read vẫn treo CDP body?

- Phương án: (1) Observer browser gọi fetch thật, đọc clone response qua binding rồi trả nguyên Response cho app; Node assert, cleanup và kiểm lặp chức năng · (2) Lặp lại CDP body hoặc bỏ exact body assertion
- Chọn: Observer browser gọi fetch thật, đọc clone response qua binding rồi trả nguyên Response cho app; Node assert, cleanup và kiểm lặp chức năng
- Lý do (tiêu chí chất lượng cuối): Thay hướng D-003 sau probe thứ hai: 4 focused select/export desktop/mobile fail cùng response.json, setup pass, trace lưu riêng. Reviewer Astra xác nhận fetch-clone không thay HTTP/auth/output nhưng trì hoãn app nhận response. Chỉ claim chức năng; Node assertions giữ nguyên, observer lỗi phải làm test đỏ và vẫn trả nguyên response cho app.
- Đường lùi: Giữ cả hai lượt RED; restore observer/binding trong finally, không mock/route/API gọi lại hoặc thay app. Nếu QA không chứng minh đủ thì acceptance mở.

### D-005 · 2026-10-21T21:58:31+00:00 · Xác nhận observer và selector theo UI sau probe D004?

- Phương án: (1) Sửa nhãn desktop Excel/mobile Xuất Excel theo source, kiểm exact href, thêm Gate repeat ba lần select/export hai viewport · (2) Coi focused 4 pass/1 fail là đã đủ bằng chứng
- Chọn: Sửa nhãn desktop Excel/mobile Xuất Excel theo source, kiểm exact href, thêm Gate repeat ba lần select/export hai viewport
- Lý do (tiêu chí chất lượng cuối): D004 giải quyết body observer cho hai viewport và mobile Excel; desktop hiện chỉ sai tên locator theo UI thật. Cần full9 và repeat12ca+setup để chứng minh contract trên nhiều context trước final verify. Đổi số task chưa có evidence: T005 repeat, T006 static, T007 strict, T008 merge; giữ deadline/vòng/history.
- Đường lùi: Giữ mọi verdict đỏ và artifacts cũ; không thay app, timeout hoặc oracle. Nếu chưa xanh thì MUST tiếp tục mở.
