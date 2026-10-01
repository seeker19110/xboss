# ADR-0012: Review AI theo luật gắn đường dẫn bằng OpenCodeReview (OCR)

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-10-01
- **Nối tiếp:** `docs/audit.md` (checklist audit), `TRAPS.md` (bẫy đã mắc thật)
- **Công cụ:** [alibaba/open-code-review](https://github.com/alibaba/open-code-review) — CLI `ocr`, Apache-2.0, ghim bản `1.12.11`

## Bối cảnh

XBoss đã có nhiều lớp soát code: cổng tĩnh trong CI (`check:route-perms`, `check:project-scope`,
`check:db-params`, `check:lib-layers`...), lệnh `/review` + agent `reviewer` gọi skill
`code-review` của Claude Code, Copilot review tự xin trong `pr-policy.yml`. Nhưng tri thức đặc thù
dự án — vùng rủi ro cao `docs/audit.md` §8, các lớp lỗi lặp lại trong §3–§7 và `TRAPS.md` — chỉ
nằm trong tài liệu dạng văn xuôi. Reviewer AI đọc diff **không biết** rằng file
`lib/tien-do/recompute.ts` phải soi làm tròn %/`FOR UPDATE`, hay route tài chính cấm tính tiền
trên float JS — trừ khi phiên đó tình cờ đọc đúng mục tài liệu. Kết quả review phụ thuộc trí nhớ
của phiên, khó lặp lại.

OCR tách review thành hai phần: phần **tất định** (chọn file nào cần review, áp luật theo glob
đường dẫn từ `.opencodereview/rule.json`, chia nhóm file) do CLI làm; phần **đọc hiểu** do LLM làm.
Nó có hai chế độ chạy: `ocr review` (OCR tự gọi LLM — cần API key) và `ocr delegate` (OCR chỉ xuất
danh sách file + luật, agent chủ — Claude Code — tự review, không cần key).

Đặc điểm của OCR đã kiểm chứng bằng đọc mã nguồn (`internal/config/rules/system_rules.go`) và
chạy thử trên repo:

- Luật **khớp đầu tiên thắng**: một file chỉ nhận đúng một mục luật dự án; hai mục của dự án
  không được gộp với nhau (`merge_system_rule` chỉ gộp với luật hệ thống có sẵn của OCR).
- Đường dẫn và glob đều hạ chữ thường trước khi so; chỉ cặp `{a,b}` **đầu tiên** được tách, nên
  brace lồng nhau sẽ hỏng.
- Mặc định OCR **bỏ qua** `*.test.ts`/`*.spec.ts` — phải khai `include` để review được test.
- OCR tôn trọng `.gitignore` kể cả với file đã track. `.gitignore` từng bỏ cả `.claude/` khiến
  hook/`settings.json` vô hình với OCR (và lint-staged không stage lại được file trong đó) — đã thu
  hẹp còn `.claude/worktrees/` + `.claude/settings.local.json`.
- OCR không review Markdown (`unsupported_ext`): lệnh/agent `.claude/**/*.md`, `docs/`, mảnh luật
  đều bị loại — phải tự soát.
- GitHub Action của OCR tự checkout không kèm `ref:`; với trigger `pull_request` đó là **merge
  ref của PR**, nên `.opencodereview/rule.json` của chính PR được dùng (comment "checkout the
  trusted base" trong `action.yml` chỉ đúng với `pull_request_target`). _Sửa 2026-10-01 sau
  review: bản đầu của ADR này ghi nhầm là luật lấy từ `main`._

## Quyết định

1. **Đúc `docs/audit.md` + `TRAPS.md` thành luật review máy đọc được, gắn theo đường dẫn.**
   Nguồn sự thật là các mảnh Markdown `.opencodereview/rules/*.md` (mỗi mảnh một checklist: route
   API, tiến độ, nghiệm thu, tài chính, migration, giao diện...) + `manifest.json` khai thứ tự mục
   luật và mỗi mục ghép những mảnh nào. Lệnh `npm run gen:ocr-rules` ghép ra
   `.opencodereview/rule.json` (file sinh, không sửa tay, nằm trong `.prettierignore`). Ghép
   mảnh giải quyết giới hạn "khớp đầu tiên": route tài chính nhận **cả** checklist tài chính
   **lẫn** checklist route API chung mà không chép tay nội dung.
2. **Claude Code dùng chế độ delegation** (không cần API key, dùng gói Claude sẵn có): lệnh
   `/ocr-review`, bước trong `/review` và agent `reviewer` gọi `ocr delegate preview` +
   `ocr delegate rule` để lấy đúng checklist cho từng file trong diff rồi tự review theo đó, song
   song với skill `code-review`.
3. **CI chạy `ocr review` trên mỗi PR, chỉ góp ý** (workflow `ocr-review.yml`): comment inline +
   tóm tắt bằng tiếng Việt, job luôn xanh, tự bỏ qua khi chưa cấu hình secret LLM. Không làm cổng
   chặn vì review LLM không tất định và OCR chủ đích đổi recall lấy precision.
4. **Ghim phiên bản** OCR `1.12.11` (script `npm run ocr` và input `ocr_version` của workflow) +
   ghim action theo SHA đầy đủ; test `tests/ocr-rules.test.ts` canh hai chỗ ghim khớp nhau.
5. **Test tất định canh bộ luật** (`tests/ocr-rules.test.ts`, chạy trong `npm test`): `rule.json`
   khớp đúng bản sinh từ manifest; mọi đường dẫn vùng rủi ro cao giải ra **đúng** mục luật đã
   định (giả lập ngữ nghĩa khớp-đầu-tiên/chữ-thường/brace của OCR); mọi đường dẫn literal trong
   manifest còn tồn tại (đổi tên file/thư mục mà quên luật → đỏ).

## Lý do

- Biến checklist văn xuôi thành **đầu vào bắt buộc** của mọi lượt review AI (Claude cục bộ lẫn
  CI), không còn phụ thuộc phiên nào nhớ đọc `docs/audit.md`.
- Luật gắn theo đường dẫn giữ ngữ cảnh gọn: file UI chỉ nhận checklist UI, file tài chính chỉ
  nhận checklist tài chính — ít nhiễu hơn nhồi cả `docs/audit.md` vào prompt.
- Delegation mode không phát sinh chi phí; CI là tuỳ chọn có công tắc (secret) nên hợp nhất
  dần được mà không chặn quy trình "merge ngay khi CI xanh".
- Bổ sung, không thay thế: cổng tĩnh (`check:*`) vẫn là chốt chặn cứng cho những gì regex/AST bắt
  được; OCR phủ phần cần đọc hiểu (race, idempotency, sai làm tròn, thiếu scope ở logic phức tạp).

## Các phương án đã cân nhắc

- **Chỉ dùng skill `code-review` của Claude Code như cũ**: không có cơ chế gắn checklist theo file;
  chất lượng dao động theo prompt — đúng điểm yếu OCR nhắm vào.
- **Viết luật thẳng trong `rule.json`, mỗi mục tự đủ**: phải chép checklist route API vào ≥8 mục
  (giới hạn khớp-đầu-tiên) → lệch nhau theo thời gian; sửa chuỗi JSON có `\n` dài rất khó review.
- **Trỏ `rule` tới file `.md`** (OCR hỗ trợ): tránh được JSON dài nhưng vẫn một mục = một file,
  không ghép được nhiều checklist cho một mục.
- **Làm CI thành cổng chặn khi có phát hiện mức cao**: bị loại — LLM có thể báo sai, với quy ước
  merge-khi-xanh sẽ chặn PR vô cớ; phát hiện vẫn được xử lý như bot review khác (xác minh → sửa
  hoặc trả lời lý do).
- **Thêm OCR vào `devDependencies`**: tăng thời gian `npm ci` ở mọi job CI và bề mặt `npm audit`
  cho một công cụ chỉ dùng lúc review → chọn `npx` với phiên bản ghim.

## Hệ quả

- Tích cực: một nguồn luật review dùng chung cho Claude Code và CI; vùng rủi ro cao luôn được
  soát đúng checklist; luật được test canh như code.
- Đánh đổi: phải giữ mảnh luật đồng bộ với `docs/audit.md` — **sửa checklist audit thì sửa mảnh
  tương ứng** + `npm run gen:ocr-rules`. Thêm file/thư mục mới ở vùng rủi ro cao thì thêm mẫu vào
  bảng kiểm trong `tests/ocr-rules.test.ts`.
- Đánh đổi: PR sửa `.opencodereview/` được review bằng chính luật đã sửa (action đọc luật từ merge
  ref của PR). Chấp nhận được vì job chỉ góp ý, không phải cổng bảo mật; không chuyển sang
  `pull_request_target` để khỏi cấp secret LLM cho PR từ fork.
- Đánh đổi: Markdown không được OCR review — lệnh/agent `.claude/**/*.md` (chỉ dẫn thực thi cho
  agent) do `/ocr-review` và agent `reviewer` tự soát theo quy ước `CLAUDE.md`.
- `ocr` cần mạng lần đầu (`npx` tải gói + binary); mất mạng thì đối chiếu thủ công
  `manifest.json` theo thứ tự (lệnh `/ocr-review` có hướng dẫn dự phòng).
- **[Người dùng]** Bật CI: thêm secret `OCR_LLM_URL` (vd `https://api.anthropic.com`),
  `OCR_LLM_AUTH_TOKEN`, biến `OCR_LLM_MODEL` (và `OCR_LLM_USE_ANTHROPIC=false` nếu dùng nhà cung
  cấp tương thích OpenAI) trong Settings → Secrets and variables → Actions. Chưa thêm thì job
  tự bỏ qua, không đỏ.
