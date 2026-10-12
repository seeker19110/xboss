# Cổng chất lượng cụ thể theo hồ sơ (C1–C10) + quyền riêng tư dữ liệu

> `03-tech-selection-and-proactive-advice.md` PHẦN C đặt tên "cổng đặc thù" cho từng hồ sơ (mỗi hồ sơ một
> dòng tóm tắt). File này viết **cụ thể, đo được** từng cổng đó — cùng độ chi tiết với `CLAUDE.md` §3(B)
> cho web/UI — để `/gate` và cổng merge có tiêu chí thật để đối chiếu, không chỉ tên gọi chung chung.
> **C1 (Web app):** a11y/hiệu năng/theme ở `CLAUDE.md` §3(B), không lặp lại; mục `## C1` dưới chỉ thêm phần §3(B) chưa nêu.
> **Ma trận bằng chứng** (cuối file) nối mỗi hồ sơ × 5 chiều tới đúng cổng phải chứng minh, theo mức rủi ro S/M/L.
> Đọc đúng phần khớp hồ sơ dự án (PHẦN A0 của `03-tech-selection-and-proactive-advice.md`); dự án đa
> thành phần (C10) đọc phần của từng thành phần con.
> Con số ngân sách (thời gian tải, fps, kích thước…) là **điểm khởi đầu tham khảo** — dự án tự chốt số
> thật vào `PROJECT.md`/ADR theo bối cảnh (thiết bị mục tiêu, đối tượng dùng); không dùng máy móc.

---

## Cổng bổ sung áp cho MỌI hồ sơ có dữ liệu cá nhân (không riêng web)

> Bổ sung cho `CLAUDE.md` §3.2 ("không tin client, bảo mật server-side"): vòng đời **dữ liệu cá nhân**
> (PII). Áp cho bất kỳ hồ sơ nào (C1–C10) có thu thập/lưu dữ liệu người dùng thật, kể cả khi không phải
> web (app mobile, backend, pipeline data/ML).

1. **Thu thập tối thiểu:** chỉ lưu trường dữ liệu cá nhân thực sự cần cho tính năng; không lưu "phòng khi cần sau".
2. **Khai báo rõ mục đích dùng** ở nơi thu thập (form, permission prompt, API doc) — không dùng cho mục đích khác mà không hỏi lại.
3. **Xóa được theo yêu cầu** (right to delete/erasure): có đường xử lý xóa dữ liệu cá nhân của một người dùng cụ thể, kể cả bản sao/backup/log — không chỉ xóa ở bảng chính.
4. **Ẩn danh hóa trước khi dùng cho mục đích thứ cấp** (phân tích, huấn luyện model — xem thêm C7 mục 5).
5. **Bảo vệ khi lưu trữ:** mật khẩu dùng hàm băm mật khẩu có salt (ưu tiên Argon2id), không mã hóa có thể giải ngược — theo [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Dữ liệu nhạy cảm cần đọc lại (thông tin định danh, thanh toán) được mã hóa; không lưu plaintext.
6. **Log không chứa PII thô** (không log mật khẩu, số thẻ, token phiên) — che/hash trước khi ghi log.
7. **Có thời hạn giữ dữ liệu** (retention) đã quyết định và ghi trong ADR/`PROJECT.md`, không giữ vô thời hạn mặc định.

Ghi inventory, vòng đời, kiểm soát và bằng chứng của dữ liệu cá nhân vào docs/DATA-GOVERNANCE.md theo mẫu `docs/framework/templates/DATA-GOVERNANCE.template.md`.

Vi phạm mục nào trong 7 mục trên khi đụng dữ liệu người dùng thật → dừng và hỏi chỉ theo CLAUDE.md §9 (thiếu mục tiêu/dữ kiện không tự xác minh · không có phương án đạt chất lượng trong scope/budget · cần quyền chưa cấp) và `docs/framework/standard-delivery.md` §3d; không tự quyết định thay người dùng.

---

## C1 — Web app (phần `CLAUDE.md` §3(B) chưa nêu)

1. **E2E luồng chính** (Playwright hoặc tương đương) chạy trên CI, gồm trạng thái tải/rỗng/lỗi của màn chính — không chỉ "happy path".
2. **Test phân quyền âm tính:** người dùng A không đọc/sửa được dữ liệu của B qua API/RLS (gọi thẳng endpoint, không qua UI).

## C2 — Mobile native

1. **Cold start** ≤ ngân sách đã chốt (điểm khởi đầu tham khảo: 2s trên thiết bị tầm trung) — đo bằng thời gian tới màn hình tương tác đầu tiên, không phải chỉ splash screen.
2. **60fps khi cuộn/chuyển màn** ở luồng chính — không giật (frame time không vượt ngưỡng đã chốt) trên thiết bị thấp nhất còn hỗ trợ.
3. **Kích thước app** ≤ ngân sách đã chốt trong `PROJECT.md` (khác nhau nhiều theo loại app — không có số chung).
4. **A11y nền tảng:** mọi control chính đọc được bằng TalkBack (Android) và VoiceOver (iOS); tương phản đạt AA; vùng chạm theo đơn vị nền tảng (Android ≥ 48dp, iOS mục tiêu ≥ 44pt theo quy ước UX của repo); không dùng CSS px để đo control native. Xem [Android](https://developer.android.com/guide/topics/ui/accessibility/apps) và [Apple](https://developer.apple.com/design/human-interface-guidelines/accessibility).
5. **Permission tối thiểu, xin đúng lúc dùng** (không xin toàn bộ permission lúc mở app lần đầu) — kèm giải thích lý do trước khi xin (rationale).
6. **Trạng thái mất mạng/offline** có xử lý rõ ràng (không crash, không treo loading vô hạn); nếu app cần offline-first, có chiến lược đồng bộ khi có mạng lại.
7. **E2E thiết bị** (Maestro/Detox) cho luồng chính (đăng nhập, luồng lõi của app) chạy trước mỗi build release.
8. **Test trên cả hai nền tảng** (iOS + Android, thiết bị thật hoặc simulator/emulator đại diện) trước khi release — không chỉ test trên một nền tảng rồi suy ra nền tảng kia.

## C3 — Desktop app

1. **Code signing/notarization bắt buộc** trước phát hành — không phát hành bản để trình cài đặt cảnh báo "nhà phát hành không xác minh".
2. **Auto-update an toàn:** có cơ chế xác minh bản cập nhật (chữ ký/checksum) trước khi cài; có đường **rollback** nếu bản mới lỗi.
3. **Quyền truy cập hệ thống** (file system, camera, micro, accessibility API…) xin tối thiểu cần thiết, giải thích lý do; không chạy nền/khởi động cùng OS nếu người dùng không đồng ý.
4. **Thời gian khởi động** ứng dụng ≤ ngân sách đã chốt trong `PROJECT.md`.
5. **Test trên mọi OS mục tiêu** (Windows/macOS/Linux — tùy phạm vi đã chốt) trước khi release, không chỉ test trên OS của máy dev.
6. **A11y nền tảng:** dùng được hoàn toàn bằng bàn phím và trình đọc màn hình của từng OS mục tiêu; tương phản đạt AA.
7. **Dữ liệu cục bộ khi nâng bản:** migration dữ liệu/config cục bộ có backup trước khi nâng, có test mở dữ liệu của bản trước.

## C4 — Backend / API / dịch vụ

1. **Validate runtime mọi input** (body/query/header) bằng schema — không chỉ dựa vào type tĩnh của ngôn ngữ.
2. **p95 latency** ≤ ngân sách đã chốt trong `PROJECT.md`, đo bằng tracing/metric thật (không chỉ đo local).
3. **Idempotency key** cho mọi thao tác ghi có thể gọi lại (thanh toán, tạo đơn, gửi thông báo) — gọi lại cùng key không tạo bản ghi trùng.
4. **Rate limit** áp cho endpoint công khai/nhạy cảm (auth, tìm kiếm nặng) — có test xác nhận limit hoạt động.
5. **OpenAPI/schema đồng bộ với code thật** — kiểm tự động (generate từ code hoặc test contract), không để tài liệu lệch code.
6. **Migration có phiên bản, rollback được** — test migration trên bản sao dữ liệu trước khi chạy production.
7. **Health-check endpoint** + **log có cấu trúc** (JSON, có trace id) + **tracing** cho request xuyên service.
8. **Test integration** chạy DB/service phụ thuộc **thật** (qua testcontainers hoặc tương đương) cho luồng quan trọng — không mock toàn bộ tầng dữ liệu.

## C5 — Site nội dung tĩnh / SEO nặng

1. **Lighthouse CI** đạt ngân sách CWV như C1 (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1).
2. **`sitemap.xml` + `robots.txt`** hợp lệ và tự sinh khi thêm trang mới; không quên trang mới trong sitemap.
3. **OG tags + structured data (JSON-LD)** hợp lệ cho mọi trang có nghĩa để chia sẻ/index — kiểm bằng validator (Rich Results Test hoặc tương đương) trước khi coi là xong.
4. **Ngân sách JS** cho trang thuần đọc — không tải framework JS nặng cho nội dung tĩnh không cần tương tác.
5. **Broken link check tự động** trong CI (nội bộ + tối thiểu link ngoài quan trọng) — không phát hiện thủ công.
6. **Header bảo mật** (CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`) kiểm tự động trên bản build/preview.
7. **Form và analytics không gửi PII** khi chưa có đồng ý; script bên thứ ba được liệt kê và có lý do.

## C6 — CLI / Thư viện / SDK

1. **SemVer nghiêm:** phá vỡ API công khai = bump major; ghi rõ trong `CHANGELOG.md` (breaking change mục riêng).
2. **Test snapshot/golden** cho output CLI hoặc API công khai — đổi output có chủ đích thì nêu lý do + diff, không `-u` phản xạ (đúng luật golden test ở `CLAUDE.md` §5).
3. **README có ví dụ chạy được thật** — ví dụ trong tài liệu được test tự động (doctest hoặc test riêng chạy đúng snippet đó), không để ví dụ lỗi thời.
4. **Không thêm dependency runtime mới** mà không cân nhắc kích thước bundle/attack surface — ưu tiên 0-dependency hoặc dependency đã kiểm chứng.
5. **Test trên ma trận phiên bản runtime** đã công bố hỗ trợ (vd 3 phiên bản Node gần nhất) — không chỉ test trên phiên bản dev đang dùng.
6. **Tương thích dữ liệu đã lưu:** file config/cache/định dạng serialize của bản trước đọc được (test bằng fixture của bản cũ), hoặc có migration + thông báo breaking.

## C7 — Data / ML / AI

1. **Tái lập được:** seed cố định + version hóa dữ liệu và model (DVC/MLflow hoặc tương đương) — chạy lại cùng input/config phải ra cùng kết quả (hoặc sai số đã biết).
2. **Data validation** (schema, kiểu, miền giá trị, tỷ lệ null bất thường) chạy trước khi train/serve — dữ liệu không đạt validation thì dừng pipeline, không âm thầm bỏ qua.
3. **Eval set cố định**, so metric với baseline **trước khi** thay model vào production — không tự tin bằng cảm tính là "model mới chắc tốt hơn".
4. **Giám sát drift** dữ liệu đầu vào/đầu ra ở production (cảnh báo khi lệch ngưỡng đã chốt) — không chỉ đánh giá một lần lúc launch.
5. **Không train/serve trên dữ liệu cá nhân chưa ẩn danh hóa** nếu không có sự đồng ý rõ ràng của người dùng (đối chiếu mục "Cổng bổ sung PII" ở đầu file).
6. Nếu xây ứng dụng dùng LLM: chọn **model và nhà cung cấp phù hợp bài toán** theo chất lượng eval, độ trễ, chi phí, quyền riêng tư và khả năng chuyển đổi; xác minh tên model, giới hạn và giá bằng tài liệu chính thức hiện hành. Ghi lựa chọn và phương án dự phòng trong `PROJECT.md`/ADR; không mặc định một nhà cung cấp cho mọi dự án.
7. **"Kill-switch" cho tính năng gọi LLM production:** mọi tính năng gọi LLM ở production phải có một cấu hình có thể **TẮT TỨC THÌ không cần deploy lại** (feature flag/cấu hình DB có cache ngắn — vài chục giây, không phải biến môi trường cần redeploy), dùng khi phát hiện chi phí AI tăng bất thường (bug vòng lặp gọi API, spam, prompt injection gây gọi tool lặp) — đây là cầu dao khẩn cấp **runtime**, khác với việc ước tính/dự báo chi phí lúc dev (`.claude/hooks/usage-guard.sh`/`scripts/usage-estimate.sh` của khung chỉ là dự báo trước, không thay được cầu dao runtime này).
8. **Eval bắt buộc khi đổi prompt/model:** mọi PR đổi system prompt, đổi model, hoặc đổi guardrail của một tính năng AI phải chạy lại một bộ eval offline có **golden fixtures cố định** (input mẫu + kỳ vọng đã chốt) và **dán bảng so sánh với baseline trước đó vào PR** (metric kiểu recall/precision/tỷ lệ đúng, tùy bài toán) — không merge một thay đổi prompt/model mà "cảm tính là chắc tốt hơn" (đối chiếu mục 3 phía trên "Eval set cố định, so metric với baseline trước khi thay model vào production" — mục 8 này áp cùng nguyên tắc đó cho **mọi** thay đổi prompt/model, không chỉ lúc thay model). Tham chiếu mẫu: `docs/framework/templates/AI-EVAL.template.md`.
9. **Đầu ra AI có trạng thái rõ:** người dùng phân biệt được kết quả, lỗi, từ chối và "không chắc"; có ca eval cho từng trạng thái, không trình bày đoán như sự thật.

### Nếu C7 là hệ agent có công cụ hoặc tác vụ chạy dài

Chọn các phép kiểm dưới đây theo rủi ro thật của dự án và ghi đường dẫn test, log hay kịch bản thử vào spec/PR. Đây là các **tiêu chí nghiệm thu của sản phẩm đích**, không phải khẳng định bộ khung đã cung cấp runtime agent. Đối chiếu nguồn và phần đã có: `docs/reports/2026-09-27-agent-frameworks.md`.

1. **Tiếp tục sau gián đoạn:** tạo checkpoint bền trước hoặc sau thao tác có tác dụng phụ; thử dừng tiến trình rồi khởi động lại, xác nhận không mất tác vụ và không lặp thao tác ghi. Nếu không cần chạy dài, ghi lý do không áp dụng.
2. **Quyền công cụ:** công cụ có schema input/output và phạm vi quyền rõ; thử input sai, lệnh ngoài phạm vi, timeout và lỗi công cụ. Chạy code do model sinh trong môi trường cô lập có giới hạn thời gian, file và mạng theo nhu cầu.
3. **Duyệt của người:** thao tác phát hành, xóa, thanh toán hoặc thay đổi dữ liệu nhạy cảm phải chờ quyết định từ nguồn quyền thật; replay không được tự biến lời khai của model thành quyết định đã duyệt.
4. **Quan sát và đánh giá:** liên kết mỗi hành động với run/task ID, model, tool, kết quả, chi phí và trạng thái; bí mật/PII phải được che. Chạy lại ca eval cố định sau khi đổi prompt, model, router hoặc tool; so cùng baseline và ghi số ca chạy thật.
5. **Trí nhớ:** nếu lưu xuyên phiên, phân định lịch sử tác vụ với ký ức có thể truy hồi; kiểm quyền truy cập, sửa/xóa, thời hạn lưu và khả năng truy lại nguồn. Không coi một bản tóm tắt do model viết là bằng chứng đã làm xong việc.
6. **Kết nối ngoài:** chỉ bật server MCP, trình duyệt hoặc agent khác khi cần một tác vụ đã chốt; kiểm danh tính, nguồn dữ liệu không tin cậy, quyền từng công cụ và tình huống mất kết nối. Repo tham chiếu MCP chỉ là ví dụ giáo dục, không mặc định sẵn sàng production.

## C8 — Game

1. **Frame budget** (mặc định tham khảo 60fps, hoặc ngân sách đã chốt) đạt trên **thiết bị mục tiêu thấp nhất** còn hỗ trợ — đo bằng profiler thật, không đo trên máy dev mạnh nhất.
2. **Thời gian tải màn đầu** ≤ ngân sách đã chốt trong `PROJECT.md`.
3. **Kích thước build** ≤ giới hạn nền tảng phân phối (store/web) đã chọn.
4. **Playtest có kịch bản** cho luồng chính (tutorial, gameplay lõi) trước mỗi bản release — không chỉ tự chơi thử ngẫu hứng.
5. **Profiling bắt buộc trước khi tối ưu hiệu năng** — không đoán bottleneck rồi sửa mò.
6. **Game online: server-authoritative** cho trạng thái ảnh hưởng tới người khác (điểm, vật phẩm, tiền ảo) — client chỉ gửi ý định; có test gửi dữ liệu giả từ client.
7. **Save-game tương thích:** test nạp save của bản phát hành trước trước mỗi release.

## C9 — Blockchain / Web3

1. **Audit bảo mật độc lập bắt buộc trước khi lên mainnet** — không lấy việc AI/đội tự rà làm thay thế cho audit độc lập.
2. **Test coverage cao cho contract + fuzzing** (slither/echidna hoặc tương đương) — vì lỗi không sửa được sau khi deploy (bất biến), cổng test ở đây **cứng hơn** mức thường của khung.
3. **Không có hàm rút quỹ/mint không kiểm soát** — mọi hàm ảnh hưởng tới quỹ/nguồn cung phải có kiểm soát quyền (access control) rà kỹ, có test riêng cho từng đường tấn công đã biết (reentrancy, overflow, front-running…).
4. **Chạy đủ lâu trên testnet** trước mainnet; có kế hoạch pause/upgrade (nếu kiến trúc contract cho phép) khi phát hiện sự cố sau deploy.
5. **Private key/secret không bao giờ nằm trong code/log/lịch sử git** — kể cả key ví test dùng nội bộ.
6. **UX giao dịch:** trước khi ký hiển thị rõ hành động, số tiền, phí và mạng; có trạng thái pending/thất bại/bị từ chối, không treo vô hạn.
7. **Upgrade giữ storage layout:** test nâng contract proxy giữ nguyên dữ liệu đã lưu (storage layout check tự động).

## C10 — Monorepo đa thành phần

1. **Build/test chỉ phần bị ảnh hưởng** (affected) + cache — không chạy lại toàn repo cho mỗi thay đổi nhỏ.
2. **Không import vòng** giữa packages; ràng buộc biên (ai được import ai) kiểm tự động bằng lint/dependency-cruiser hoặc tương đương, không chỉ dựa vào quy ước bằng lời.
3. **Mỗi `apps/*`/`packages/*` áp đúng cổng của hồ sơ tương ứng** (C1–C9 ở trên) — monorepo không tự sinh ra cổng riêng, nó tổng hợp cổng của các thành phần con.
4. **Versioning nội bộ rõ ràng** (independent hay fixed/lockstep) — quyết định ghi trong ADR, không để mỗi package tự phát minh cách versioning riêng.
5. **Contract test cho kiểu/schema dùng chung:** đổi package dùng chung thì chạy test của mọi app/package phụ thuộc (affected), không chỉ của package bị sửa.

---

## Ma trận bằng chứng theo hồ sơ (AC-6)

Mỗi ô nêu **cái gì chứng minh** chiều đó và loại bằng chứng (test, job CI, báo cáo). Tham chiếu:
`§Cn.k` = mục k của hồ sơ Cn ở file này · `§PII.k` = mục k của phần dữ liệu cá nhân · `§RB-Cn` = dòng Cn
của bảng rollback · `CLAUDE §3.k` = mục k của `CLAUDE.md` §3. Dự án tự chốt số ngân sách; ma trận chỉ nói
phải chứng minh gì. Bằng chứng ghi vào bảng AC → bằng chứng của spec (§16 `FEATURE-SPEC.template.md`) hoặc mô tả PR.

| Hồ sơ | Hành vi | UX/DX | Dữ liệu | Bảo mật | Release |
| --- | --- | --- | --- | --- | --- |
| C1 | §C1.1 — E2E luồng chính + tải/rỗng/lỗi xanh trên CI | CLAUDE §3.8, CLAUDE §3.9 — báo cáo axe + Lighthouse CI đạt ngân sách | §C1.2, §PII.3 — test phân quyền âm tính, test xoá dữ liệu theo yêu cầu | CLAUDE §3.2 — test quyền phía server, không tin client | §RB-C1, `docs/ops/release-readiness.md` — promote bản trước đã diễn tập |
| C2 | §C2.7, §C2.8 — E2E thiết bị cả iOS + Android | §C2.4, §C2.2, §C2.1 — kiểm TalkBack/VoiceOver, đo fps và cold start | §C2.6, §PII.1 — test offline/đồng bộ lại, rà trường thu thập | §C2.5, §PII.5 — rà permission đúng lúc dùng, dữ liệu nhạy cảm mã hoá | §RB-C2 — staged rollout + feature flag server đã thử |
| C3 | §C3.5 — test trên mọi OS mục tiêu | §C3.6, §C3.4 — kiểm bàn phím/trình đọc màn hình, đo thời gian khởi động | §C3.7 — test mở dữ liệu bản trước, backup trước nâng | §C3.3, §C3.2 — rà quyền hệ thống, test xác minh chữ ký bản cập nhật | §C3.1, §RB-C3 — bản đã ký/notarize, thử kênh cập nhật về bản trước |
| C4 | §C4.8 — test integration với DB/service thật | §C4.5 — test contract OpenAPI khớp code | §C4.6, §C4.3 — migration trên bản sao dữ liệu, test idempotency key | §C4.1, §C4.4 — test input sai schema, test rate limit | §C4.7, §RB-C4 — health-check + smoke sau deploy, canary hạ được về 0% |
| C5 | §C5.5, §C5.2 — broken link check + sitemap tự sinh trên CI | §C5.1, §C5.4 — Lighthouse CI + ngân sách JS | §C5.7, §C5.3 — rà form/analytics không gửi PII, validator structured data | §C5.6 — kiểm header bảo mật tự động | §RB-C5 — publish lại build trước đã thử |
| C6 | §C6.2, §C6.5 — golden test trên ma trận runtime | §C6.3 — ví dụ README chạy tự động | §C6.6 — test đọc fixture của bản cũ | §C6.4 — rà dependency runtime mới + quét lỗ hổng | §C6.1, §RB-C6 — SemVer + CHANGELOG, kế hoạch bản vá/deprecate |
| C7 | §C7.3, §C7.8 — eval cố định so baseline, bảng so sánh trong PR | §C7.9 — ca eval cho lỗi/từ chối/không chắc | §C7.2, §C7.5, §C7.1 — data validation chặn pipeline, version dữ liệu | §C7.7, §PII.4 — thử kill-switch, dữ liệu đã ẩn danh hoá | §C7.4, §RB-C7 — giám sát drift, trỏ lại model version trước |
| C8 | §C8.4 — playtest có kịch bản cho luồng chính | §C8.1, §C8.2 — profiler trên thiết bị thấp nhất, đo thời gian tải | §C8.7 — test nạp save bản trước | §C8.6 — test client gửi dữ liệu giả bị server từ chối | §C8.3, §RB-C8 — kích thước build đạt giới hạn, live-ops config tách binary |
| C9 | §C9.2 — coverage + fuzzing contract | §C9.6 — kiểm màn xác nhận và trạng thái pending/thất bại | §C9.7 — test upgrade giữ storage layout | §C9.1, §C9.3 — audit độc lập, test từng đường tấn công | §C9.4, §RB-C9 — testnet đủ lâu, pause/upgrade đã audit |
| C10 | §C10.1, §C10.3 — test affected theo hồ sơ từng thành phần | §C10.2 — lint biên import tự động | §C10.5 — contract test cho schema dùng chung | §C10.3, §PII.6 — cổng bảo mật của từng thành phần, log không PII | §C10.4, §RB-C10 — ADR versioning, rollback theo từng app |

### Độ sâu bằng chứng theo mức rủi ro

Mức S/M/L chọn theo rủi ro của thay đổi (`docs/framework/standard-delivery.md`). Sàn chất lượng như nhau;
mức chỉ quyết định chứng minh **những chiều nào** và **ghi ở đâu**.

| Mức | Chiều phải chứng minh | Độ sâu bằng chứng | Nơi ghi |
| --- | --- | --- | --- |
| S | Chỉ chiều bị chạm, theo ô tương ứng của ma trận | Test tái hiện đỏ trước khi sửa (CLAUDE §3.6) + gate xanh | Mô tả PR — `.github/pull_request_template.md` |
| M | Mọi chiều bị chạm, theo ma trận | Mỗi AC map tới test/job có thật (CLAUDE §3.6) | Bảng AC → bằng chứng — `docs/framework/templates/FEATURE-SPEC.template.md` |
| L | Đủ 5 chiều; chiều không đổi ghi "không đổi — lý do" | Thêm checklist phát hành + rollback đã diễn tập theo §RB-C1..C10 của hồ sơ (vd §RB-C4) | Spec + goal — `docs/ops/release-readiness.md` |

---

## Khi dự án chưa khớp hồ sơ nào (embedded/IoT, AR/VR, …)

Không coi là "ngoài khả năng của khung" — áp đúng **phương pháp** ở PHẦN A–B của
`03-tech-selection-and-proactive-advice.md` (research-first, cân bằng phổ biến↔năng lực, xác minh phiên
bản) để tự dựng cổng chất lượng đặc thù mới, rồi **ghi ADR** — không chờ file này liệt kê sẵn mới làm.


---

## Rollback theo hồ sơ (điền vào `release-readiness.md`/runbook sự cố của dự án đích)

Rollback web ≠ rollback mobile — checklist chung "rollback được" không đủ (audit 2026-09-23, T18).

| Hồ sơ | Cơ chế rollback thật | Điều kiện tiên quyết phải có TRƯỚC khi release |
| --- | --- | --- |
| C1 Web | Promote bản deploy trước (Vercel/Netlify), hoặc tag ảnh container trước | mỗi release một tag/ảnh bất biến; migration DB tương thích ngược (expand → migrate → contract) |
| C2 Mobile native | **Không rollback được bản đã phát hành** — chỉ hotfix / dừng staged rollout / remote config tắt tính năng | staged rollout bật; feature flag phía server cho tính năng rủi ro; thời gian review store tính vào kế hoạch |
| C3 Desktop | Kênh cập nhật trỏ về bản trước + giữ installer cũ | auto-updater có kênh/phiên bản ghim; dữ liệu cục bộ có migration lùi hoặc backup trước khi nâng |
| C4 Backend/API | Deploy lại ảnh trước; blue/green hoặc canary hạ về 0% | API tương thích ngược ≥ 1 phiên bản; migration DB tách khỏi deploy code; job idempotent |
| C5 Site tĩnh | Publish lại build trước | giữ ≥ N build artifact |
| C6 CLI/thư viện/SDK | Không thu hồi được bản đã tải — phát hành bản vá + deprecate (yank chỉ chặn cài mới) | SemVer đúng; changelog; kiểm tương thích trước khi tag |
| C7 Data/ML | Trỏ lại model/dataset version trước (registry) | mọi artifact có version + lineage; pipeline chạy lại được từ input bất biến |
| C8 Game | Hotfix qua patch/live-ops config; console: chu kỳ cert dài → flag server | live-ops config tách khỏi binary; save-game tương thích ngược |
| C9 Blockchain | **Không rollback on-chain** — proxy upgrade/pause/kill-switch đã audit | contract có pause + upgrade path được audit; migration state có kịch bản |
| C10 Monorepo | theo từng `apps/*` như hồ sơ tương ứng; không rollback lockstep nếu versioning độc lập | ADR ghi chiến lược versioning |
