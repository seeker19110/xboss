# M102 — Đặc tả: Đóng nốt trần chuẩn hóa — polyline gần kín, block lạc chuẩn, kiểm chéo tag/mã BOQ, idempotency

| Mục          | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal | Đóng 4 khoảng trống cuối của pipeline chuẩn hóa sau M99/M100/M101: (1) KIEMTRA phát hiện polyline gần kín nhưng CHUANHOA không sửa; (2) block nặc danh/lạc chuẩn chỉ bị BÁO, chưa quy về thư viện block 0139; (3) 2 phép kiểm chéo đã hẹn ở M100 §20/M101 §19 (tag trùng, mã BOQ mồ côi) chưa cài; (4) idempotency layerMap **đã vá ở M101 PR2 cả 2 tầng** nhưng `knownIssues` của rule pack vẫn mô tả nợ cũ và chưa có test canh bất biến ở mức pipeline |
| Owner        | Kỹ sư trưởng CAD + phiên chính                                                                                                                                                                                                                                                                                                                                                                                                                            |
| State        | **Approved — ĐÃ THI HÀNH XONG cả 2 PR** (gộp một PR #398, squash `427bf5f`, merge 2026-08-25). Rule pack phát hành **v8**, mọi khóa mới mặc định tắt/`reportOnly`. Phần Adapter còn **chờ verify tay trên máy có AutoCAD 2026** (không có runner Windows — M99 §18)                                                                                                                                                                                       |
| Nguồn        | M99 §6.4 (phép kiểm 3 polyline hở), M100 §20 (đối chiếu chéo), M101 §19 kết luận, rule pack v1 `layerMap.knownIssues[0]`, quy trình chuẩn hóa 6 giai đoạn (thảo luận 2026-08-25)                                                                                                                                                                                                                                                                          |

## 1. Problem

- Phép kiểm 3 (M99) khoanh polyline hở/gần kín nhưng kỹ sư phải zoom từng chỗ đóng tay — trong khi khe < ngưỡng là sửa máy được; diện tích/nhận vùng (M101 bóc theo vùng) phụ thuộc polyline kín.
- `purgePolicy.reportAnonymousBlocks` (v2) chỉ BÁO block nặc danh; thư viện block chuẩn đã có từ M100 PR2 (`0139_cad_block_libs.sql` + manifest) nhưng chưa có đường quy block lạc chuẩn về block thư viện.
- M100 §20 hẹn "tag trùng vào `XBOSS_KIEMTRA` (phép 17)"; M101 kết luận nhắc lại — chưa cài. Tương tự chưa có phép kiểm "đối tượng bóc được nhưng mã BOQ mồ côi" dù map per-project (0140) đã chạy.
- Idempotency layerMap **đã được vá ở M101 PR2** (`LayerMapper._daChuan` + `normalizeCadLayers()` tầng 3, vá 2026-08-25) nhưng `layerMap.knownIssues[0]` của rule pack **vẫn ghi nợ đã đóng** — tài liệu lệch code, đúng lớp lỗi CLAUDE.md cảnh báo. Ngoài ra chưa có test nào canh bất biến ở mức **pipeline** (mới có ở mức LayerMapper).

## 2. Outcome, metric, guardrail

- **Outcome:** CHUANHOA chạy 2 lần liên tiếp trên cùng bản vẽ → lần 2 báo cáo "0 thay đổi" (idempotent toàn pipeline); polyline khe ≤ ngưỡng tự đóng; block lạc chuẩn quy về thư viện khi bật; KIEMTRA bắt tag trùng + mã mồ côi trước khi bóc/nộp.
- **Guardrail:** mọi khóa mới mặc định **tắt** hoặc `reportOnly` — rule pack v8 nạp plugin cũ (đọc v7) chạy y hệt (mở rộng thuần, như mọi version trước); không migration DB nào (phép 18 dùng API `rule-pack?project=` sẵn có); không đổi hợp đồng Excel M99 §13.2.

## 3. Nghiên cứu hiện trạng (điểm chạm)

| Hiện trạng                                                                                          | Dùng lại / thay đổi                                                                            |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `XBoss.Cad.Core/Inspection/Inspector.cs` + `PhepKiemMoRong.cs` (phép 1–16, snapshot models)         | Thêm phép 17/18 cùng khuôn `PhepKiemMoRong` (thuần, `enabled` riêng, tự tắt khi thiếu dữ liệu) |
| `XBoss.Cad.Core/Standardize/ChuanHoaMoRong.cs` + `Acad/Services/StandardizePipeline.cs` (bước 8–11) | Thêm bước 12 (đóng polyline) + 13 (block map) cùng khuôn — mặc định tắt, 1 UNDO                |
| `XBoss.Cad.Core/Layers/LayerMapper.cs` + `Matching/TokenMatcher.cs`                                 | Sửa idempotency: tên đã là target chuẩn → giữ nguyên (xem §6.3)                                |
| `XBoss.Cad.Core/Geometry/Segment2D.cs`, `Zoning/VungClipper.cs`                                     | Tái dùng hình học 2D thuần cho tính khe polyline                                               |
| `lib/ky-thuat/cad/block-lib.ts` + manifest M100 (`kind`, `nameMatchAny`)                            | Nguồn tên block chuẩn cho `blockMap` — rule pack v8 chỉ THAM CHIẾU tên, không nhúng DWG        |
| `lib/ky-thuat/cad/rule-pack.ts` + `rule-packs/v7.json`                                              | Phát hành `v8.json` mở rộng thuần + validator                                                  |
| XData tag `XBOSS_VE` (M100 `VeTagCommands`/`TagSchedule`)                                           | Nguồn dữ liệu phép 17 — không có M100 trên bản vẽ → phép tự tắt                                |
| `lib/ky-thuat/cad/boq-map.ts` + `rule-pack?project=` (M101 PR4)                                     | Nguồn dữ liệu phép 18 — rule pack không có `boqCode` nào → phép tự tắt kèm ghi chú             |

## 4. Phương án — rule pack v8 (mở rộng thuần từ v7)

```jsonc
{
  "version": "v8",
  "polylineClosePolicy": {
    // bước chuẩn hóa 12
    "enabled": false, // mặc định TẮT — v8 nạp plugin đọc v7 chạy y hệt
    "gapCloseToleranceMm": 5, // khe ≤ ngưỡng → đóng (nối điểm cuối về điểm đầu)
    "onlyOnLayersMatchAny": [], // rỗng = mọi layer đã map chuẩn; khác rỗng = giới hạn
    "reportOnly": false, // true = chỉ báo vị trí sẽ đóng, không sửa
  },
  "blockMap": {
    // bước chuẩn hóa 13
    "enabled": false,
    "reportOnly": true, // bản đầu CHỈ BÁO — thay block là thao tác phá hủy, bật sửa thật sau pilot
    "rules": [
      // { "target": "<tên block thư viện 0139>", "aliasMatchAny": ["FCU-CU", "FCU_OLD"] }
    ],
  },
  "inspectionPolicy": {
    "checks": {
      // thêm vào khối checks sẵn có
      "17-tag-trung": { "enabled": false }, // tag XBOSS_VE_TAG trùng số trong cùng hệ/bản vẽ
      "18-ma-mo-coi": { "enabled": false }, // đối tượng trên layer khớp takeoff item mà item không có boqCode
    },
  },
}
```

## 5. Scope / non-goals

**Trong phạm vi:** rule pack v8 + validator; bước chuẩn hóa 12/13; phép kiểm 17/18; sửa idempotency layerMap; test idempotency toàn pipeline phần Core.
**Non-goals:** tự dò/gán lại xref (đã chốt chỉ báo — v7); thay block tự động khi hình học khác biệt lớn (bản đầu `reportOnly`); nhận diện phòng/đồ thị ngữ nghĩa (bậc sau, mở M riêng); mọi thứ 3D/BIM (ADR-0006); không đụng đường ghi sổ khối lượng.

## 6. Nội dung chi tiết

### 6.1 Bước 12 — đóng polyline gần kín (`polylineClosePolicy`)

- Đối tượng: LWPOLYLINE/POLYLINE hở có khoảng cách điểm đầu–cuối `0 < gap ≤ gapCloseToleranceMm` (đo theo đơn vị bản vẽ đã quy về mm theo INSUNITS — tái dùng `DrawingUnits`).
- Sửa: đặt cờ `Closed = true` khi 2 điểm gần trùng, hoặc nối điểm cuối về điểm đầu (không thêm đỉnh mới ngoài 1 đoạn nối). Logic quyết định "đóng kiểu nào" THUẦN trong Core (`ChuanHoaMoRong`): input danh sách đỉnh, output hành động (`Close` | `NoiThem` | `BoQua`), Adapter chỉ thi hành.
- Khe > ngưỡng: giữ nguyên, vẫn do phép kiểm 3 báo như cũ. `reportOnly` → chỉ ghi báo cáo + marker, không sửa.
- **Vì sao bước 12 mặc định `reportOnly: false` còn bước 13 là `true`** (khác nhau có chủ đích, không phải bất nhất): đóng một khe ≤ ngưỡng là thao tác hình học nhỏ, hoàn tác được bằng chính 1 nhóm UNDO của CHUANHOA và có ngưỡng chặn; thay định nghĩa block thì mất attribute lệch tag và có thể lệch hình học — hoàn tác được nhưng thiệt hại khó thấy ngay, nên bản đầu chỉ báo.
- Báo cáo JSON: mảng `polylineClosed[]` (handle, gap mm, cách đóng) trong khối bước 12.

### 6.2 Bước 13 — quy block lạc chuẩn về thư viện (`blockMap`)

- Nguồn chuẩn: tên block trong thư viện 0139 (manifest M100). Rule khai `aliasMatchAny` (token-boundary như layerMap — tái dùng `TokenMatcher`, KHÔNG substring thô).
- `reportOnly: true` (mặc định bản đầu): báo danh sách BlockReference có tên khớp alias nhưng ≠ target, kèm số lượng — kỹ sư thay tay hoặc chờ bật sửa thật.
- Khi bật sửa thật (`reportOnly: false`, phiên bản sau pilot): đổi BlockReference sang định nghĩa target **giữ nguyên** transform (vị trí/xoay/scale) + attribute trùng tag; block nặc danh (`*U...`) KHÔNG bao giờ tự thay — chỉ báo (không có tên để khớp alias).
- **Thứ tự trong pipeline: bước 13 nối đuôi SAU bước 11**, không chèn vào giữa (bản nháp đặc tả ghi "sau purge, trước lineweight/CTB" — đã sửa 2026-08-25 khi thi hành PR2). Lý do: chèn vào giữa buộc phải đánh lại số hiệu các bước 7–11 đã đi vào báo cáo JSON và tài liệu; còn lợi ích của "purge sau khi thay block" chỉ là dọn định nghĩa block cũ nay không ai tham chiếu — mà bản đầu `reportOnly` không thay gì cả, và khi bật sửa thật thì chạy `XBOSS_CHUANHOA` lần hai sẽ purge nốt (pipeline idempotent nên chạy lại là an toàn). Báo cáo của bước 13 ghi rõ điều này khi có thay đổi thật.

### 6.3 Idempotency `layerMap` — đóng phần còn lại

Bản thân lỗi **đã vá ở M101 PR2** cả 2 tầng (`LayerMapper._daChuan`; `normalizeCadLayers()`). M102 chỉ đóng phần còn thiếu:

- **v8 sửa `layerMap.knownIssues`**: bỏ dòng "Không idempotent…" (nợ đã đóng — để lại là tài liệu lệch code), thay bằng ghi chú nêu rõ đã idempotent từ M101 PR2 và cơ chế miễn trừ tên đã chuẩn. Dòng knownIssues thứ hai (khớp sai hệ do thứ tự nhóm) **giữ nguyên** — vẫn đúng hiện trạng.
- **Test bất biến ở mức pipeline** (chưa có): áp chuỗi biến đổi thuần của Core 2 lần trên fixture layer/tên đã chuẩn lẫn chưa chuẩn → lần 2 không sinh thay đổi nào.

### 6.4 Phép kiểm 17 — tag trùng

- Nguồn: XData tag của `XBOSS_VE_TAG` (M100). Trùng = 2 tag cùng chuỗi số thứ tự trong cùng hệ trên cùng bản vẽ. Bản vẽ không có XData tag nào → phép tự tắt (như phép 15).
- Marker + báo cáo cùng khuôn phép 10–16.

### 6.5 Phép kiểm 18 — mã BOQ mồ côi

- Với rule pack per-project (M101 PR4): mọi `takeoff.items[]` có đối tượng khớp trên bản vẽ mà `boqCode` rỗng → 1 dòng cảnh báo/item (không marker từng đối tượng — lỗi ở cấp item). Rule pack không có trường `boqCode` nào (bản toàn cục) → phép tự tắt kèm ghi chú "cần rule pack theo dự án".
- Giá trị: chặn sớm "bóc xong Excel cột A trống" trước khi QS mở tệp.

## 7. FR / AC

- **FR1** Rule pack v8 mở rộng thuần: mọi khóa mới `enabled:false` hoặc `reportOnly:true`; validator TS + C# chặt (khóa lạ/kiểu sai → từ chối nạp). **FR2** Toàn bộ logic quyết định trong Core thuần + xunit chạy CI Linux; Adapter chỉ đọc/ghi entity. **FR3** Bước 12/13 nằm trong 1 nhóm UNDO chung của CHUANHOA, có mặt trong diff preview. **FR4** Sửa layerMapper KHÔNG đổi kết quả trên tên layer chưa chuẩn (chỉ thêm nhánh chặn tên đã chuẩn) — toàn bộ test LayerMapper hiện có phải xanh không sửa fixture. **FR5** Test idempotency: áp pipeline Core (layer map + font + các bước thuần) 2 lần trên fixture → lần 2 zero thay đổi.
- **AC1** _Given_ polyline hở khe 3mm, ngưỡng 5mm, bật bước 12, _when_ CHUANHOA, _then_ polyline kín + báo cáo ghi handle/gap; khe 8mm giữ nguyên và phép kiểm 3 vẫn báo. **AC2** _Given_ `reportOnly:true`, _then_ không entity nào đổi, báo cáo vẫn đủ danh sách. **AC3** _Given_ block tên `FCU-CU` với rule alias→`FCU-STD`, `reportOnly:true`, _then_ báo đúng số lượng, không thay; bật sửa thật → BlockReference trỏ `FCU-STD`, vị trí/xoay/scale/attribute giữ nguyên. **AC4** _Given_ layer `M-CHW-PIPE` (đã chuẩn), _when_ áp layerMap v8, _then_ giữ nguyên `M-CHW-PIPE` (v7 trở về trước ra kết quả khác — đây là bug được sửa). **AC5** _Given_ 2 tag "T-05" cùng hệ, bật phép 17, _then_ KIEMTRA báo 1 lỗi kèm 2 handle. **AC6** _Given_ rule pack per-project có item khớp đối tượng nhưng `boqCode` rỗng, bật phép 18, _then_ báo cáo nêu tên item; rule pack toàn cục → phép tự tắt. **AC7** Rule pack v8 mặc định nguyên trạng nạp vào plugin: KIEMTRA/CHUANHOA/BOCKL cho kết quả y hệt v7 trên cùng fixture.

## 8. Kiến trúc/test — kế thừa khung M99/M100/M101

Không migration, không API mới, không UI web mới (bảng điều khiển hiện rule pack version như cũ). Test: xunit Core (đóng polyline — bảng case gap/ngưỡng/reportOnly; blockMap matcher; layerMapper idempotent + regression; phép 17/18; idempotency pipeline); TS: validator v8 + test đối chứng 2 tầng normalizeCadLayers. Verify tay Adapter trên máy AutoCAD 2026 theo release (ràng buộc runner như M99 §18).

## 9. Kế hoạch slice/PR

| PR  | Nội dung                                                                                     | route:    |
| --- | -------------------------------------------------------------------------------------------- | --------- |
| PR1 | Rule pack v8 + validator 2 tầng + sửa idempotency layerMap (2 tầng) + phép kiểm 17/18 + test | `complex` |
| PR2 | Bước chuẩn hóa 12/13 (Core thuần + Adapter thi hành) + test idempotency pipeline             | `complex` |

## 10. Approval

- [x] Product/scope — Seeker 2026-08-25 ("duyệt hết, viết đặc tả trước rồi triển khai")
- [x] Architecture/data — không DDL, không API mới; rule pack mở rộng thuần
- [ ] Test/rollout — checklist verify tay Adapter theo release

**Kết luận:** Approved for implementation — **đã thi hành xong 2026-08-25** (PR #398).
**Người/ngày duyệt:** Seeker — 2026-08-25.

**Điểm lệch so với đặc tả khi thi hành** (ghi lại để không trôi):

1. **Bước 13 nối đuôi sau bước 11**, không chèn giữa bước 6 và 7 như §6.2 bản nháp — lý do đã ghi tại chính §6.2.
2. **Idempotency `layerMap` (§6.3) bỏ khỏi phạm vi**: rà code thật thấy M101 PR2 đã vá; PR này chỉ gỡ dòng `knownIssues` mô tả nợ đã đóng và thêm test canh bất biến ở mức pipeline.
3. **Hai PR gộp làm một** (#398): PR1 là Core thuần, PR2 là Adapter nối dây — tách đôi không kiểm chứng thêm được gì khi cả hai đều không chạy được cục bộ (không có .NET SDK).
