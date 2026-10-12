---
description: Làm tới xong, tự quyết thay chủ repo — lập kế hoạch → thực thi từng PR tới merge → hoàn thiện (audit → hội tụ → Definition of Complete) trong một lượt; mọi cổng phê duyệt (kể cả viết/duyệt đặc tả M/L) do phiên chính tự duyệt theo thang ưu tiên, ghi từng quyết định vào hồ sơ; chỉ dừng ở danh sách "không bao giờ tự quyết" hoặc Blocked/Waiting
argument-hint: "[mục tiêu — bỏ trống = hoàn thiện dự án theo lộ trình + sổ nợ]"
---

> 💡 Port XBoss của `/auto-complete` trong `projects-template` @ `59bd1d1` (ADR-0015). Bản khung nối `/auto` +
> `/completion` trên `docs/work/`, `dev-task.sh`, engine Python — XBoss không lấy các thứ đó; lệnh này chạy cùng
> chuỗi trên artifact sẵn có của XBoss. Model: mặc định Sonnet; pha lập kế hoạch/đặc tả mức L thì `/model` lên
> model cao cấp nhất đang có rồi quay lại (`CLAUDE.md` mục "Quy trình theo mức rủi ro").

Mục tiêu lượt này: **$ARGUMENTS** (trống → "hoàn thiện dự án": phần nợ **làm được bằng code** trong lộ trình
`docs/ops/lo-trinh-hoan-thien-*.md` mới nhất §0 + issue sổ nợ #572).

Bạn là **người quyết định thay chủ repo** cho toàn bộ lượt này (ủy quyền 2026-10-12, ADR-0015). Ngoại lệ này
**thay** LUẬT CỨNG "thiếu đặc tả thì HỎI" của `CLAUDE.md` **chỉ trong lượt `/auto-complete`**: thiếu đặc tả thì tự
viết, tự duyệt, ghi giả định. Mọi cổng máy và sàn chất lượng còn lại **giữ nguyên**.

## Hồ sơ lượt (nguồn sự thật để nối tiếp — thay `docs/work/<id>/working.md` của khung)

Tạo `docs/nang-cap/auto/<YYYY-MM-DD>-<slug>.md` (đã có hồ sơ cùng mục tiêu còn `Active`/`Blocked`/`Waiting` →
nối tiếp đúng mục "Bàn giao", không lập lại kế hoạch):

```markdown
# /auto-complete <YYYY-MM-DD>-<slug> — <mục tiêu>

- Trạng thái: Active
- Bắt đầu: <ngày> · base `origin/main` <sha>
- Phạm vi: <làm gì · KHÔNG làm gì>
- Definition of Complete: <danh sách đo được — mục "Hoàn thiện" bên dưới>

## Kế hoạch

| ID | Việc (F-xxx gốc) | Mức | route | Phụ thuộc | PR · merge SHA | Trạng thái · bằng chứng |

## Quyết định và bằng chứng

- <chọn> · loại <phương án khác> · bậc <1–4> · <căn cứ: file/lệnh/output>

## Bàn giao / bước tiếp theo

- <MỘT bước cụ thể kế tiếp — hook giữ vòng in mục này mỗi lần chặn kết lượt>
```

Chỉ phiên chính sửa hồ sơ (worker không đụng → không xung đột giữa PR song song); commit kèm PR kế tiếp của
phiên chính. Dòng `- Trạng thái:` chỉ nhận `Active` · `Blocked — <lý do + lựa chọn + đề xuất>` ·
`Waiting — <chờ ai/gì>` · `Done`.

## Chuỗi chạy (không bỏ bước, không hỏi giữa chừng)

0. **Bật vòng giữ lượt:** sau khi có hồ sơ, `printf '%s\n' "docs/nang-cap/auto/<id>.md" > .claude/.auto-complete-loop`
   (gitignored). Hook Stop `auto-complete-guard.sh` từ đó **không cho kết lượt** khi hồ sơ còn `Active` và in lại
   mục "Bàn giao" — nên **luôn giữ mục đó là bước kế tiếp cụ thể**. Hook cho dừng khi: trạng thái
   `Blocked`/`Waiting`/`Done`, hồ sơ biến mất, đủ `AUTO_COMPLETE_MAX_CONTINUES` (mặc định 20) lượt tiếp tục, lời
   cuối lặp y hệt lượt trước, hoặc cổng commit (`pre-commit-gate`) đỏ ≥ 3 lần **cùng một lỗi** (nhắc §dừng một
   lần rồi cho dừng). Tín hiệu dừng là **file trạng thái**, không phải câu "đã xong".
1. **Đồng bộ + hiện trạng:** `git fetch origin` (base khớp `origin/main` mới nhất); đọc `PROGRESS.md` (mục mới nhất
   + nợ kỹ thuật), lộ trình `docs/ops/lo-trinh-*` §0, `PROJECT.md`, các đặc tả `docs/nang-cap/` liên quan. Tra dữ
   kiện thật (code, test, CI, issue) — không đoán.
2. **Lập kế hoạch toàn bộ + tự duyệt:** chia việc theo mức S/M/L và số PR (`CLAUDE.md` "Quy trình theo mức rủi
   ro" — nghi ngờ thì mức **cao hơn**). Mức M/L: **tự viết đặc tả** `docs/nang-cap/M<xx>-*.md` (khung
   `docs/nang-cap/SPEC-TEMPLATE.md`: phạm vi, DDL/API/điểm chạm code, tiêu chí chấp nhận đo được) và ghi
   `Approved for implementation — phiên chính tự duyệt theo /auto-complete (ADR-0015), <ngày>` + mục **Giả định**
   (điều lẽ ra hỏi chủ repo, đã chọn gì, vì sao). Quyết định kiến trúc khó đảo → ADR `docs/adr/` ghi **≥ 2 phương
   án** kèm lý do loại. Mức L ≥ 2 PR độc lập → `PLAN.md` + coordinator/worker theo bảng `route:`; brief đủ ngữ
   cảnh (worker không thấy hội thoại).
3. **Thực thi từng PR tới merge** (mỗi đơn vị một PR, nhánh theo chỉ định của phiên; PR trước merge xong thì
   dựng lại nhánh từ `origin/main` mới):
   - Fix logic: test hồi quy **đỏ trên code cũ** trước khi sửa. Vùng §8 (`docs/audit.md`): nêu bất biến trước
     lần sửa đầu (hook `risk-zone-gate`) + `audit-logic`/`audit-bao-mat` **bắt buộc** trên diff.
   - **Review tách người viết** trước MỖI PR: agent `reviewer` (+ `audit-*` theo file chạm) — không tự chấm diff
     của chính mình. Phát hiện mức chặn sửa trong cùng PR; còn lại ghi một dòng quyết định vào hồ sơ.
   - `npm run gate -- --test --build` xanh → `PROGRESS.md` → push → mở PR → theo dõi **mọi** check → xanh thì merge
     `SQUASH` (quy ước merge của `CLAUDE.md`, Vercel không tính). CI đỏ: chẩn đoán gốc rễ, sửa, đẩy lại.
   - Cổng đỏ cùng chữ ký lần 3 → `Blocked` (không sửa mù). **Không nới cấu hình cổng** (eslint/tsconfig/
     allowlist skip/coverage-baseline/workflow — `protect-config` sẽ hỏi; gặp lời hỏi đó là dấu hiệu đi sai hướng).
   - Cập nhật bảng "Kế hoạch" + "Bàn giao" của hồ sơ **ngay sau mỗi PR** (đứt phiên vẫn nối tiếp đúng chỗ).
4. **Hoàn thiện** (khi mọi PR bước 3 đã merge thật — SHA có trên `main`) — `docs/framework/project-completion.md`
   Pha 0–4 dịch sang XBoss:
   - Pha 0 (bản đồ): `PROJECT.md` + `spec.md` + `docs/ERD.md` thay `FEATURE-MAP`; `CLAUDE.md` + `docs/audit.md` +
     `TRAPS.md` thay `CONVENTIONS`; `CODEMAP.md` có sẵn — rà cho khớp, không viết lại. Cổng Pha 0: tự duyệt.
   - Pha 1 (audit, chỉ đọc): `/review` + `audit-bao-mat`/`audit-logic`/`audit-ui` trên phần phạm vi chạm, theo
     checklist `docs/audit.md`; mỗi phát hiện ID `F-xxx` + file:dòng + mức Cao/Trung/Thấp, ghi vào hồ sơ.
   - Pha 2 (kế hoạch + DoC): thêm dòng `W-xxx` vào bảng "Kế hoạch"; **tự duyệt** (ghi dòng quyết định).
   - Pha 3: lặp bước 3 cho từng `W-xxx`. Pha 4: quét lại nhóm bị ảnh hưởng tới khi **hội tụ** — 0 phát hiện Cao
     còn mở; Trung/Thấp còn lại có quyết định ghi nhận (sửa đợt sau / chấp nhận rủi ro → nợ kỹ thuật
     `PROGRESS.md`); lượt quét cuối không sinh Cao mới.
   - **Definition of Complete** mặc định (chỉnh theo phạm vi ở bước 2): CI xanh trên `main`; mọi fix có test hồi
     quy ở lại; 0 phát hiện Cao; `npm audit --omit=dev` sạch; tài liệu (`PROGRESS.md`, `docs/nang-cap/README.md`,
     lộ trình §0) khớp code; nợ còn lại đều có chủ đích.
5. **Bàn giao:** chạy được từ clone sạch — clone vào thư mục tạm trong scratchpad, `npm ci` → `npm run build` →
   `npm run gate -- --test` (có `TEST_DATABASE_URL` thì test tích hợp chạy thật); bước nào tài liệu
   (`README.md`/`DEPLOY.md`) thiếu thì sửa trong PR. Đề xuất **GO / NO-GO** phát hành kèm bằng chứng (chỉ là đề
   xuất — deploy thuộc danh sách dưới). Đặt `- Trạng thái: Done`, PR + merge SHA vào "Kế hoạch", ghi `PROGRESS.md`,
   `rm -f .claude/.auto-complete-loop`, báo cáo cuối lượt.

## Cách quyết định (áp cho MỌI lựa chọn trong lượt)

Đi thang từ trên xuống, dừng ở bậc đầu tiên phân thắng bại (không đổi bậc trên lấy bậc dưới):
**(1) đúng + bảo mật + không mất dữ liệu** (phương án hụt thì loại) → **(2) ít hơn** (code, nhánh logic,
dependency, cấu hình, abstraction, bước vận hành; tái dùng `lib/*`, `app/components/ui/` trước) →
**(3) kiểm được** (bằng chứng máy rẻ, rõ) → **(4) nhanh/rẻ**. Mỗi quyết định ghi **một dòng** vào hồ sơ mục
"Quyết định và bằng chứng" — không có dòng = chưa quyết định. Chủ repo đọc file này để audit sau, không bị hỏi trước.

## Không bao giờ tự quyết — ghi `Blocked`/`Waiting` kèm lựa chọn + đề xuất, rồi kết lượt

- Deploy/production/staging/VPS: chạy `deploy.sh`, chạy migration lên DB thật, bật cờ production
  (`XBOSS_STRICT_MEMBERSHIP`, PITR…). **Viết** migration đụng dữ liệu thì được (ghi "QUA STAGING" trong
  `PROGRESS.md`), **chạy** nó thì không.
- Xoá/đổi phá vỡ dữ liệu thật; đổi chính sách giữ/xoá dữ liệu người dùng.
- Secret, biến môi trường production mới, quyền GitHub/branch protection/ruleset, quyền vai trò mới cho người dùng thật.
- Chi phí mới (dịch vụ trả phí, model/API trả tiền); chạy `npx` gói **không có** trong `package.json`
  (`.claude/rules/00-uu-tien-ecc.md` mục 15). Thêm dependency npm thì tự quyết được nếu ghi lý do + `npm audit` sạch.
- Ngoài phạm vi đã ghi ở hồ sơ; viết lại lịch sử git/force-push; skip/disable/nới test hay cổng để xanh.
- Việc cần người hoặc thiết bị thật: UAT, review độc lập, Safari/iOS thật, AutoCAD 2026 → `Waiting`.
- Cùng một lỗi quá 3 lần.

Quyền merge theo quy ước `CLAUDE.md` (CI xanh → squash) **không** suy ra quyền deploy.

## Báo cáo cuối lượt

Một khối ngắn: PR đã merge (link + SHA) · số quyết định tự duyệt (trỏ hồ sơ) · đặc tả/ADR đã tự chốt · trạng thái
Definition of Complete từng mục + bằng chứng · kết quả chạy từ clone sạch · GO/NO-GO · `Blocked`/`Waiting` còn
lại kèm **câu hỏi duy nhất** cần chủ repo trả lời.

Bắt đầu bước 1 ngay.
