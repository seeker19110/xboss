# M109 — Đặc tả: nền cao độ cho tuyến & dẹp bịa tiết diện

| Thuộc tính       | Giá trị                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đưa **cao độ** thành dữ liệu có thật của tuyến (rule pack + XData) và **xoá mọi chỗ đang bịa** cao độ/tiết diện từ tên layer                                                              |
| Spec owner       | Phiên chính (tầng 1)                                                                                                                                                                      |
| State            | **Draft — chờ duyệt.** Không code khi chưa `Approved for implementation`                                                                                                                  |
| Người/ngày duyệt | (chờ)                                                                                                                                                                                     |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md` (**bản vẽ là nguồn sự thật, cấm bịa nội dung không có trong tệp**), ADR-0007/0008 (ranh giới miền)                                   |
| Phụ thuộc        | **M111** (nền cấu hình đa dự án) — `elevationBands` bản chất per-project: trần chung cư 2,8 m ≠ nhà xưởng 8 m                                                                             |
| Vị trí lộ trình  | **Mốc 1** của hướng auto-routing đã chốt 2026-08-27. Là **điều kiện tiên quyết** của M110 (solver định tuyến). Đứng một mình vẫn có giá trị: vá lỗi đang cho ra số sai trên màn hình thật |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

### 1.1 Chuẩn hoá xoá sạch cao độ — và không có chỗ nào giữ lại

Bước 4 pipeline chuẩn hoá, đọc thẳng từ `rule-packs/v9.json`:

```json
"flattenPolicy": { "targetElevation": 0, "applyTo": "mọi thực thể (elevation + toạ độ Z)" }
```

Chuẩn hoá **cố ý** ép mọi toạ độ Z về 0 — đúng chủ đích, vì bản vẽ 2D nộp phải phẳng. Nhưng hệ quả là
**không còn chỗ nào trong bản vẽ giữ cao độ**, trong khi cao độ là dữ kiện bắt buộc để:

- phát hiện clash **thật** giữa các hệ (clash 2D hiện có — phép kiểm 11 — mang sẵn cảnh báo cố định
  trong code: _"chỉ xét giao trên MẶT BẰNG — KHÔNG thay được clash 3D"_);
- dựng mặt cắt đúng;
- và về sau, để solver định tuyến (M110) biết hệ nào chạy tầng nào.

`drawTools` **không có một khoá cao độ nào** — kiểm bằng cách quét toàn bộ khối `drawTools` của v9.

### 1.2 XData đã có 2 khoá cao độ, nhưng không khoá nào dành cho tuyến

`XBoss.Cad.Core/Draw/VeXData.cs`:

| Khoá      | Ý nghĩa hiện tại                                                   | Đơn vị | Ai ghi            |
| --------- | ------------------------------------------------------------------ | ------ | ----------------- |
| `caodo`   | "Cao độ tim tuyến kỹ sư **NHẬP TAY** khi dựng mặt cắt" (M100 §6.4) | bản vẽ | `XBOSS_VE_MATCAT` |
| `caodomm` | "Cao độ lỗ chờ do kỹ sư **NHẬP TAY**"                              | **mm** | `XBOSS_VE_LOCHO`  |

Cả hai đều là **nhập tay, cho một mục đích hẹp**. Tuyến do `XBOSS_VE` vẽ ra **không mang cao độ nào**.

### 1.3 Chỗ nghiêm trọng nhất: đang BỊA số và số đó đi thẳng vào màn hình bóc khối lượng

`lib/ky-thuat/cad/dxf-parser.ts` → `convertDxfToSpatialRoutes()` (≈140 dòng) **đoán từ tên layer** rồi
gán số cứng:

```ts
let elevationBopMm = 2800;          // mặc định
if (layerUpper.includes("DUCT") || …) {
  sectionDimensions = "800 x 400 mm";  widthMm = 800;  heightOrDiaMm = 400;
  elevationBopMm = 2875;  corridorTier = "Tier 1 (Gió)";  combineStatus = "verified";
} else if (… "PIPE" …) {
  sectionDimensions = "Ø168 mm (DN150 Chiller)";  elevationBopMm = 2250; …
}
```

Nghĩa là **mọi** tuyến trên layer chứa `DUCT` đều được khai là ống gió **800×400 ở cao độ 2875**, bất kể
kích thước thật trong bản vẽ. Tệ hơn: nó tự gắn `combineStatus: "verified"`.

**Số bịa này không nằm im.** `app/engineering/cad-tracking/page.tsx:199` đọc `spatialRoutes` và dựng thẳng
bảng bóc khối lượng từ `sectionDimensions` / `widthMm` / `heightOrDiaMm` / `lengthMm`. Tức là màn hình
bóc khối lượng đang hiển thị **tiết diện bịa** cho người dùng.

Đây đúng lớp lỗi mà **ADR-0006 sinh ra để dẹp** ("DWG bị bịa nội dung") — nó sống sót và lọt vào một
màn hình thật.

### 1.4 Vì sao nó phải bịa: parser TS không đọc XData

`parseDxf` **không hề đọc XData** (không có xử lý mã nhóm 1001/1000 nào trong `dxf-parser.ts`). Nên dù
`XBOSS_VE` đã ghi `size` thật vào XData của từng tuyến, phía máy chủ không thấy — và phải đoán.

## 2. Outcome, metric và guardrail

- **O1** Mọi tuyến do `XBOSS_VE`/`XBOSS_VE_NHANTUYEN` sinh ra mang **cao độ tim** trong XData, kèm
  **nguồn gốc** cao độ (mặc định theo hệ hay người đặt).
- **O2** **0 chỗ** trong repo bịa cao độ hoặc tiết diện từ tên layer. Không đọc được thì trả **"chưa
  biết"**, không trả số.
- **O3** Màn hình `/engineering/cad-tracking` hiển thị đúng tiết diện thật khi bản vẽ do plugin vẽ; với
  bản vẽ không có XData thì hiện rõ "chưa biết — cần khai" thay vì một con số sai.
- **O4** Cao độ đọc lại được sau khi đóng/mở AutoCAD (sống trong DWG, không trong RAM).
- **Guardrail:** **hình học vẫn phẳng** — `flattenPolicy` giữ nguyên, không ghi Z vào toạ độ. Cao độ là
  **dữ liệu**, không phải hình học. Không lệnh nào của M109 sửa hình học tuyến.
- **Stop:** phát hiện M109 làm lệch kết quả `XBOSS_BOCKL` so với trước → dừng, vì bóc khối lượng là số
  đi vào thanh toán.

## 3. Nghiên cứu hiện trạng

| Thành phần                                       | Vai trò sau thay đổi                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `rule-packs/v9.json` → **v10**                   | Thêm `elevationBands` — nguồn sự thật duy nhất về cao độ theo hệ                           |
| `XBoss.Cad.Core/RulePack/RulePackLoader.cs`      | Thêm `ValidateCaoDoV10` (bám khuôn `ValidateChuanHoaV8` đang có)                           |
| `XBoss.Cad.Core/Draw/VeXData.cs`                 | Thêm khoá `caodotim` (mm) + `caodonguon`; **không đụng** `caodo`/`caodomm` đang dùng       |
| `XBoss.Cad.Acad/Commands/VeTuyenCommands.cs`     | `XBOSS_VE` gán cao độ mặc định theo hệ khi vẽ                                              |
| `XBoss.Cad.Acad/Commands/VeNhanTuyenCommands.cs` | `XBOSS_VE_NHANTUYEN` gán cao độ khi nhận tuyến người khác                                  |
| `lib/ky-thuat/cad/dxf-parser.ts`                 | **Đọc XData** (mã 1001/1000/1040/1070); `convertDxfToSpatialRoutes` **bỏ toàn bộ số cứng** |
| `app/engineering/cad-tracking/page.tsx`          | Hiện "chưa biết" cho tuyến không có XData; không cho bóc dòng chưa biết                    |
| `XBoss.Cad.Core/Inspection/PhepKiemMoRong.cs`    | Phép kiểm 11 (clash 2D) nhận thêm cao độ để **hạ mức cảnh báo** khi 2 hệ khác tầng cao độ  |

**Không có migration.** M109 không đụng cơ sở dữ liệu.

## 4. Phương án

| Điểm                  | Phương án                                                          | Kết luận                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cao độ sống ở đâu     | Toạ độ Z của hình học **vs** XData                                 | **XData.** `flattenPolicy` ép Z→0 là chủ đích và không mở lại; ghi Z vào hình học sẽ bị chính bước chuẩn hoá xoá mất ở lần chạy sau                                               |
| Khoá XData            | Tái dùng `caodomm` **vs** khoá mới                                 | **Khoá mới `caodotim`.** `caodomm` đã có nghĩa riêng ("cao độ lỗ chờ, **nhập tay**"); nhồi thêm nghĩa "cao độ tuyến, **máy gán**" vào một khoá là trộn hai nguồn gốc khác nhau    |
| Đơn vị                | Đơn vị bản vẽ **vs** mm                                            | **mm** — thống nhất với toàn bộ rule pack. Ghi nhận: `caodo` (mặt cắt) dùng đơn vị bản vẽ, đó là lý do phải tách khoá chứ không tái dùng                                          |
| Bản vẽ không có XData | Đoán như hiện tại **vs** trả "chưa biết"                           | **"Chưa biết".** Nguyên tắc nền ADR-0006. Một con số sai đi vào bóc khối lượng nguy hiểm hơn hẳn một ô trống                                                                      |
| Cao độ theo cái gì    | Theo **hệ** (HVAC/PIPING/…) **vs** theo **loại tuyến** (`lines[]`) | **Theo loại tuyến, có mặc định theo hệ.** Ống gió cấp và ống thoát nước cùng hệ HVAC/PIPING nhưng cao độ khác nhau; khai ở `lines[]` mới đủ mịn, thiếu thì rơi về mặc định của hệ |
| Ai được đổi cao độ    | Chỉ rule pack **vs** cho kỹ sư đè                                  | **Cho đè, nhưng ghi nguồn.** Thực tế luôn có đoạn phải hạ/nâng; `caodonguon` phân biệt `mac_dinh` với `nguoi_dat` để về sau biết chỗ nào đã có người quyết                        |

## 5. Scope / non-goals

**Trong phạm vi:** rule pack v10 `elevationBands` + validator; khoá XData `caodotim`/`caodonguon`; gán cao
độ khi vẽ và khi nhận tuyến; đổi cao độ cho tuyến đã có; đọc XData trong `parseDxf`; dẹp toàn bộ số cứng
trong `convertDxfToSpatialRoutes`; UI `cad-tracking` hiện "chưa biết"; phép kiểm 11 dùng cao độ để hạ mức
cảnh báo.

**Non-goals:** solver định tuyến (**M110**); phát hiện clash 3D đầy đủ (**M111**); ghi Z vào hình học;
đổi `flattenPolicy`; đổi `caodo`/`caodomm` đang dùng; 3D/BIM (non-goal vĩnh viễn từ M99); tự suy cao độ
từ bản vẽ thiết kế (không có dữ liệu để suy).

## 6. User journeys và mọi trạng thái

1. **Vẽ tuyến (`XBOSS_VE`):** chọn hệ + loại tuyến → plugin tra `elevationBands` → hiện cao độ sẽ gán
   ("Ống gió cấp — cao độ tim +2875 mm (mặc định của hệ)") → vẽ → XData mang `caodotim=2875`,
   `caodonguon=mac_dinh`. Rule pack chưa khai cao độ cho loại tuyến đó → vẫn vẽ được, XData **không có**
   `caodotim`, và báo một dòng cho kỹ sư biết.
2. **Đổi cao độ (`XBOSS_VE_DOI`, mở rộng):** chọn tuyến → nhập cao độ mới → ghi `caodotim` +
   `caodonguon=nguoi_dat`. 1 nhóm UNDO. **Không đụng hình học.**
3. **Nhận tuyến người khác (`XBOSS_VE_NHANTUYEN`):** như journey 1 — tuyến nhận vào cũng có cao độ.
4. **Xem lại:** `XBOSS_BANG` tab Trạng thái hiện cao độ của tuyến đang chọn kèm nguồn gốc.
5. **Máy chủ đọc bản vẽ:** `parseDxf` đọc XData → `spatialRoutes` mang **cao độ và tiết diện thật**.
   Không có XData → các trường đó **null**, `combineStatus: "unknown"`.
6. **Bóc khối lượng trên web:** dòng có dữ liệu thật → bóc bình thường; dòng `unknown` → hiện rõ "chưa
   biết — bản vẽ này không do plugin vẽ", **không cho tick bóc** cho tới khi người khai tay.
7. **Trạng thái lỗi:** rule pack cũ (< v10) → lệnh vẫn chạy, chỉ không gán cao độ, báo một dòng;
   `elevationBands` khai sai (cao độ âm, trùng dải) → validator chặn ngay lúc nạp rule pack.

## 7. Functional / non-functional requirements

- **FR1** `elevationBands` khai được cao độ tim (mm) cho **từng loại tuyến** trong `drawTools.systems[].lines[]`,
  kèm mặc định cấp hệ.
- **FR2** `XBOSS_VE` gán `caodotim` + `caodonguon=mac_dinh` cho **mọi** tuyến vẽ mới khi rule pack có khai.
- **FR3** `XBOSS_VE_DOI` đổi được cao độ, ghi `caodonguon=nguoi_dat`, **không đụng hình học**, 1 nhóm UNDO.
- **FR4** `XBOSS_VE_NHANTUYEN` gán cao độ y hệt FR2.
- **FR5** `parseDxf` đọc được XData appname `XBOSS_VE` của thực thể (mã nhóm 1001 + 1000/1040/1070).
- **FR6** `convertDxfToSpatialRoutes` **không còn một hằng số cứng nào** cho cao độ/tiết diện/`corridorTier`.
  Không đọc được ⇒ trường null + `combineStatus: "unknown"`.
- **FR7** UI `cad-tracking` không cho bóc dòng `unknown`, và nói rõ vì sao.
- **FR8** Phép kiểm 11 (clash 2D): hai tim giao nhau trên mặt bằng nhưng **cách nhau về cao độ** vượt
  ngưỡng khai trong rule pack ⇒ hạ từ "phát hiện" xuống "ghi chú", kèm số cao độ hai bên. Vẫn **không**
  tuyên bố là clash 3D đầy đủ — cảnh báo cố định của phép kiểm 11 giữ nguyên.
- **FR9** Rule pack < v10 ⇒ mọi thứ chạy y như trước, không lỗi (tương thích ngược tuyệt đối).

**NFR1** Đọc XData không làm `parseDxf` chậm quá 10% trên bộ bản vẽ mẫu `plugin-autocad/mau-ban-ve/`.
**NFR2** Toàn bộ logic tra cao độ là **thuần**, nằm ở Core ⇒ test trên CI Linux không cần AutoCAD.
**NFR3** Mọi nhãn/thông báo tiếng Việt.

## 8. Acceptance criteria

- **AC1** Vẽ 1 tuyến ống gió cấp bằng `XBOSS_VE` → XData có `caodotim` đúng số khai trong v10,
  `caodonguon=mac_dinh`.
- **AC2** `XBOSS_VE_DOI` đổi cao độ → `caodonguon=nguoi_dat`; **toạ độ mọi đỉnh không đổi một chữ số nào**.
- **AC3** Đóng AutoCAD, mở lại → cao độ vẫn đọc được (sống trong DWG).
- **AC4** `parseDxf` trên DXF do plugin xuất → `spatialRoutes[].elevationBopMm` và `sectionDimensions`
  **khớp XData**, không phải số cứng.
- **AC5 (then chốt)** `parseDxf` trên DXF **bất kỳ không có XData** → mọi trường cao độ/tiết diện là
  `null`, `combineStatus: "unknown"`. **Grep toàn repo không còn `2875`/`2250`/`"800 x 400 mm"` như hằng số.**
- **AC6** `/engineering/cad-tracking` với bản vẽ không XData → không tick bóc được, có thông điệp giải thích.
- **AC7** Rule pack v9 (cũ) → toàn bộ lệnh chạy y hệt trước M109; không lệnh nào từ chối chạy.
- **AC8** `elevationBands` khai sai (cao độ âm / hai dải chồng nhau cùng loại tuyến) → validator chặn,
  nêu rõ khoá sai.
- **AC9** Phép kiểm 11 trên 2 tuyến giao mặt bằng nhưng lệch cao độ > ngưỡng → xuống "ghi chú" kèm 2 số
  cao độ; lệch dưới ngưỡng → vẫn là "phát hiện".
- **AC10** `XBOSS_BOCKL` cho ra **đúng con số như trước M109** trên bộ bản vẽ đối chứng (M109 không được
  làm lệch bóc khối lượng).

## 9. Kiến trúc và điểm chạm code

```
rule-packs/v10.json  ── elevationBands ──┐
                                          ├─→ Core: TraCaoDo (thuần, test CI)
XData caodotim/caodonguon ────────────────┘        │
                                                    ├─→ Adapter: XBOSS_VE / _DOI / _NHANTUYEN
                                                    └─→ Inspection: phép kiểm 11 hạ mức

parseDxf ── đọc XData (1001/1000) ──→ convertDxfToSpatialRoutes (KHÔNG còn số cứng)
                                              └─→ /engineering/cad-tracking (hiện "chưa biết")
```

| Việc                    | Tệp                                                               |
| ----------------------- | ----------------------------------------------------------------- |
| Rule pack v10           | `lib/ky-thuat/cad/rule-packs/v10.json` + `rule-pack-hien-hanh.ts` |
| Validator C#            | `XBoss.Cad.Core/RulePack/RulePackLoader.cs` (`ValidateCaoDoV10`)  |
| Tra cao độ (thuần)      | **mới** `XBoss.Cad.Core/Draw/CaoDoTuyen.cs`                       |
| Khoá XData              | `XBoss.Cad.Core/Draw/VeXData.cs`                                  |
| Gán khi vẽ / nhận / đổi | `VeTuyenCommands.cs`, `VeNhanTuyenCommands.cs`                    |
| Đọc XData phía TS       | `lib/ky-thuat/cad/dxf-parser.ts` (**mới** `docXData`)             |
| Dẹp số cứng             | `lib/ky-thuat/cad/dxf-parser.ts` (`convertDxfToSpatialRoutes`)    |
| UI bóc                  | `app/engineering/cad-tracking/page.tsx`                           |
| Phép kiểm 11            | `XBoss.Cad.Core/Inspection/PhepKiemMoRong.cs`                     |

## 10. API contract

**Không có route mới.** `parseDxf` đổi **hình dạng dữ liệu trả về** (`Extruded3dRoute`):

| Trường                                            | Trước                         | Sau              |
| ------------------------------------------------- | ----------------------------- | ---------------- |
| `elevationBopMm`                                  | `number` (bịa)                | `number \| null` |
| `sectionDimensions` / `widthMm` / `heightOrDiaMm` | `string/number` (bịa)         | `… \| null`      |
| `corridorTier`                                    | enum (bịa)                    | `… \| null`      |
| `combineStatus`                                   | `clean\|clash_risk\|verified` | thêm `"unknown"` |

Đây là **breaking change ở tầng kiểu**; mọi nơi đọc phải xử lý `null` — `check:dead-code` +
`typecheck` sẽ chỉ ra hết.

## 11. Data contract và DDL

**Không có migration.** Hợp đồng dữ liệu mới nằm ở rule pack:

```jsonc
"elevationBands": {
  "source": "M109 — cao độ tim tuyến theo loại tuyến, đơn vị mm, mốc là cốt sàn hoàn thiện của tầng",
  "datum": "san_hoan_thien",
  "clashToleranceMm": 100,        // lệch cao độ ≤ ngưỡng này thì phép kiểm 11 vẫn coi là đáng ngờ
  "systems": {
    "HVAC":         { "default": 2875, "lines": { "duct-supp": 2875, "duct-retn": 2800, "duct-exht": 2750 } },
    "PIPING":       { "default": 2600, "lines": { "chw-pipe": 2600 } },
    "FIREFIGHTING": { "default": 2700 },
    "ELECTRICAL":   { "default": 2900 }
  }
}
```

**Khoá này khai ở LỚP DỰ ÁN của M111, không phải lõi công ty** — cao độ tầng là thứ mỗi dự án một khác
(chung cư trần 2,8 m so với nhà xưởng 8 m). Lõi công ty chỉ khai `datum` và `clashToleranceMm` làm mặc
định; `systems[]` để rỗng và mỗi dự án tự đè.

> Các con số trên là **giá trị mẫu để minh hoạ cấu trúc**. Bảng phân tầng cao độ thật của dự án là việc
> của kỹ sư trưởng — **không** lấy số hard-code cũ trong `dxf-parser.ts` làm chuẩn, vì chính chúng là thứ
> đặc tả này sinh ra để dẹp.

XData bổ sung (`VeXData.cs`), theo đúng khuôn `khoa=giatri` đang dùng:

| Khoá         | Kiểu   | Đơn vị | Nghĩa                     |
| ------------ | ------ | ------ | ------------------------- |
| `caodotim`   | double | **mm** | Cao độ tim tuyến          |
| `caodonguon` | text   | —      | `mac_dinh` \| `nguoi_dat` |

## 12. Security / privacy / abuse

Không mở đường mạng mới, không đụng quyền, không đụng DB. Rủi ro duy nhất là **rủi ro dữ liệu**: đổi
`Extruded3dRoute` thành nullable có thể làm chỗ đọc cũ hiển thị rỗng — đã phủ bằng typecheck + AC6.

## 13. UX / a11y / content

Bám `app/components/ui/` (ADR-0009), dark-first, không `dark:`, không hex cứng (ADR-0010). Dòng "chưa
biết" trong bảng bóc dùng **icon + chữ**, không chỉ màu. Hộp thoại đổi cao độ theo khung M106 (ViewModel
thuần ở Core + `DataTemplate`), có đường lui `XBOSS_UI_DIALOG=0`.

## 14. Observability và vận hành

Báo cáo phiên vẽ (`VeSessionReport`) thêm dòng: bao nhiêu tuyến có cao độ mặc định, bao nhiêu do người
đặt, bao nhiêu **không có**. Con số thứ ba là chỉ báo rule pack khai thiếu.

## 15. Test plan

1. **Thuần (xunit, CI Linux):** `CaoDoTuyen` tra đúng theo `lines` → rơi về `default` → không khai thì
   null; validator bắt cao độ âm/dải chồng; mã hoá/giải mã XData khứ hồi.
2. **Thuần (node:test):** `docXData` đọc đúng DXF có XData; `convertDxfToSpatialRoutes` trả null cho DXF
   không XData; **ca canh chống tái phạm: grep chính mã nguồn, không cho phép hằng số cao độ/tiết diện quay lại**.
3. **Đối chứng:** chạy `XBOSS_BOCKL` trên bộ mẫu trước/sau M109, **số phải khớp tuyệt đối** (AC10).
4. **e2e:** `/engineering/cad-tracking` với 2 tệp — một do plugin vẽ, một không — kiểm 2 hành vi khác nhau.
5. **Verify tay** (§18): AC1–AC3, AC9 cần AutoCAD thật.

Cổng: đủ **14 cổng của job `static`** trong `.github/workflows/ci.yml` + `test (Postgres)` (gồm
`check:coverage` và `gen:erd`) + `plugin` + `plugin-shim`. _(Ghi ở đây vì đợt M108 đã trượt CI hai lần do
chạy cổng theo trí nhớ thay vì theo `ci.yml`.)_

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                                                            | route đề nghị |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| PR1 | Rule pack v10 `elevationBands` + `ValidateCaoDoV10` + `CaoDoTuyen` (thuần) + khoá XData + test (1). Chưa đụng Adapter, chưa đụng TS | `spec`        |
| PR2 | Adapter: `XBOSS_VE`/`_NHANTUYEN` gán cao độ, `XBOSS_VE_DOI` đổi cao độ + hộp thoại M106 + báo cáo phiên vẽ                          | `spec`        |
| PR3 | `parseDxf` đọc XData + **dẹp toàn bộ số cứng** + UI `cad-tracking` + test (2)(4)                                                    | `complex`     |
| PR4 | Phép kiểm 11 dùng cao độ để hạ mức cảnh báo (FR8/AC9)                                                                               | `standard`    |

**PR3 đứng riêng có ích nhất** — nó vá lỗi đang cho ra số sai trên màn hình thật, kể cả khi bạn dừng lộ
trình auto-routing tại đây.

## 17. Rollout / rollback

Rule pack có version nên rollback = phát hành lại v9: mọi lệnh quay về hành vi cũ, XData thừa bị bỏ qua
(bộ giải mã đã bỏ qua khoá lạ). PR3 không có đường lui bằng cấu hình — nhưng nó **chỉ đổi từ số sai sang
ô trống**, nên "hồi quy" tệ nhất cũng an toàn hơn hiện trạng.

## 18. Risk / assumption / open decisions

| #      | Rủi ro / giả định                                                                           | Xử lý                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R1     | Đổi `Extruded3dRoute` sang nullable làm vỡ chỗ đọc cũ                                       | typecheck bắt hết; chỉ có 1 nơi tiêu thụ (`cad-tracking/page.tsx`)                                                                              |
| R2     | Người dùng đang tin vào số bóc hiện tại của `cad-tracking`                                  | **Phải nói rõ khi phát hành**: số cũ là số bịa. Đây là sửa lỗi, không phải mất tính năng                                                        |
| R3     | Kỹ sư trưởng chưa có bảng phân tầng cao độ chuẩn                                            | v10 khai được **rỗng**; thiếu thì không gán, báo một dòng — không chặn ai                                                                       |
| **O1** | **Mốc cao độ (`datum`) tính từ đâu:** cốt sàn hoàn thiện, cốt sàn thô, hay cốt 0.000 dự án? | **Cần bạn/kỹ sư trưởng chốt trước PR1.** Đặc tả đang giả định _cốt sàn hoàn thiện của tầng_                                                     |
| **O2** | Cao độ khai là **tim ống** hay **đáy ống (BOP)**?                                           | **Cần chốt.** `Extruded3dRoute` đang gọi là `elevationBopMm` (đáy), XData M100 gọi là "cao độ tim" — hai thứ khác nhau, phải thống nhất một lần |

> ⛔ **Điều kiện tiên quyết ngoài phạm vi đặc tả:** plugin **chưa từng chạy trên máy có AutoCAD 2026**
> ("verify tay" — 21 lần ghi nợ trong `PROGRESS.md`). PR2 thao tác trên bản vẽ thật; nên chạy verify tay
> **trước** PR2, hoặc chấp nhận PR2 chỉ được kiểm bằng `AcadShim` (chỉ bắt lỗi biên dịch).

## 19. Approval

- [ ] Người duyệt: ……… — ngày ………
- [ ] Chốt O1 (mốc cao độ) và O2 (tim hay đáy ống) — **chặn PR1**
- [ ] Xác nhận **M111 PR1–PR2 đã xong** (chỗ chứa cấu hình theo dự án) trước khi bắt đầu PR1
- [ ] Chuyển State thành `Approved for implementation` trước khi code
