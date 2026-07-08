# Cấu hình phân tầng model (Claude Code)

Tài liệu này mô tả cơ chế phân việc theo tầng model đang dùng trong repo này, để có thể **copy sang repo khác** một cách nhanh gọn. Đây là tính năng của Claude Code CLI (không phải code của XBoss) — hoạt động qua 2 loại file: `.claude/settings.json` (cấu hình phiên chính) và `.claude/agents/*.md` (định nghĩa subagent tuỳ biến).

## 1. Ý tưởng

4 tầng, phân theo độ khó của việc — mục tiêu: chỉ dùng model đắt/chậm (Opus) cho việc thật sự cần phán đoán, còn lại đẩy xuống model rẻ/nhanh hơn:

| Tầng | Model | Vai trò |
| --- | --- | --- |
| Phiên chính | Opus (`opusplan`, effort medium) | Lập kế hoạch, thiết kế, quyết định kiến trúc, viết đặc tả chi tiết — **không tự code** trừ task quá nhỏ (1-2 dòng) |
| `coder` (subagent) | Sonnet | Code theo đặc tả đã có, fix lỗi, viết test, script theo mẫu, refactor phạm vi rõ, verify tính năng thật, xử lý review comment cụ thể |
| `reviewer` (subagent) | Sonnet | Tự soát diff bằng skill `code-review` sau khi `coder`/`mechanical` code xong, trước khi Opus duyệt cuối |
| `mechanical` (subagent) | Haiku | Việc lặp lại, ít cần phán đoán: sửa lint/typecheck theo thông báo có sẵn, đổi tên hàng loạt, CRUD/route bám mẫu có sẵn |

Phiên chính gọi các subagent qua tool `Agent` (không phải helper riêng của XBoss — đây là cơ chế chuẩn của Claude Code).

## 2. File cần copy

```
.claude/settings.json       # model, effort, fallback, permission allowlist
.claude/agents/coder.md     # subagent Sonnet
.claude/agents/reviewer.md  # subagent Sonnet
.claude/agents/mechanical.md # subagent Haiku
```

Không thể gom vào 1 file — Claude Code chỉ cho định nghĩa subagent tuỳ biến qua file `.md` riêng trong `.claude/agents/`, mỗi file có frontmatter (`name`, `description`, `tools`, `model`) + system prompt riêng ở phần thân. `settings.json` không có trường nào để khai báo subagent inline.

## 3. Template `settings.json`

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "opusplan",
  "effortLevel": "medium",
  "fallbackModel": ["opus"],
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run typecheck)",
      "Bash(npm test)",
      "Bash(npm run build)"
    ]
  }
}
```

Khi copy sang repo khác, **sửa `permissions.allow`** cho khớp lệnh thật của repo đó (khác package manager thì đổi `npm` → `yarn`/`pnpm`; khác tên script thì đổi theo `package.json` repo đích). Đây là bước hay bị quên nhất — allowlist sai lệnh thì subagent vẫn bị hỏi xác nhận mỗi lần chạy.

## 4. Template file agent (`.claude/agents/*.md`)

Cấu trúc chung mọi subagent:

```markdown
---
name: <tên-subagent>              # dùng làm subagent_type khi gọi tool Agent
description: <khi nào dùng, khi nào KHÔNG dùng — Agent tool đọc field này để chọn agent>
tools: Read, Edit, Write, Grep, Glob, Bash   # thêm/bớt tuỳ nhu cầu; thêm "Skill" nếu subagent cần invoke skill
model: sonnet   # hoặc haiku / opus / fable
---

<system prompt của subagent — quy tắc bắt buộc riêng của repo, viết như CLAUDE.md thu nhỏ>
```

Nội dung 3 file hiện có trong repo này (`coder.md`, `mechanical.md`, `reviewer.md`) là ví dụ đầy đủ, nhưng phần "Quy tắc bắt buộc" bên trong **gắn chặt với quy ước XBoss** (SQL qua `lib/db`, migration `migrations/000N_*.sql`, auth `getCurrentUser()`, hệ màu `zinc`, tiếng Việt...). Khi copy sang repo khác, **giữ nguyên phần frontmatter + cấu trúc**, nhưng viết lại phần "Quy tắc bắt buộc" theo quy ước thật của repo đích — tốt nhất là đọc `CLAUDE.md`/`README.md` của repo đó trước rồi tóm tắt lại đúng những điều bắt buộc (auth pattern, DB layer, style code, ngôn ngữ commit/comment, cách chạy test...).

## 5. Các bước áp dụng vào repo mới

1. Copy 4 file ở mục 2 vào repo đích (`.claude/settings.json` + `.claude/agents/*.md`).
2. Đọc `CLAUDE.md`/tài liệu quy ước của repo đích, sửa lại "Quy tắc bắt buộc" trong từng agent `.md` cho khớp (đừng để sót quy ước XBoss còn sót trong file copy).
3. Sửa `permissions.allow` trong `settings.json` khớp lệnh lint/typecheck/test/build thật của repo đích.
4. Thêm 1 bullet ngắn vào `CLAUDE.md` (hay tương đương) của repo đích ở mục nguyên tắc làm việc, kiểu:
   > **Uỷ thác theo độ khó**: phiên chính không tự code — viết đặc tả rồi giao `coder`/`mechanical`/`reviewer` qua tool Agent.
   Nếu không có bullet này, phiên chính (Opus) có thể vẫn tự code thay vì chủ động gọi subagent — model không tự biết cơ chế phân tầng nếu không được nhắc trong CLAUDE.md.
5. Mở phiên mới trong repo đích, thử gọi 1 task nhỏ qua từng subagent (`Agent({ subagent_type: "coder", ... })`) để xác nhận model/tool hoạt động đúng trước khi tin tưởng dùng thật.

## 6. Lưu ý / giới hạn

- `.claude/settings.local.json` (không commit) hoặc cờ `--model` khi mở CLI sẽ **đè lên** `settings.json` — nếu thấy model không đúng như cấu hình, kiểm tra 2 chỗ này trước.
- `fallbackModel` áp cho toàn tiến trình CLI, không set riêng theo từng subagent được.
- Model dùng cho `effortLevel`/`opusplan` cần đủ mới hỗ trợ effort levels; nếu tổ chức giới hạn `availableModels` qua managed settings, cấu hình này có thể bị chặn — kiểm tra managed settings trước khi debug.
- Subagent chỉ có đúng các `tools` khai báo trong frontmatter — thiếu tool nào thì subagent không gọi được (vd cần `WebFetch` thì phải thêm vào field `tools`).
