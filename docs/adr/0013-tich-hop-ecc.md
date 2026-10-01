# ADR-0013: Tích hợp ECC (Everything Claude Code) bằng VENDOR có ghim + lớp thích nghi XBoss, không cài plugin

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-10-01
- **Nối tiếp:** cấu hình 3 tầng trong `CLAUDE.md` ("Lập kế hoạch → điều phối → thi hành"), `docs/audit.md`,
  ADR-0012 (luật review AI theo đường dẫn — `.opencodereview/`)
- **Nguồn upstream:** [`affaan-m/ECC`](https://github.com/affaan-m/ECC) v2.2.2 @ `c70874f`, giấy phép MIT

## Bối cảnh

Người dùng yêu cầu nghiên cứu ECC — bộ "agent harness" mã nguồn mở phổ biến nhất cho Claude Code
(~214k sao GitHub tháng 6/2026; tác giả thắng hackathon Anthropic × Cerebral Valley 2/2026) — rồi
**tích hợp tối đa, chấp nhận nặng**. ECC 2.2.2 gồm 68 agent, 293 skill, 94 command, rules theo
ngôn ngữ, hook runtime (Node, chạy ở mọi tool call: config-protection, GateGuard, strategic
compact, tóm tắt phiên, continuous learning…), AgentShield, cài qua plugin `ecc@ecc` hoặc
`npx ecc-universal`. Ý tưởng lõi: _plan → test → implement → review → verify → remember → improve_,
"tối ưu cửa sổ ngữ cảnh, lưu bền mọi thứ còn lại".

Ràng buộc thực tế của XBoss:

1. **Phiên làm việc chủ yếu chạy trên cloud (claude.ai/code).** Tài liệu Claude Code ghi rõ phiên
   cloud **không nạp plugin** được bật qua `.claude/settings.json` của repo (chỉ server-managed
   settings). Cài plugin = ECC vắng mặt đúng ở nơi người dùng làm việc.
2. Container cloud bị thu hồi → mọi trí nhớ ECC ghi vào `~/.claude/` (session-data, instincts) mất.
3. XBoss đã có cấu hình riêng sâu hơn chỗ ECC chạm tới: luồng 3 tầng + bảng `route:`, 7 agent,
   17 cổng CI tĩnh, `docs/audit.md`, TRAPS.md, ADR. Nhiều chỉ dẫn chung của ECC **trái** quy ước
   XBoss (Jest/Vitest, coverage 80% cứng, ORM/Supabase, envelope API, "tự gọi planner không cần hỏi").
4. Phê bình phổ biến về ECC: phình ngữ cảnh và chỉ dẫn chồng chéo làm hành vi agent khó đoán.

## Quyết định

1. **Vendor** (chép có ghim commit) phần ECC liên quan stack Next.js/TS/Postgres/PWA vào `.claude/`:
   24 agent, 56 skill, 19 command, 22 file rules (`common` + `typescript`/`web`/`react` theo `paths`).
   Nguồn sự thật: `.claude/ecc/manifest.json`; sinh bằng `scripts/ecc-vendor.ts` (chỉ đọc markdown,
   không chạy mã ECC); khoá sha256 trong `.claude/ecc/lock.json`, test `tests/ecc-vendor.test.ts`
   chặn sửa tay. Biến đổi tối thiểu: tiền tố `ecc-`, mô tả `(ECC)`, gỡ cụm "use PROACTIVELY / MUST
   BE USED / automatically activated" khỏi agent, `ecc:x` → `ecc-x`, 1 dòng ghi nguồn.
2. **Không vendor mã thực thi** (hook runtime JS, script của skill). Hành vi giá trị của hook ECC
   được **viết lại bằng bash + test** theo luật XBoss: `protect-config.sh` (config-protection + chặn
   sửa migration đã áp + chặn sửa tay vendor), `risk-zone-gate.sh` (GateGuard thu hẹp vào vùng rủi ro
   `docs/audit.md` §8), `pre-push-gate.sh` (PROGRESS.md + trùng số migration, cùng script với CI),
   `stop-static-checks.sh` (prettier/eslint/cổng `check:*` theo file đổi trước khi dừng lượt).
3. **Lớp thích nghi XBoss**: `.claude/rules/00-uu-tien-ecc.md` (XBoss thắng khi mâu thuẫn, liệt kê
   15 điểm ghi đè đã chốt); rules path-scoped `.claude/rules/xboss/*` (migrations, API, UI, test,
   tiến độ-nghiệm thu, tài chính); 3 agent audit theo 3 trụ `docs/audit.md` (`audit-bao-mat`,
   `audit-logic`, `audit-ui`); skill `/gate` (verification-loop đọc thẳng job `static` của `ci.yml`),
   `/hoc` (continuous learning ghi vào repo), `/ecc` (hướng dẫn); coordinator thêm hợp đồng hoàn tất
   khi uỷ thác, truy hồi lặp ≤3 vòng, review đa góc nhìn song song.
4. Agent `ecc-*` là **chuyên gia bổ trợ**, gọi theo mục "Định tuyến ECC" của `CLAUDE.md`; luồng 3
   tầng giữ nguyên quyền quyết định ai làm gì.

## Lý do

- Vendor là cách **duy nhất** để ECC có mặt ở phiên cloud; ghim commit + lock biến việc lên phiên
  bản thành một diff đọc được (nội dung vendor là chỉ dẫn cho agent — phải đọc như đọc code).
- Hook là lớp **thi hành thật** (CLAUDE.md, tài liệu Claude Code: "CLAUDE.md là ngữ cảnh, không phải
  cấu hình cưỡng chế"). Các luật XBoss trước đây chỉ là văn bản (migration append-only, vùng rủi ro
  §8, PROGRESS.md trước push) nay có cổng; chạy lại chính script CI nên không có luật thứ hai để trôi.
- Không chạy mã JS bên thứ ba ở mọi tool call: bề mặt chuỗi cung ứng nhỏ hơn, hành vi kiểm được bằng test.
- Lớp ưu tiên giải quyết vấn đề chỉ dẫn chồng chéo — phê bình chính về ECC — ở một chỗ duy nhất.

## Các phương án đã cân nhắc

- **Bật plugin `ecc@ecc` ở cấp dự án**: một dòng cấu hình, tự cập nhật — nhưng không có mặt ở phiên
  cloud, chạy hook runtime Node ở mọi tool call, và trùng lặp nếu kết hợp vendor. Loại.
- **Vendor toàn bộ 293 skill / 68 agent**: "tối đa" theo nghĩa đen nhưng ~237 skill thuộc ngôn
  ngữ/miền không dùng (Go/Rust/Django/healthcare/homelab/crypto/video…) — chỉ thêm nhiễu cho bộ
  chọn skill và tốn ngữ cảnh mô tả. Loại; manifest cho phép thêm từng mục khi cần.
- **Chỉ mượn ý tưởng, tự viết lại hết bằng tiếng Việt**: hợp quy ước nhất nhưng mất phần lớn kho kiến
  thức ECC và không theo kịp upstream. Dùng cho phần **thi hành** (hook, agent audit), không cho kho tri thức.

## Hệ quả

- Tích cực: 99 thành phần ECC dùng được ở mọi phiên (cloud lẫn local); 4 hook mới có test; `/gate`
  khớp CI theo định nghĩa; luật trước đây chỉ là văn bản nay được thi hành.
- Đánh đổi:
  - Ngữ cảnh mỗi phiên tăng: 8 file `rules/ecc/common` (~480 dòng) + mô tả ~100 agent/skill/command.
    Theo dõi bằng `/ecc-context-budget`; gỡ bớt qua manifest nếu đo thấy ảnh hưởng.
  - Hook Stop thêm vài giây mỗi lượt có file đổi (chỉ chạy cổng liên quan, bỏ qua khi nội dung y hệt lần xanh trước).
  - `risk-zone-gate` chặn lần sửa đầu mỗi phiên ở vùng §8 — cố ý, đổi lấy việc nêu bất biến trước khi sửa.
  - Sửa file cấu hình cổng (`eslint.config.mjs`, `ci.yml`, `.claude/settings.json`, `.claude/hooks/*`…)
    nay luôn hỏi người dùng.
- Quan hệ với ADR-0012: cả `.opencodereview/rules/*` lẫn `.claude/rules/xboss/*` đúc từ
  `docs/audit.md`. Bên OCR là luật **lúc review**; bên này là checklist **lúc viết code**, tự nạp khi
  Claude đọc file khớp `paths`. Đổi checklist §3–§7 thì cập nhật cả hai.
- Việc tiếp theo: lên phiên bản ECC theo quy trình trong skill `/ecc`; cân nhắc rút gọn `CLAUDE.md`
  (tài liệu Claude Code khuyến nghị < 200 dòng) bằng cách chuyển các mục chỉ đúng cho một vùng file
  sang `.claude/rules/xboss/*` — cần người dùng duyệt, chưa làm trong đợt này.
