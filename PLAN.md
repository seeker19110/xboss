# PLAN.md — Đợt M100+M101 Pha 1: rule pack v4 + thư viện block (M100 PR1 + PR2)

**Cập nhật:** 2026-08-25
**Nguồn đặc tả (ĐÃ DUYỆT):** `docs/nang-cap/M100-xboss-ve-shop-drawing.md` + `docs/nang-cap/M101-plugin-nang-tran.md`
**Nhánh nền:** `claude/plugin-capabilities-limits-rrd2gp` — ⚠️ KHÁC MẶC ĐỊNH: base mọi worktree trên **nhánh này** (KHÔNG phải `origin/main`) vì 2 file đặc tả M100/M101 chỉ có trên nhánh này. Nhánh đã hợp nhất `origin/main` (a1abfd56) sáng nay.

## Bối cảnh

M99 (plugin AutoCAD chuẩn hóa + bóc KL) đã xong PR-A/B/2/5/6/7a. M100 = bộ lệnh vẽ `XBOSS_VE_*`; M101 = nâng trần 3 khối M99. Cả hai Approved 2026-08-25. Pha 1 làm 2 nền móng: **rule pack v4** (V1) và **thư viện block server** (V2). Các pha sau (Adapter lệnh vẽ, M101) phụ thuộc pha này.

## Quy ước bắt buộc cho MỌI việc (worker không thấy hội thoại — mọi thứ cần biết nằm ở đây)

- **Đọc trước khi sửa:** `CLAUDE.md` (Auth, ADR-0007, Quy ước), đặc tả M100 (đọc TOÀN BỘ file), `plugin-autocad/README.md` (mục "Ràng buộc thiết kế phải giữ khi sửa code").
- **Tiếng Việt** toàn bộ comment/thông báo/commit (conventional prefix).
- **.NET:** SDK 8 đã cài (`dotnet` trong PATH). Trước khi chạy dotnet: `export SSL_CERT_FILE=/root/.ccr/ca-bundle.crt` (proxy TLS). Test C#: `dotnet test plugin-autocad/XBoss.Cad.Tests/XBoss.Cad.Tests.csproj` — hiện 94 ca xanh, KHÔNG được làm đỏ ca nào. `XBoss.Cad.Core` CẤM tham chiếu assembly AutoCAD (M99 FR17). Đừng đụng `XBoss.Cad.Acad` (không build được trên Linux — pha sau).
- **Node:** worktree mới chưa có `node_modules` → chạy `npm ci` trước (proxy đã thông). Cổng: `npm run lint && npm run typecheck && npm test` (test liên quan pass; toàn bộ khi kịp) + `npm run check:lib-layers`.
- **Postgres cho test tích hợp:** binary `/usr/lib/postgresql/16/bin/`, không chạy dưới root — dựng user thường:
  ```bash
  useradd -m pgtest 2>/dev/null; PGD=/home/pgtest/pgdata_<viec>
  su pgtest -c "/usr/lib/postgresql/16/bin/initdb -D $PGD -U postgres --auth=trust -E UTF8"
  su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGD -o '-p <cong> -k /tmp' -l $PGD/log start"
  psql "postgresql://postgres@127.0.0.1:<cong>/postgres" -c "CREATE DATABASE xboss_test;"
  export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:<cong>/xboss_test"   # PHẢI là URL TCP
  ```
  V1=55511, V2=55512. Tắt cluster khi xong.
- **SQL** qua helper `lib/db` placeholder `?`; file test chạm DB `import "@/tests/setup"` DÒNG ĐẦU.
- **Migration:** chỉ V2 được thêm, số **0139** (đã kiểm `ls migrations | sort -V | tail -3` = 0138). Nếu lúc code số 0139 đã bị chiếm (fetch thấy mới) → lấy số kế tiếp thật và báo.
- **Không mở rộng phạm vi**, không nâng dependency, không đổi hành vi lệnh M99 hiện có.
- **Commit** trong worktree của mình, KHÔNG push (phiên chính push).

---

## Việc V1 — Rule pack v4 + validator Core + test (M100 PR1) — `route: spec`

**Đặc tả kín:** M100 §11 (khối `drawTools` + `sheetSetup` — cấu trúc JSON mẫu trong file), §7 FR1/FR4, §9 (file đích), §15 (test), §8 AC9. Đọc thêm M100 §6.7–§6.9 để khai đủ khóa cho GIADO/LOCHO/TAG/slope (supportSpacingMm, sleeveClearanceMm, tagPattern, tableStyle, slopes, slopeRequired).

**Việc cụ thể:**

1. `lib/ky-thuat/cad/rule-packs/v4.json` — copy nguyên v3 (append-only, KHÔNG sửa v3) + thêm `version: "v4"`, `description`, khối `drawTools` + `sheetSetup` đúng §11. `drawTools.systems`: đủ 5 hệ thao tác (HVAC/PIPING/FIREFIGHTING/ELECTRICAL/ELV — id khớp `layerMap.groups[].id`); mỗi `lines[]`: `itemId` khớp `takeoff.items[].id`, `layer` khớp đúng `branches[].target` của group tương ứng trong `layerMap` (xem v3), `edgeStyle` (`double` cho duct/tray, `none` cho pipe), `sizes` (ống gió WxH thông dụng; ống DN20–DN200; máng W×H), và các khóa §6.7–6.9 (`supportSpacingMm` theo size hoặc số chung, `sleeveClearanceMm`, `slopeRequired: true` cho `pipe-sanr`). `fittings`/`equipment`: id block dự kiến (đặt tên `elbow-duct`, `tee-duct`, `reducer-duct`, `damper-vcd`, `grille-supp`, `elbow-pipe`, `tee-pipe`, `valve-gate`, `spk-head`, `support-duct`, `support-pipe`, `sleeve-wall`, `slope-arrow`… — tối thiểu đủ dùng cho hệ HVAC + PIPING + FIREFIGHTING; equipment: `fcu-unit`, `ahu-unit`). Mô tả tiếng Việt cho từng khóa như phong cách v3.
2. `XBoss.Cad.Core` — thư mục `Draw/` MỚI, 2 lớp thuần (KHÔNG đụng AutoCAD):
   - `DrawToolsConfig.cs`: parse khối `drawTools`+`sheetSetup` từ JSON rule pack (System.Text.Json, theo phong cách các lớp `RulePack/` hiện có — ĐỌC code hiện trạng trước); validate: (a) mọi `systems[].id` tồn tại trong `layerMap.groups[].id`; (b) mọi `lines[].layer` khớp một `branches[].target` của đúng group đó; (c) mọi `lines[].itemId` tồn tại trong `takeoff.items[].id`; (d) layer + `edgeLayerSuffix` KHÔNG khớp bất kỳ `takeoff.items[].layerMatchAny` nào (dùng `TokenMatcher` hiện có — MỘT matcher duy nhất); (e) `sheetSetup.titleblockId` khai thì phải khác rỗng. Sai → ném lỗi thông điệp tiếng Việt nêu rõ khóa sai.
   - `TakeoffCrossCheck.cs`: nhận drawTools + takeoff → mọi `systems[].equipment[]` phải trỏ tới item `measure == "count"` có `blockNameMatchAny` khác rỗng; trả danh sách cảnh báo (không ném).
3. Test (`XBoss.Cad.Tests`): nạp **rule pack v4 THẬT từ repo** (pattern test hiện có nạp v2/v3 — xem `XBoss.Cad.Tests` hiện trạng): v4 parse được, validate pass, cross-check 0 cảnh báo; case tổng hợp v4 vẫn pass toàn bộ test v3 hiện có (AC9 — mở rộng thuần: các test đang nạp "rule pack mới nhất" nếu có thì trỏ v4 vẫn xanh); case lỗi nhân tạo (layer sai group, `-EDGE` đụng takeoff, itemId ma) → validator BẮT ĐƯỢC (chứng minh đỏ→xanh).
4. Server: kiểm `lib/ky-thuat/cad/rule-pack.ts` chọn version thế nào (grep `v3`); nếu hard-code danh sách/latest → thêm v4 là bản hiện hành; chạy test TS liên quan (`tests/*rule-pack*`, `tests/cad-*`).

**Tiêu chí chấp nhận:** dotnet test xanh toàn bộ (94 cũ + mới); test TS liên quan xanh; v3.json không đổi 1 byte; validator chứng minh bắt được 3 lớp lỗi.

## Việc V2 — Thư viện block server: DDL + lib + API + web + BlockManifest Core (M100 PR2) — `route: complex`

**Đặc tả:** M100 §6.10 (trạng thái thư viện), §7 FR2, §10 (API contract — bảng), §11 (manifest JSON + DDL `cad_block_libs`), §12 (security), §9 (điểm chạm). **Ranh giới được phép quyết:** chi tiết UI mục "Thư viện block" (bố cục trong khuôn ADR-0009/dark-first); cách nộp DXF sidecar kèm khi phát hành (multipart field); cấu trúc chi tiết JSONB manifest miễn đúng §11.

**Việc cụ thể:**

1. `migrations/0139_cad_block_libs.sql` — DDL đúng §11 (thêm thuần, `IF NOT EXISTS`).
2. `lib/ky-thuat/cad/block-lib.ts` — logic thuần + DB: `kiemDinhManifest` (đối chiếu sha256 tệp; mọi block khai phải có mặt trong DXF sidecar người phát hành nộp kèm — TÁI DÙNG `validateDxf`/`parseDxf` của parser tầng 3 như `plugin-upload.ts` đã làm, đọc file đó trước; đối chiếu `blockName` với `takeoff.blockNameMatchAny` của rule pack hiện hành → cảnh báo lệch, không chặn), `phatHanhBlockLib` (lưu `.dwg` qua `storagePut` như plugin-upload, ghi dòng bảng), `layBlockLibHienHanh`.
3. `app/api/engineering/cad/block-lib/route.ts` — GET: auth như `GET /api/engineering/cad/rule-pack` (ĐỌC route đó trước, dùng đúng cơ chế token scope `cad` hoặc session); ETag theo version → 304; `?manifest=1` trả JSON manifest, mặc định trả tệp `.dwg`. POST: session Admin/PM + CSRF (theo pattern route upload hiện có), multipart `.dwg` + manifest + DXF sidecar, giới hạn kích thước như các route upload hiện hành; sai → 422 danh sách lỗi tiếng Việt. `export const dynamic = "force-dynamic"`.
4. Web: mục "Thư viện block" thêm vào bảng điều khiển plugin `app/engineering/chuan-hoa-ban-ve` (ĐỌC `PluginControlPanel.tsx` hiện có, bám đúng phong cách): version hiện hành + lịch sử + form phát hành (Admin/PM) + nút tải.
5. `XBoss.Cad.Core` `Draw/BlockManifest.cs`: parse manifest, kiểm sha256 tệp cache, validate kind (`fitting|equipment|titleblock|support|sleeve`), attribute bắt buộc theo kind; test với manifest mẫu commit vào `plugin-autocad/doi-chung/` hoặc cạnh test (kèm 1 case hash lệch → từ chối).
6. Test node: `tests/cad-block-lib.test.ts` (import `tests/setup` dòng đầu) — kiemDinh/phatHanh/idempotent + route auth 401/403/422 (pattern `tests/cad-plugin-upload.test.ts` — ĐỌC file đó trước).

**Tiêu chí chấp nhận:** lint + typecheck + test node liên quan xanh với TEST_DATABASE_URL; dotnet test xanh; check:lib-layers xanh; route mới có `getCurrentUser()` + 401.

## Thứ tự & phụ thuộc

V1 ∥ V2 (file rời nhau hoàn toàn; V2 dùng manifest schema từ đặc tả, không đợi V1). Va chạm duy nhất có thể: cả hai đụng `XBoss.Cad.Tests` csproj/test chung → tích hợp: V1 trước, V2 rebase lên. Reviewer soát từng nhánh xong mới tích hợp cả hai vào nhánh nền `claude/plugin-capabilities-limits-rrd2gp` (KHÔNG push).
