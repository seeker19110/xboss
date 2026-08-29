# PLAN — Thi hành đặc tả M109–M114 (PR #420)

Nguồn: 6 đặc tả `docs/nang-cap/M109-*.md` … `M114-*.md`, tất cả **Approved for implementation**
(2026-08-29). Mỗi việc dưới đây = 1 PR riêng, nhánh riêng, dispatch đúng agent theo `route:`.
Worker **PHẢI đọc đúng mục trong file đặc tả nguồn** (đường dẫn nêu ở mỗi việc) trước khi code —
đặc tả đã kín, không diễn giải lại trong PLAN này để tránh trôi khỏi bản gốc.

## Loại trừ khỏi đợt này (không dispatch)

- **M112 (riser)** — đặc tả tự ghi điều kiện tiên quyết "M111 đã chạy thật qua pilot" chưa đạt được
  trong phiên này (không có máy AutoCAD để verify tay). Bỏ qua toàn bộ M112.
- **Verify tay trên AutoCAD 2026 thật** (in PDF, thao tác UI thật) không làm được trong môi trường
  này — mọi PR đụng Adapter (`XBoss.Cad.Acad/*`) chỉ code + test Core (xunit chạy CI Linux), verify
  tay ghi vào `PROGRESS.md` mục nợ kỹ thuật, không được tự nhận đã verify.

## Thứ tự & phụ thuộc

1. **M109 PR1**, **M113 PR1** — làm song song trước (độc lập).
2. **M109 PR2** sau M109 PR1. **M113 PR2** sau M113 PR1 (M113 PR1 migration — không lên production
   thẳng, xem `docs/ops/staging.md`, nhưng CI/test vẫn chạy bình thường trên nhánh).
3. **M113 PR3** sau PR2. **M113 PR4** sau PR2 (không phụ thuộc PR3).
4. **M110 PR1 → PR2** (độc lập với các nhánh trên, có thể chạy song song).
5. **M111 PR1 → PR2 → PR3** (rủi ro cao nhất — theo đúng guardrail đặc tả).
6. **M114 PR1 → PR2 → PR3 → PR4** (đi sau M109 vì cần `crossingPolicy` đã có trong rule pack —
   base M114 lên nhánh/main đã có M109 PR1 merge, hoặc rebase trước khi mở PR).

Rule pack version: mỗi việc tạo file `lib/ky-thuat/cad/rule-packs/v<next>.json` — **tra số thật
lúc code** bằng `ls lib/ky-thuat/cad/rule-packs | sort -V | tail -1`, cộng 1. Nếu 2 nhánh song song
cùng chiếm 1 số, nhánh merge sau đổi số + rebase (coordinator xử lý ở bước tích hợp).

---

## Việc 1 — M109 PR1: rule pack + CrossingGeometry + test Core

`route: spec`. Đọc `docs/nang-cap/M109-ngat-net-giao-cheo.md` mục 5–9 (khóa rule pack, FR1-3,
điểm chạm code, test plan). Nhánh: `feat/m109-pr1-crossing-geometry`.
Phạm vi: rule pack `crossingPolicy` (TS + C# `RulePackModels.cs`/`RulePackLoader.cs`),
`Core/Draw/CrossingGeometry.cs` mới, tách hàm giao điểm dùng chung từ phép kiểm 11 vào
`Core/Geometry/Segment2D.cs` nếu cần, `VaiTroVe.NgatNet` + `HandleTimGiao` + `DaoTay` trong
`Core/Draw/VeXData.cs`, test xunit theo mục 9. Tiêu chí chấp nhận: NFR2 (build Core trên CI Linux,
không NuGet mới), test cover vùng che/cầu vượt/lọc góc/priority/validator 3 lỗi ở §5.

## Việc 2 — M109 PR2: adapter lệnh vẽ ngắt nét

`route: complex`. Base trên nhánh Việc 1 sau khi merge. Đọc mục 6 (FR4-10), mục 10 (ranh giới
quyết định: cách đẩy wipeout lên trên DrawOrder, xử lý giao nhiều tuyến chồng nhau).
Nhánh: `feat/m109-pr2-ngatnet-adapter`. 2 lệnh `[CommandMethod]`, `VeThucThe.cs` dựng/xóa Wipeout +
cầu vượt, hộp thoại M106 `NgatNetDialogViewModel`, báo cáo `VeSessionReport`, tài liệu plugin.
**Bất khả xâm phạm (AC2): polyline tim không đổi tọa độ đỉnh** — bắt buộc có test Core chứng minh
(không chỉ verify tay, vì verify tay không làm được ở đây).

## Việc 3 — M110 PR1: rule pack + RevisionCloud/RevisionSnapshot

`route: spec`. Đọc `docs/nang-cap/M110-revision-cloud.md` toàn bộ (đặc tả kín, cả 2 PR route spec).
Nhánh: `feat/m110-pr1-revision-core`. Rule pack + validator + `RevisionCloud` + `RevisionSnapshot`
+ `VaiTroVe.Revision` + test Core theo mục 9 (test plan) của tệp.

## Việc 4 — M110 PR2: adapter 3 lệnh revision

`route: spec`. Base trên nhánh Việc 3 sau merge. Đọc điểm chạm code + FR liên quan 3 lệnh
(`XBOSS_VE_REV`/`_CHOT`/`_HIENTHI`), `RevisionStore`, layer con theo revision, hộp thoại M106,
phép kiểm FR8, tài liệu. Nhánh: `feat/m110-pr2-revision-adapter`.

## Việc 5 — M111 PR1: rule pack + FloorReplicator + XData

`route: spec`. Đọc `docs/nang-cap/M111-nhan-ban-tang-dien-hinh.md` mục đặc tả kỹ (rule pack,
`copyRoles`, guardrail §2, FR liên quan vị trí/tag/vùng/kế hoạch ánh xạ). Nhánh:
`feat/m111-pr1-floor-replicator-core`. Rule pack + validator + `FloorReplicator` + XData mới +
test Core.

## Việc 6 — M111 PR2: adapter nhân bản tầng

`route: complex`. Base trên nhánh Việc 5 sau merge. Đọc mục "Kế hoạch PR" — ranh giới được quyết:
cách gom transaction cho N tầng, cách xử lý đối tượng thuộc nhiều vùng cùng lúc. **Không được tự
quyết**: bỏ guardrail §2, đổi `copyRoles`, chép sang tệp đóng. Nhánh:
`feat/m111-pr2-nhantang-adapter`. `DeepCloneObjects` + thi hành ánh xạ handle, xem trước FR3,
FR8/FR9, tính nguyên tử NFR2. **Lưu ý rủi ro đã ghi trong đặc tả:** phải xác nhận `DeepCloneObjects`
chép đủ XData — nếu không kiểm được bằng AutoCAD thật ở đây, ghi rõ thành nợ kỹ thuật trong
PROGRESS.md, không tự nhận đã xác minh.

## Việc 7 — M111 PR3: kiểm handle mồ côi + tài liệu

`route: standard`. Base trên nhánh Việc 6 sau merge. Đọc AC3 + quyết định đã chốt "phép kiểm trong
`XBOSS_KIEMTRA`, cảnh báo không chặn khi tầng nguồn đỏ KIEMTRA". Nhánh: `feat/m111-pr3-kiemtra-moico`.

## Việc 8 — M113 PR1: migration + RLS + block library theo dự án

`route: spec`. Đọc `docs/nang-cap/M113-thu-vien-block-theo-du-an.md` mục schema/RLS/hàm
`tronThuVienBlock`/`layBlockLibHienHanh`. Nhánh: `feat/m113-pr1-schema-rls`. Migration mới theo
ADR-0003 (append-only, `IF NOT EXISTS`), RLS, test kể cả RLS. **Ghi rõ trong PR description: migration
đụng ràng buộc dữ liệu — cần qua staging trước khi lên production** (không tự chạy `deploy.sh
--staging`, chỉ nêu yêu cầu).

## Việc 9 — M113 PR2: API `?project=`

`route: spec`. Base trên nhánh Việc 8 sau merge. Nhánh: `feat/m113-pr2-api-project`. 3 route API
nhận `?project=`, kiểm xung đột `blockName`, regen `docs/ERD.md`.

## Việc 10 — M113 PR3: web UI 2 khối

`route: standard`. Base trên nhánh Việc 9 sau merge. Nhánh: `feat/m113-pr3-web-ui`. 2 khối danh sách
block (toàn cục/dự án) + chip nguồn, kiểm axe (a11y), bám ADR-0009 (bộ component UI nền).

## Việc 11 — M113 PR4: plugin gửi `project`

`route: spec`. Base trên nhánh Việc 9 sau merge (không phụ thuộc PR3). Nhánh:
`feat/m113-pr4-plugin-project`. Plugin gửi `project` khi tải/kiểm hash bộ block, `XBOSS_BANG`,
M103 gửi kèm dự án, tài liệu.

## Việc 12 — M114 PR1: rule pack + HanhLangGraph + DinhTuyen

`route: spec`. Đọc `docs/nang-cap/M114-auto-routing-hanh-lang.md` toàn bộ mục liên quan. Base lên
nhánh đã có M109 PR1 merge (cần `crossingPolicy` sẵn trong rule pack — dùng `main` mới nhất sau khi
Việc 1 merge). Nhánh: `feat/m114-pr1-hanhlang-graph-core`.

## Việc 13 — M114 PR2: CapPhatLanTang + đối chứng 2 tầng

`route: spec`. Base trên nhánh Việc 12 sau merge. Nhánh: `feat/m114-pr2-capphat-doichung`.
`routing-doi-chung.json` + test đối chứng TS/C# (rủi ro số 1 của M99 — không được trôi khác nhau).

## Việc 14 — M114 PR3: adapter XBOSS_VE_HANHLANG

`route: spec`. Base trên nhánh Việc 13 sau merge. Nhánh: `feat/m114-pr3-hanhlang-adapter`.
Vẽ + nhận + sửa/xóa hành lang, hộp thoại M106.

## Việc 15 — M114 PR4: adapter XBOSS_VE_TUYENTUDONG

`route: complex`. Base trên nhánh Việc 14 sau merge. Ranh giới được quyết: cách vẽ nét tạm xem
trước, thứ tự xử lý thiết bị FR7, gom nhánh chung đoạn cuối thành 1 polyline hay giữ nhiều polyline
rời. **Không được tự quyết:** bỏ guardrail §3, nới `snapRadiusMm`/độ dốc, gọi vào M77, thêm nút
route tất cả các hệ. Nhánh: `feat/m114-pr4-tuyentudong-adapter`.

---

## Việc chung cho mọi PR (nhắc worker)

- `npm run lint` + `npm run typecheck` xanh trước khi báo xong; test C# build qua `dotnet build`/
  `dotnet test` trong `plugin-autocad/` nếu môi trường có sẵn .NET SDK (coordinator kiểm bằng
  `dotnet --version`; thiếu thì ghi rõ trong báo cáo, không giả vờ đã chạy).
- Cập nhật `PROGRESS.md` mục "Đã làm" cho đúng việc, và `docs/nang-cap/README.md` nếu đóng 1 mục
  `M<xx>` (chỉ đóng khi TẤT CẢ PR của mốc đó đã merge — M109/M110/M111/M113/M114 mỗi mốc nhiều PR,
  đừng đóng sớm).
- Commit message tiếng Việt, conventional prefix.
- KHÔNG tự merge, KHÔNG tự mở PR — coordinator/phiên chính làm sau khi review.
