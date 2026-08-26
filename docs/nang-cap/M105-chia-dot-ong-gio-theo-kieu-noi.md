# M105 — Đặc tả Tự động phân chia đốt ống gió theo kiểu kết nối (Duct Joint Segmentation)

| Thuộc tính       | Giá trị                                                                                                                     |
| :--------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Tuyến ống gió vẽ bằng `XBOSS_VE` (M100) tự động được chia thành các **đốt chế tạo** theo kiểu kết nối (nẹp C / TDC / mặt bích V…), sinh bảng đốt + phụ kiện mối nối phục vụ gia công xưởng và bóc khối lượng |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                         |
| State            | **Draft — chờ duyệt** (các giá trị đánh dấu ⚠GIẢ ĐỊNH cần người dùng chốt trước khi Approved for implementation)              |
| Người/ngày duyệt | (chưa)                                                                                                                       |
| Cập nhật         | 2026-08-26                                                                                                                   |
| Phụ thuộc        | M100 (XBOSS_VE + XData tim tuyến + rule pack v7), M74 (mẫu engine chia đốt `segmentPipelineIntoSpools`), M99 (hạ tầng plugin) |

> Không code khi chưa **Approved for implementation**.

---

## 1. Vấn đề, vai trò và bằng chứng

- **Kỹ sư shop drawing:** sau khi vẽ tuyến ống gió 2D (`XBOSS_VE`, tim + 2 nét biên), việc chia đốt để đặt gia công hiện làm **thủ công**: đo chiều dài tuyến, tự trừ phụ kiện (co/tê/chuyển cỡ), tự nhớ chiều dài tối đa theo kiểu nối, kẻ vạch chia và đánh số từng đốt bằng tay. Sai phổ biến: quên trừ khe gioăng TDC nên tuyến dài hơn thực tế; đốt cuối lọt cỡ 80–150 mm không chế tạo được; chọn nhầm kiểu nối so với size (ống lớn dùng nẹp C bung mối).
- **QS/xưởng:** không có bảng đốt chuẩn (số đốt, chiều dài từng đốt, kiểu nối, phụ kiện mối nối: thanh nẹp, ke góc, bulông, gioăng) → bóc tôn/phụ kiện bằng ước lượng, lệch 5–10 %.
- **Non-goal của M100 giữ nguyên:** plugin **không tự thiết kế tuyến** (auto-routing). M105 chỉ chia đốt **trên tuyến kỹ sư đã vẽ** — không đổi hình học tim, không né vật cản.

## 2. Outcome, metric và guardrail

- **Target:** 100 % tuyến ống gió vẽ bằng `XBOSS_VE` chia đốt được bằng 1 lệnh; bảng đốt xuất ra khớp tay đo ±1 mm/đốt; tổng chiều dài các đốt + khe mối nối = chiều dài đoạn thẳng của tuyến (bất biến số học — có test).
- **Guardrail:** lệnh chia đốt **không sửa/xóa** tim và nét biên đã vẽ (chỉ THÊM vạch chia + tag trên layer riêng); 1 lệnh = 1 nhóm UNDO (như M100 AC1); không có rule pack phần `ductJoints` → lệnh từ chối chạy kèm hướng dẫn, không đoán mặc định ngầm.
- **Rollback:** tính năng thuần cộng thêm (lệnh mới + trường rule pack mới + bảng DB mới); tắt bằng cách phát hành rule pack không có `ductJoints`.

## 3. Nghiên cứu hiện trạng

- `plugin-autocad/XBoss.Cad.Acad/Commands/VeTuyenCommands.cs` — `XBOSS_VE` vẽ polyline tim mang XData `[systemId, itemId, size, rulePackVersion, custom?, slope?]`; loại tuyến `edgeStyle: "double"` (ống gió) có 2 nét biên trên layer `-EDGE` (không bao giờ bóc).
- `plugin-autocad/XBoss.Cad.Core/Draw/` — `DrawSize.cs` parse size `WxH`; `SupportSpacing.cs` là mẫu gần nhất: chạy dọc tuyến, đặt đối tượng cách đều theo tham số rule pack (M100 §FR — `supportSpacingMm`). M105 tái dùng đúng kiến trúc này: **hình học chia đốt tính ở Core (thuần, test được), Acad chỉ vẽ**.
- `lib/ky-thuat/engineering-pipe-spooling-qto.ts` — `segmentPipelineIntoSpools()` (M74) chia đốt ống nước theo maxLen/maxWeight; **không áp cho ống gió** (không có khái niệm kiểu nối/khe gioăng/đốt theo tấm tôn). M105 viết engine riêng nhưng bám cùng phong cách (input thuần → output thuần + `engineeringRationale`/`warnings`).
- `lib/ky-thuat/engineering-auto-routing.ts` (M77) — chỉ sinh waypoint 3D, không liên quan chia đốt; không đụng.
- Migration hiện tại đến `0142` → M105 dùng **`0143`**.

## 4. Phương án

| Phương án                                                                 | Lợi ích                                              | Chi phí/rủi ro                                                     | Kết luận |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Không làm                                                                  | 0                                                    | Tiếp tục chia tay, sai số mối nối                                  | Loại     |
| A. Chia đốt chỉ trong plugin CAD (không server)                            | Nhanh, offline                                       | Không có bảng đốt tập trung cho QS/xưởng, không QTO                | Loại     |
| B. Chia đốt chỉ trên server (upload DXF → trả bảng đốt)                    | Không đụng plugin                                    | Kỹ sư không thấy vạch chia/tag trên bản vẽ — mất giá trị shop drawing | Loại     |
| **C. Engine hình học thuần ở `XBoss.Cad.Core` + engine TS mirror ở `lib/ky-thuat/` dùng chung tham số rule pack; plugin vẽ vạch chia/tag, server lưu bảng đốt khi `XBOSS_BOCKL`/upload** | Một nguồn tham số (rule pack), cả CAD lẫn web đều đúng | Phải giữ 2 bản engine (C# + TS) khớp nhau — khóa bằng bộ test vector chung (§8 AC10) | **Chọn** |

## 5. Scope / non-goals

**Trong phạm vi:** trường rule pack `drawTools.systems[].lines[].ductJoints`; engine chia đốt thuần (C# + TS) theo kiểu nối; lệnh `XBOSS_VE_CHIADOT` (chia + vẽ vạch/tag) và tham gia `XBOSS_VE_THONGKE` (bảng đốt trong bản vẽ); API + bảng DB lưu kết quả chia đốt; trang web xem bảng đốt theo bản vẽ; QTO phụ kiện mối nối (thanh nẹp/TDC cleat/ke góc/bulông/gioăng) theo bảng định mức trong rule pack.

**Non-goals:** tự thiết kế tuyến (auto-routing — non-goal M100 giữ nguyên); khai triển tấm tôn (unfold/nesting 2D — để đợt sau, đã có nền 1D nesting M74); chia đốt phụ kiện (co/tê/chuyển cỡ là 1 khối chế tạo riêng, không cắt); ống gió tròn xoắn (spiral — danh mục nối khác, đợt sau); tính áp suất/độ kín theo cấp SMACNA (chỉ ghi chú cấp áp nếu rule pack khai).

## 6. User journeys và mọi trạng thái

1. **Happy (CAD):** kỹ sư vẽ tuyến gió cấp 800×400 dài 7,2 m bằng `XBOSS_VE` → gõ `XBOSS_VE_CHIADOT` → chọn tuyến (hoặc quét cả hệ) → plugin đọc size từ XData, tra `ductJoints` → kiểu nối TDC (cạnh lớn 800 thuộc dải TDC) → chia 7 đốt (6×1110 + 1 đốt 498 sau khi trừ khe gioăng), vẽ vạch chia vuông góc tim trên layer `<layer>-JOINT`, tag `D-SAD-001-01…07` cạnh từng đốt, in tóm tắt ra command line. ESC giữa chừng → không để lại gì (hỏi đáp ngoài transaction, như M100 §6.11).
2. **Chạy lại trên tuyến đã chia:** xóa vạch/tag cũ của đúng tuyến đó (nhận qua XData liên kết) rồi chia lại — idempotent, không nhân đôi.
3. **Size ngoài danh mục (`custom`):** vẫn chia nếu parse được `WxH`; cảnh báo "size custom — tự kiểm kiểu nối" và ghi cờ vào tag XData + báo cáo phiên vẽ.
4. **Đoạn ngắn hơn đốt tối thiểu:** không chia, cảnh báo (vd đoạn nối 300 mm giữa 2 co → 1 đốt duy nhất).
5. **Web:** sau `XBOSS_BOCKL`/upload, Admin/PM/kỹ sư mở trang bản vẽ → tab "Bảng đốt ống gió": danh sách đốt theo hệ, tổng phụ kiện mối nối; export Excel. Trạng thái loading dùng `Skeleton`, rỗng/lỗi có thông điệp tiếng Việt; 401 redirect `/login`; viewer/bch/cdt chỉ xem.

## 7. Functional & non-functional requirements

### 7.1 Danh mục kiểu kết nối (người dùng đã chốt phần in đậm)

| `jointType`  | Tên hiển thị           | **Chiều dài đốt tối đa** (mm) | Khe mối nối `jointGapMm` | Dải áp dụng theo cạnh lớn (mm) |
| ------------ | ----------------------- | ----------------------------- | ------------------------- | ------------------------------- |
| `nep_c`      | Nẹp C (S-slip & C-cleat)| **1180**                      | ⚠GIẢ ĐỊNH 0               | ⚠GIẢ ĐỊNH ≤ 450                 |
| `tdc`        | TDC (Transverse Duct Connector) | **1110**              | ⚠GIẢ ĐỊNH 5 (gioăng)      | ⚠GIẢ ĐỊNH 451 – 1500            |
| `mat_bich_v` | Mặt bích V (thép góc)   | **1180**                      | ⚠GIẢ ĐỊNH 5 (gioăng)      | ⚠GIẢ ĐỊNH > 1500                |

- **FR1** Kiểu nối chọn **tự động theo cạnh lớn** của size (`WxH` — max(W,H)) qua bảng `sizeRangeMm` trong rule pack; kỹ sư được **ghi đè tay** khi chạy lệnh (prompt mặc định = kiểu tự chọn). Bảng trên là **default do rule pack phát hành quyết định** — 3 con số max length là dữ liệu người dùng chốt, các cột ⚠ phải được duyệt.
- **FR2** Công thức chia 1 đoạn thẳng dài `L` (giữa 2 điểm gãy của polyline, hoặc giữa mép phụ kiện nếu tuyến có block phụ kiện chèn — M100 PR4):
  `n = ceil(L / (maxLenMm + jointGapMm))`; chia **đều** `pieceLen = (L − (n−1)·jointGapMm) / n` (làm tròn 0,1 mm; đốt cuối nhận phần dư làm tròn) — tránh đốt cụt, giống triết lý chia đều của M74. Bất biến: `Σ pieceLen + (n−1)·jointGapMm = L` (±0,5 mm tích lũy làm tròn).
- **FR3** `minPieceLenMm` (⚠GIẢ ĐỊNH **200**): đoạn `L < minPieceLenMm` → 1 đốt duy nhất + warning; không bao giờ sinh đốt < min (chia đều đã bảo đảm vì pieceLen ≥ L/n ≥ maxLen/2 khi n ≥ 2).
- **FR4** Mỗi điểm gãy (vertex) của polyline tim là **ranh giới đốt bắt buộc** (co ghép tại điểm gãy); bulge/cung tròn → từ chối chia đoạn đó kèm cảnh báo (ống gió 2D không vẽ cung).
- **FR5** Vẽ: vạch chia = line vuông góc tim, dài đúng bề rộng W (chạm 2 nét biên), trên layer `<layerTim>-JOINT` (linetype/màu khai trong rule pack `ductJoints.layerStyle`); tag đốt = text/block `D-<itemId>-<sốTuyến>-<sốĐốt>` cạnh trung điểm đốt. Layer `-JOINT` **không được khớp** bất kỳ `takeoff.layerMatchAny` nào (kiểm khi phát hành rule pack — cùng cơ chế M100 FR4 với `-EDGE`).
- **FR6** XData 2 chiều: vạch/tag mang handle tim + chỉ số đốt; tim mang version chia đốt — để chạy lại idempotent (journey 2) và `XBOSS_BOCKL` đọc được bảng đốt.
- **FR7** QTO phụ kiện mối nối: mỗi mối nối (n−1 mối giữa các đốt trong 1 đoạn; mối tại vertex/phụ kiện đếm 1 lần, không đếm đôi) sinh định mức theo `jointType` từ bảng `ductJoints.hardware` trong rule pack — vd TDC: 4 ke góc + 8 bulông M8 + gioăng theo chu vi `2(W+H)`; nẹp C: 2 thanh nẹp dài W (+ ⚠GIẢ ĐỊNH 2 thanh S-slip dài H); mặt bích V: khung thép góc chu vi + bulông bước ⚠GIẢ ĐỊNH 100 mm. Toàn bộ hệ số nằm trong rule pack, engine không hard-code.
- **FR8** Server: engine TS mirror `segmentDuctRunIntoJoints()` trong `lib/ky-thuat/engineering-duct-segmentation.ts` (tầng 4 `ky-thuat`, thuần — không chạm DB) + service ghi DB; API §10. Kết quả lưu khi plugin `XBOSS_BOCKL` đẩy lên hoặc gọi trực tiếp API.
- **FR9** Cấp áp suất (tùy chọn): rule pack có thể khai `pressureClassPa` theo line; nếu khai và cạnh lớn vượt ngưỡng của kiểu nối đang chọn → warning (không chặn).
- **NFR1** Engine C# và TS cho **cùng input phải ra cùng output** — bộ test vector JSON chung (`plugin-autocad/testdata/duct-joints/*.json`, đọc bởi cả `tests/engineering-duct-segmentation.test.ts` lẫn unit test C#).
- **NFR2** Chia 500 đoạn < 1 s trong CAD; API trả < 500 ms cho 1 bản vẽ.
- **NFR3** A11y/i18n: mọi nhãn tiếng Việt; trang web đạt chuẩn theme dark-first, dùng bộ `app/components/ui/`.

## 8. Acceptance criteria (Given/When/Then — mỗi AC map tới test)

- **AC1** Đoạn thẳng 7200, TDC (max 1110, gap 5): n = ceil(7200/1115) = 7; pieceLen = (7200 − 6·5)/7 = 1024,3; Σ kiểm bất biến FR2. → test vector `tdc-7200.json`.
- **AC2** Đoạn 1180, nẹp C: đúng 1 đốt 1180, 0 mối nối.
- **AC3** Đoạn 1181, nẹp C (gap 0): n = 2, mỗi đốt 590,5.
- **AC4** Đoạn 150 < min 200: 1 đốt + warning `dot_ngan_hon_toi_thieu`.
- **AC5** Size 800×400 → tự chọn TDC; kỹ sư ghi đè `mat_bich_v` → dùng 1180/gap của mặt bích V, tag ghi kiểu ghi đè.
- **AC6** Polyline 3 vertex (2 đoạn): mỗi đoạn chia độc lập, vertex là ranh giới, không có mối nối "xuyên" vertex; tổng mối = Σ(nᵢ−1).
- **AC7** Chạy `XBOSS_VE_CHIADOT` 2 lần trên cùng tuyến: số vạch/tag không đổi (idempotent); 1 lần UNDO xóa trọn kết quả lần chạy (vạch + tag).
- **AC8** Rule pack thiếu `ductJoints` hoặc line không phải ống gió (`edgeStyle` ≠ `double`): lệnh từ chối, thông báo rõ, không sửa bản vẽ.
- **AC9** API POST bảng đốt: chưa đăng nhập → 401; viewer → 403; payload Σ không khớp bất biến FR2 → 422.
- **AC10** Cùng bộ test vector, engine C# và TS ra kết quả giống nhau từng số (±0,1 mm).
- **AC11** QTO: tuyến AC1 với định mức TDC mẫu → đúng 6 mối × (4 ke + 8 bulông) + gioăng 6 × 2(0,8+0,4) = 14,4 m.

## 9. Kiến trúc và điểm chạm code

| Tầng    | File (dự kiến)                                                              | Nội dung                                                                                       |
| ------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Core C# | `plugin-autocad/XBoss.Cad.Core/Draw/DuctJointConfig.cs`                      | Parse + validate `ductJoints` của rule pack (theo mẫu `DrawToolsConfig.cs`)                    |
| Core C# | `plugin-autocad/XBoss.Cad.Core/Draw/DuctJointSegmenter.cs`                   | Engine hình học thuần (FR1–FR4, FR7) — không tham chiếu AutoCAD API                            |
| Acad C# | `plugin-autocad/XBoss.Cad.Acad/Commands/VeChiaDotCommands.cs`                | Lệnh `XBOSS_VE_CHIADOT`: chọn tuyến → gọi Core → vẽ vạch/tag/XData (FR5–FR6), 1 UNDO group     |
| Acad C# | `ThongKeTable.cs` (sửa)                                                      | `XBOSS_VE_THONGKE` thêm bảng đốt khi bản vẽ có dữ liệu chia đốt                                |
| lib TS  | `lib/ky-thuat/engineering-duct-segmentation.ts`                              | `segmentDuctRunIntoJoints()` + `explodeJointHardware()` (thuần) + hàm ghi/đọc DB               |
| Route   | `app/api/engineering/duct-joints/route.ts`                                   | §10 — auth + gọi lib, `export const dynamic = "force-dynamic"`                                 |
| UI      | `app/engineering/duct-joints/page.tsx` (hoặc tab trong trang bản vẽ hiện có) | Bảng đốt + tổng phụ kiện + export                                                              |
| Test    | `tests/engineering-duct-segmentation.test.ts` + test vector JSON chung       | AC1–AC6, AC10, AC11 (import `tests/setup.ts` đầu tiên nếu chạm DB)                             |

## 10. API contract

`POST /api/engineering/duct-joints` — plugin (token thiết bị như `XBOSS_BOCKL`) hoặc session Admin/PM/engineer. Body: `{ drawingId, rulePackVersion, runs: [{ systemId, itemId, size, jointType, overridden, segments: [{ lengthMm, pieces: [..], gapMm }] }] }`. Idempotent theo `(drawingId, runKey)` — upsert thay bản cũ. 401/403/422 như AC9.
`GET /api/engineering/duct-joints?drawingId=` — trả bảng đốt + hardware tổng hợp; mọi vai trò đăng nhập được xem (viewer read-only). Scope theo project qua `withProjectScope`.

## 11. Data contract và DDL — `migrations/0143_duct_joint_segmentation.sql`

```sql
CREATE TABLE IF NOT EXISTS engineering_duct_joint_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id),
  drawing_id UUID NOT NULL,           -- FK tới bảng bản vẽ hiện hành (khớp lúc thi hành)
  run_key TEXT NOT NULL,              -- handle tim + itemId — idempotency
  system_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  size TEXT NOT NULL,                 -- 'WxH'
  joint_type TEXT NOT NULL CHECK (joint_type IN ('nep_c','tdc','mat_bich_v')),
  overridden BOOLEAN NOT NULL DEFAULT FALSE,
  rule_pack_version TEXT NOT NULL,
  total_length_mm NUMERIC(12,1) NOT NULL,
  piece_count INT NOT NULL,
  joint_count INT NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, run_key)
);
CREATE TABLE IF NOT EXISTS engineering_duct_joint_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES engineering_duct_joint_runs(id) ON DELETE CASCADE,
  piece_index INT NOT NULL,
  length_mm NUMERIC(12,1) NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE (run_id, piece_index)
);
CREATE INDEX IF NOT EXISTS idx_duct_joint_runs_drawing ON engineering_duct_joint_runs(drawing_id);
```

Hardware QTO **không lưu bảng riêng** — suy ra từ runs × định mức rule pack lúc đọc (một nguồn sự thật, đổi định mức không phải backfill). Migration thuần cộng thêm → đi thẳng production theo DoD. RLS/policy theo mẫu `0092` cho bảng `engineering_*`.

## 12. Rule pack (v8) — phần khai mới

```jsonc
// drawTools.systems[].lines[] (chỉ line edgeStyle="double" hệ gió):
"ductJoints": {
  "selection": [                       // chọn theo cạnh lớn — dải không chồng nhau, phủ kín
    { "jointType": "nep_c",      "maxSideMm": 450,  "maxLenMm": 1180, "jointGapMm": 0 },
    { "jointType": "tdc",        "maxSideMm": 1500, "maxLenMm": 1110, "jointGapMm": 5 },
    { "jointType": "mat_bich_v", "maxSideMm": null, "maxLenMm": 1180, "jointGapMm": 5 }
  ],
  "minPieceLenMm": 200,
  "layerStyle": { "suffix": "-JOINT", "color": 8, "linetype": "DASHED" },
  "hardware": {
    "nep_c":      [{ "item": "thanh-nep-c", "perJoint": "2*W" }, { "item": "thanh-s-slip", "perJoint": "2*H" }],
    "tdc":        [{ "item": "ke-goc-tdc", "perJoint": 4 }, { "item": "bulong-m8", "perJoint": 8 }, { "item": "gioang-tdc-m", "perJoint": "2*(W+H)" }],
    "mat_bich_v": [{ "item": "thep-goc-v-m", "perJoint": "2*(W+H)" }, { "item": "bulong-m8", "perJoint": "ceil(2*(W+H)/100)" }]
  }
}
```

Validate lúc phát hành rule pack: dải `selection` phủ kín & không chồng; `maxLenMm > minPieceLenMm`; layer `-JOINT` không đụng takeoff (FR5).

## 13. Câu hỏi chờ người dùng chốt (⚠GIẢ ĐỊNH ở trên)

1. Dải chọn kiểu nối theo cạnh lớn: nẹp C ≤ 450 / TDC ≤ 1500 / bích V > 1500 — đúng thực tế công ty chưa?
2. Khe gioăng mối nối: TDC + bích V = 5 mm, nẹp C = 0 — hay bỏ qua khe (gap = 0 tất cả)?
3. Đốt tối thiểu 200 mm?
4. Định mức phụ kiện mối nối (§12 `hardware`) — cần bảng thật của xưởng.
5. Tag đốt định dạng `D-<itemId>-<tuyến>-<đốt>` được chưa, hay theo mã spool hiện dùng?
6. Có cần thêm kiểu nối khác (TDF tự gấp, bích tròn…) ngay đợt này không?

## 14. Chia PR (sau khi Approved)

1. **PR1 — nền số liệu:** rule pack v8 `ductJoints` + validate; engine TS + test vector (AC1–AC6, AC11) + migration `0143` + API + trang web. `route: complex` (engine + bất biến số học) — chạm `lib/ky-thuat`, không chạm vùng rủi ro cao audit.
2. **PR2 — plugin CAD:** `DuctJointConfig`/`DuctJointSegmenter` (Core, dùng chung test vector — AC10) + `XBOSS_VE_CHIADOT` + thống kê. `route: complex`; verify tay AutoCAD 2026 như M100 §18.
