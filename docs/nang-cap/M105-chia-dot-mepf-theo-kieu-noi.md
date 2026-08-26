# M105 — Đặc tả Tự động phân chia đốt toàn hệ MEPF theo kiểu kết nối (MEPF Joint Segmentation)

| Thuộc tính       | Giá trị                                                                                                                                                                                                       |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue / Goal     | Mọi tuyến MEPF vẽ bằng `XBOSS_VE` (M100) — ống gió, ống nước/PCCC, máng cáp — tự động được chia thành các **đốt chế tạo/lắp đặt** theo kiểu kết nối của từng hệ, sinh bảng đốt + phụ kiện mối nối cho xưởng và QTO |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                                                                           |
| State            | **Approved for implementation** (người dùng chốt 2026-08-26: chấp nhận toàn bộ giá trị ⚠GIẢ ĐỊNH ở §13 làm default rule pack, làm đủ mọi hệ MEPF)                                                              |
| Người/ngày duyệt | Seeker / 2026-08-26                                                                                                                                                                                                         |
| Cập nhật         | 2026-08-26 — bản đầu (chỉ ống gió) mở rộng cùng ngày ra **toàn hệ MEPF** theo yêu cầu người dùng, để tích hợp vào plugin                                                                                       |
| Phụ thuộc        | M100 (XBOSS_VE + XData tim tuyến + rule pack v8), M74 (fitting deduction / spool ống nước — nguồn tham chiếu số liệu mối nối), M99 (hạ tầng plugin)                                                            |

> Không code khi chưa **Approved for implementation**.

---

## 1. Vấn đề, vai trò và bằng chứng

- **Kỹ sư shop drawing:** sau khi vẽ tuyến bằng `XBOSS_VE` (tim + XData `[systemId, itemId, size, …]`), việc chia đốt để đặt gia công/lắp đặt hiện làm **thủ công cho cả 3 nhóm hệ**:
  - **Ống gió chữ nhật:** tự nhớ chiều dài tối đa theo kiểu nối (nẹp C / TDC / mặt bích V), tự trừ khe gioăng, kẻ vạch và đánh số tay. Sai phổ biến: quên khe gioăng TDC → tuyến dài hơn thực tế; đốt cuối lọt cỡ 80–150 mm không chế tạo được; ống lớn dùng nẹp C bung mối.
  - **Ống nước / CHW / PCCC:** chia theo cây ống thương phẩm (6 m/5,8 m tùy vật liệu), phải nhớ vị trí măng xông/coupling — hiện không thể hiện gì trên bản vẽ 2D, xưởng tự tính lại.
  - **Máng cáp:** thanh tiêu chuẩn 2,5 m/3 m + tấm nối — cũng ước tay, bulông/tấm nối không được bóc.
- **QS/xưởng:** không có bảng đốt chuẩn theo hệ (số đốt, chiều dài, kiểu nối, phụ kiện mối nối) → bóc vật tư phụ bằng ước lượng, lệch 5–10 %.
- **Non-goal của M100 giữ nguyên:** plugin **không tự thiết kế tuyến** (auto-routing). M105 chỉ chia đốt **trên tuyến kỹ sư đã vẽ** — không đổi hình học tim, không né vật cản.

## 2. Outcome, metric và guardrail

- **Target:** 100 % tuyến vẽ bằng `XBOSS_VE` (mọi line có `jointRules` trong rule pack) chia đốt được bằng 1 lệnh; bảng đốt khớp tay đo ±1 mm/đốt; **bất biến số học** cho mọi hệ: tổng chiều dài đốt + khe mối nối = chiều dài đoạn (có test).
- **Guardrail:** lệnh chia đốt **không sửa/xóa** tim và nét biên đã vẽ (chỉ THÊM vạch chia + tag trên layer riêng); 1 lệnh = 1 nhóm UNDO (như M100 AC1); line không khai `jointRules` → lệnh bỏ qua line đó kèm thông báo, không đoán mặc định ngầm.
- **Rollback:** tính năng thuần cộng thêm (lệnh mới + trường rule pack mới + bảng DB mới); tắt bằng cách phát hành rule pack không có `jointRules`.

## 3. Nghiên cứu hiện trạng

- `plugin-autocad/XBoss.Cad.Acad/Commands/VeTuyenCommands.cs` — `XBOSS_VE` vẽ polyline tim mang XData `[systemId, itemId, size, rulePackVersion, custom?, slope?]`; ống gió/máng cáp `edgeStyle: "double"` có 2 nét biên trên layer `-EDGE`; ống nước `edgeStyle: "none"`, size `DN`.
- Rule pack v8 hiện có 6 hệ / 8 line: `duct-supp/retn/exht` (WxH), `chw-pipe`/`pipe-domw`/`pipe-sanr`/`sprn-pipe` (DN), `tray-pwr`/`tray-elv` (WxH) — M105 phủ **cả 8 line** này.
- `plugin-autocad/XBoss.Cad.Core/Draw/SupportSpacing.cs` — mẫu kiến trúc gần nhất: chạy dọc tuyến, đặt đối tượng theo tham số rule pack; **hình học tính ở Core (thuần, test được), Acad chỉ vẽ**. M105 bám đúng mẫu này.
- `lib/ky-thuat/engineering-pipe-spooling-qto.ts` — `segmentPipelineIntoSpools()` (M74) chia spool ống nước LOD 400 phía server (maxLen/maxWeight/độ dốc, bù ngập âm phụ kiện). **Quan hệ với M105:** M74 là engine spool 3D chế tạo chi tiết; M105 là chia đốt **2D trên bản vẽ** cho mọi hệ. Không gộp: M105 dùng tham số `jointRules` trong rule pack (một nguồn cho plugin lẫn web); phần ống nước của M105 lấy **cùng số liệu chiều dài cây/kiểu nối** đã chuẩn hóa ở M74 (ghi rõ trong §12) để 2 engine không mâu thuẫn.
- `lib/ky-thuat/engineering-auto-routing.ts` (M77) — chỉ sinh waypoint 3D, không đụng.
- Migration hiện tại đến `0142` → M105 dùng **`0143`**.

## 4. Phương án

| Phương án                                                                 | Lợi ích                                              | Chi phí/rủi ro                                                        | Kết luận |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Không làm                                                                  | 0                                                    | Tiếp tục chia tay cả 3 nhóm hệ, sai số mối nối                        | Loại     |
| A. Chia đốt chỉ trong plugin (không server)                                | Nhanh, offline                                       | Không có bảng đốt tập trung cho QS/xưởng, không QTO                   | Loại     |
| B. Chỉ ống gió trước, hệ khác đợt sau                                      | Phạm vi nhỏ                                          | Phải mở lại đặc tả/PR ngay (người dùng đã yêu cầu toàn hệ); engine chung viết 2 lần | Loại     |
| **C. Một engine chia đốt tổng quát (maxLen + khe + chia đều) dùng chung cho mọi hệ, khác nhau chỉ ở BẢNG THAM SỐ `jointRules` per line trong rule pack; C# (plugin) + TS (web) mirror, khóa bằng test vector chung** | Một lệnh, một nguồn tham số, thêm hệ mới = sửa rule pack không sửa code | Giữ 2 bản engine C#/TS khớp nhau — khóa bằng test vector (§8 AC10)     | **Chọn** |

## 5. Scope / non-goals

**Trong phạm vi:** trường rule pack `drawTools.systems[].lines[].jointRules` cho **cả 8 line hiện có** (3 duct + 4 pipe + 2 tray); engine chia đốt tổng quát (C# + TS); lệnh `XBOSS_VE_CHIADOT` (mọi hệ, chọn tuyến hoặc quét cả hệ) + tham gia `XBOSS_VE_THONGKE` (bảng đốt trong bản vẽ) + ghi vào báo cáo phiên vẽ (`XBOSS_VE_BAOCAO`); API + bảng DB lưu kết quả; trang web xem bảng đốt theo bản vẽ + export; QTO phụ kiện mối nối theo bảng định mức `hardware` trong rule pack (nẹp/ke/bulông/gioăng cho duct; coupling/măng xông/gioăng grooved cho pipe; tấm nối + bulông cho tray).

**Non-goals:** tự thiết kế tuyến (auto-routing — non-goal M100 giữ nguyên); khai triển tấm tôn / nesting (đã có nền 1D M74, unfold 2D đợt sau); chia đốt phụ kiện (co/tê/chuyển cỡ/van là 1 khối riêng, không cắt — ranh giới đốt); bù ngập âm phụ kiện chi tiết cho ống nước (đó là việc của M74 khi ra spool xưởng — M105 chỉ chia theo cây thương phẩm trên bản vẽ 2D); ống gió tròn xoắn (spiral — đợt sau); tính cấp áp/độ kín SMACNA (chỉ warning nếu rule pack khai).

## 6. User journeys và mọi trạng thái

1. **Happy — ống gió:** vẽ tuyến gió cấp 800×400 dài 7,2 m → `XBOSS_VE_CHIADOT` → chọn tuyến (hoặc quét cả hệ) → plugin đọc size từ XData, tra `jointRules` → TDC (cạnh lớn 800 thuộc dải TDC) → chia 7 đốt (theo công thức FR2), vẽ vạch chia vuông góc tim trên layer `<layer>-JOINT`, tag `D-duct-supp-001-01…07`, in tóm tắt. ESC giữa chừng → không để lại gì (hỏi đáp ngoài transaction — M100 §6.11).
2. **Happy — ống nước:** tuyến CHW DN80 dài 14 m → tra `jointRules` theo DN → cây 5,8 m nối grooved coupling → 3 đốt (2×5 800 − khe + đốt dư), vạch chia = tick ngắn cắt tim (ống không có biên), tag `D-chw-pipe-…`.
3. **Happy — máng cáp:** tray-pwr 200×100 dài 9 m → thanh 2,5 m + tấm nối → 4 đốt; vạch chia chạm 2 nét biên như ống gió.
4. **Quét cả hệ:** chọn chế độ "cả hệ" → lặp qua mọi tuyến của hệ đang chọn, line thiếu `jointRules` bị bỏ qua + liệt kê trong tóm tắt.
5. **Chạy lại trên tuyến đã chia:** xóa vạch/tag cũ của đúng tuyến đó (XData liên kết) rồi chia lại — idempotent, không nhân đôi.
6. **Size ngoài danh mục (`custom`):** vẫn chia nếu parse được (`WxH` hoặc `DN<n>`); cảnh báo + cờ vào tag XData + báo cáo phiên vẽ.
7. **Đoạn ngắn hơn đốt tối thiểu:** 1 đốt duy nhất + warning (vd đoạn 300 mm giữa 2 co).
8. **Web:** sau `XBOSS_BOCKL`/upload, mở trang bản vẽ → tab "Bảng đốt": nhóm theo hệ → tuyến → đốt, tổng phụ kiện mối nối; export Excel. Loading dùng `Skeleton`, rỗng/lỗi thông điệp tiếng Việt; 401 redirect `/login`; viewer/bch/cdt chỉ xem.

## 7. Functional & non-functional requirements

### 7.1 Bảng kiểu kết nối mặc định theo nhóm hệ (rule pack quyết định; in đậm = người dùng đã chốt)

**Nhóm ống gió chữ nhật** (`duct-supp/retn/exht`, chọn theo **cạnh lớn** max(W,H)):

| `jointType`  | Tên hiển thị                     | **Đốt tối đa** (mm) | Khe `jointGapMm`     | Dải cạnh lớn (mm)    |
| ------------ | -------------------------------- | ------------------- | -------------------- | -------------------- |
| `nep_c`      | Nẹp C (S-slip & C-cleat)         | **1180**            | ⚠GIẢ ĐỊNH 0          | ⚠GIẢ ĐỊNH ≤ 450      |
| `tdc`        | TDC (Transverse Duct Connector)  | **1110**            | ⚠GIẢ ĐỊNH 5 (gioăng) | ⚠GIẢ ĐỊNH 451 – 1500 |
| `mat_bich_v` | Mặt bích V (thép góc)            | **1180**            | ⚠GIẢ ĐỊNH 5 (gioăng) | ⚠GIẢ ĐỊNH > 1500     |

**Nhóm ống nước/PCCC** (`chw-pipe`, `pipe-domw`, `pipe-sanr`, `sprn-pipe`, chọn theo **DN**) — ⚠GIẢ ĐỊNH toàn bộ, số liệu bám vật liệu đã chuẩn hóa ở M74:

| `jointType`     | Tên hiển thị              | Đốt tối đa (mm)          | Khe `jointGapMm`        | Áp dụng (mặc định)                        |
| --------------- | ------------------------- | ------------------------ | ----------------------- | ----------------------------------------- |
| `grooved`       | Coupling rãnh (Victaulic) | 5800 (cây thép 6 m trừ gia công) | 3 (khe rãnh)     | `chw-pipe`, `sprn-pipe` DN ≥ 65           |
| `ren`           | Ren (NPT/BSPT)            | 5800                     | 0 (thread makeup đã ăn vào ống — không cộng khe) | `sprn-pipe`, `pipe-domw` DN ≤ 50 |
| `han`           | Hàn đối đầu               | 5800                     | 2 (khe đáy hàn)         | `chw-pipe` DN ≥ 100 (tùy dự án)           |
| `mang_xong`     | Măng xông dán/nong (uPVC) | 5800                     | 0 (ngập âm — không cộng) | `pipe-sanr`                              |

**Nhóm máng cáp** (`tray-pwr`, `tray-elv`) — ⚠GIẢ ĐỊNH:

| `jointType` | Tên hiển thị            | Đốt tối đa (mm) | Khe | Áp dụng |
| ----------- | ----------------------- | --------------- | --- | ------- |
| `tam_noi`   | Tấm nối + bulông        | 2500            | 0   | mọi size |

- **FR1** Kiểu nối chọn **tự động** theo khóa của nhóm hệ: duct → cạnh lớn; pipe → DN (`sizeRange` dạng `DN`); tray → 1 kiểu mặc định. Kỹ sư được **ghi đè tay** khi chạy lệnh (prompt mặc định = kiểu tự chọn, danh sách = mọi `jointType` line đó khai). Toàn bộ bảng trên là **default do rule pack phát hành quyết định** — engine không hard-code bất kỳ số nào.
- **FR2** Công thức chia 1 đoạn thẳng dài `L` (giữa 2 điểm gãy polyline, hoặc giữa mép phụ kiện nếu tuyến có block phụ kiện chèn — M100 PR4), **chung cho mọi hệ**:
  `n = ceil(L / (maxLenMm + jointGapMm))`; chia **đều** `pieceLen = (L − (n−1)·jointGapMm) / n` (làm tròn 0,1 mm; đốt cuối nhận phần dư làm tròn). Bất biến: `Σ pieceLen + (n−1)·jointGapMm = L` (±0,5 mm tích lũy). ⚠GIẢ ĐỊNH: chia đều áp cho cả pipe/tray — nếu xưởng muốn "tối đa hóa cây nguyên + 1 đốt lẻ" (5800+5800+2400 thay vì 3×4666) thì chốt ở §13 câu 3; rule pack khai `divideMode: "deu" | "cay_nguyen"` per line, engine hỗ trợ cả hai, default ⚠ `deu` cho duct và `cay_nguyen` cho pipe/tray.
- **FR3** `minPieceLenMm` per line (⚠GIẢ ĐỊNH duct 200, pipe 300, tray 300): đoạn `L < min` → 1 đốt + warning; chế độ `cay_nguyen` nếu đốt lẻ < min thì dồn ngược vào đốt trước (2 đốt cuối chia đều nhau).
- **FR4** Mỗi điểm gãy (vertex) của polyline tim là **ranh giới đốt bắt buộc**; bulge/cung tròn → từ chối chia đoạn đó kèm cảnh báo.
- **FR5** Vẽ theo nhóm hệ: line có nét biên (`edgeStyle: "double"` — duct/tray) → vạch chia = line vuông góc tim dài đúng bề rộng W (chạm 2 biên); line không biên (pipe) → tick vuông góc dài ⚠GIẢ ĐỊNH 2× bán kính danh nghĩa, tối thiểu 100 mm bản vẽ. Layer `<layerTim>-JOINT` (style khai trong `jointRules.layerStyle`); tag đốt = text `D-<itemId>-<sốTuyến>-<sốĐốt>` cạnh trung điểm đốt. Layer `-JOINT` **không được khớp** bất kỳ `takeoff.layerMatchAny` nào (kiểm khi phát hành rule pack — cùng cơ chế M100 FR4 với `-EDGE`).
- **FR6** XData 2 chiều: vạch/tag mang handle tim + chỉ số đốt; tim mang version chia đốt — chạy lại idempotent (journey 5), `XBOSS_BOCKL` đọc được bảng đốt để đẩy lên server.
- **FR7** QTO phụ kiện mối nối: mỗi mối (n−1 mối/đoạn; mối tại vertex/phụ kiện đếm 1 lần) sinh định mức theo `jointType` từ `jointRules.hardware` — biểu thức theo biến `W`,`H` (mm) hoặc `DN`: duct TDC = 4 ke + 8 bulông M8 + gioăng `2*(W+H)`; nẹp C = 2 thanh nẹp `W` + ⚠ 2 thanh S `H`; bích V = thép góc `2*(W+H)` + bulông `ceil(2*(W+H)/100)`; pipe grooved = 1 coupling + 1 gioăng đúng DN; ren = 1 măng xông ren; hàn = quy đổi que hàn theo DN (⚠ bảng xưởng); tray = 2 tấm nối + 8 bulông M6. Toàn bộ hệ số trong rule pack, engine chỉ tính biểu thức (parser mini: số, `W/H/DN`, `+ - * /`, `ceil()` — không eval tự do).
- **FR8** Server: `lib/ky-thuat/engineering-joint-segmentation.ts` (tầng 4 `ky-thuat`) — engine thuần `segmentRunIntoPieces()` + `explodeJointHardware()` mirror bản C#, service ghi DB; API §10; nhận dữ liệu khi plugin `XBOSS_BOCKL` đẩy lên hoặc gọi trực tiếp.
- **FR9** Cảnh báo nghiệp vụ (không chặn): duct vượt ngưỡng cạnh lớn của kiểu đang chọn; pipe có `slope` trong XData → ghi chú đốt theo hướng dốc (đầu cao → thấp) để xưởng đánh số lắp; line `slopeRequired` mà thiếu slope thì warning như hiện trạng M100.
- **NFR1** Engine C# và TS **cùng input ra cùng output** — bộ test vector JSON chung (`plugin-autocad/testdata/joint-segmentation/*.json`, đọc bởi cả `tests/engineering-joint-segmentation.test.ts` lẫn unit test C#), phủ đủ 3 nhóm hệ × 2 divideMode.
- **NFR2** Chia 500 đoạn < 1 s trong CAD; API < 500 ms/bản vẽ.
- **NFR3** A11y/i18n: nhãn tiếng Việt; trang web theme dark-first, dùng `app/components/ui/`.

## 8. Acceptance criteria (Given/When/Then — mỗi AC map tới test)

- **AC1** Duct 7200, TDC (1110/khe 5, `deu`): n = ceil(7200/1115) = 7; pieceLen = (7200 − 30)/7 = 1024,3; Σ đúng bất biến. → vector `duct-tdc-7200.json`.
- **AC2** Duct 1180 nẹp C: 1 đốt, 0 mối. **AC3** Duct 1181 nẹp C (khe 0): 2 đốt 590,5.
- **AC4** Đoạn 150 < min: 1 đốt + warning `dot_ngan_hon_toi_thieu`.
- **AC5** Duct 800×400 → tự chọn TDC; ghi đè `mat_bich_v` → dùng tham số bích V, tag ghi cờ ghi đè.
- **AC6** Polyline 3 vertex (2 đoạn): mỗi đoạn chia độc lập, tổng mối = Σ(nᵢ−1).
- **AC7** Pipe DN80 grooved 14 000, `cay_nguyen` (5800/khe 3): đốt = 5800 + 5800 + 2394; nếu đốt lẻ < min 300 → dồn 2 đốt cuối chia đều. → vector `pipe-grooved-14000.json`.
- **AC8** Tray 9 000, `tam_noi` 2500 `cay_nguyen`: 3×2500 + 1500; hardware = 3 mối × (2 tấm + 8 bulông).
- **AC9** `XBOSS_VE_CHIADOT` chạy 2 lần cùng tuyến: số vạch/tag không đổi (idempotent); 1 UNDO xóa trọn kết quả 1 lần chạy.
- **AC10** Line thiếu `jointRules` hoặc rule pack thiếu cả khối: lệnh bỏ qua line/từ chối chạy, thông báo rõ, không sửa bản vẽ.
- **AC11** API: chưa đăng nhập → 401; viewer POST → 403; payload vi phạm bất biến FR2 → 422.
- **AC12** Cùng bộ test vector, engine C# và TS ra kết quả giống từng số (±0,1 mm) — chạy trong CI (node:test) + xunit.
- **AC13** QTO tuyến AC1 với định mức TDC mẫu: 6 mối × (4 ke + 8 bulông) + gioăng 6 × 2(0,8+0,4) = 14,4 m.

## 9. Kiến trúc và điểm chạm code

| Tầng    | File (dự kiến)                                                              | Nội dung                                                                                    |
| ------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Core C# | `plugin-autocad/XBoss.Cad.Core/Draw/JointRulesConfig.cs`                     | Parse + validate `jointRules` (theo mẫu `DrawToolsConfig.cs`), parser biểu thức hardware    |
| Core C# | `plugin-autocad/XBoss.Cad.Core/Draw/JointSegmenter.cs`                       | Engine hình học thuần FR1–FR4, FR7 — không tham chiếu AutoCAD API                           |
| Acad C# | `plugin-autocad/XBoss.Cad.Acad/Commands/VeChiaDotCommands.cs`                | Lệnh `XBOSS_VE_CHIADOT`: chọn tuyến/cả hệ → gọi Core → vẽ vạch/tag/XData (FR5–FR6), 1 UNDO  |
| Acad C# | `ThongKeTable.cs` + `VeSessionReport.cs` (sửa)                               | `XBOSS_VE_THONGKE` thêm bảng đốt; báo cáo phiên vẽ ghi tuyến đã chia/bỏ qua                 |
| lib TS  | `lib/ky-thuat/engineering-joint-segmentation.ts`                             | Engine mirror + hardware + hàm ghi/đọc DB                                                   |
| Route   | `app/api/engineering/joint-segmentation/route.ts`                            | §10 — auth + gọi lib, `export const dynamic = "force-dynamic"`                              |
| UI      | `app/engineering/joint-segmentation/page.tsx` (hoặc tab trang bản vẽ)        | Bảng đốt theo hệ + tổng phụ kiện + export                                                   |
| Test    | `tests/engineering-joint-segmentation.test.ts` + test vector JSON chung      | AC1–AC8, AC12, AC13 (import `tests/setup.ts` đầu tiên nếu chạm DB)                          |

## 10. API contract

`POST /api/engineering/joint-segmentation` — plugin (token thiết bị như `XBOSS_BOCKL`) hoặc session Admin/PM/engineer. Body: `{ drawingId, rulePackVersion, runs: [{ systemId, itemId, size, jointType, overridden, divideMode, segments: [{ lengthMm, gapMm, pieces: [..] }] }] }`. Idempotent theo `(drawingId, runKey)` — upsert thay bản cũ. 401/403/422 như AC11.
`GET /api/engineering/joint-segmentation?drawingId=` — bảng đốt + hardware tổng hợp theo hệ; mọi vai trò đăng nhập xem được (viewer read-only). Scope theo project qua `withProjectScope`.

## 11. Data contract và DDL — `migrations/0143_mepf_joint_segmentation.sql`

```sql
CREATE TABLE IF NOT EXISTS engineering_joint_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id),
  drawing_id INTEGER NOT NULL REFERENCES drawings(id) ON DELETE CASCADE,  -- bảng drawings (0016, SERIAL)
  run_key TEXT NOT NULL,              -- handle tim + itemId — idempotency
  system_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  size TEXT NOT NULL,                 -- 'WxH' hoặc 'DN80'
  joint_type TEXT NOT NULL,           -- slug — KHÔNG CHECK cứng: danh mục do rule pack quyết
  divide_mode TEXT NOT NULL CHECK (divide_mode IN ('deu','cay_nguyen')),
  overridden BOOLEAN NOT NULL DEFAULT FALSE,
  rule_pack_version TEXT NOT NULL,
  total_length_mm NUMERIC(12,1) NOT NULL,
  piece_count INT NOT NULL,
  joint_count INT NOT NULL,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, run_key)
);
CREATE TABLE IF NOT EXISTS engineering_joint_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES engineering_joint_runs(id) ON DELETE CASCADE,
  piece_index INT NOT NULL,
  length_mm NUMERIC(12,1) NOT NULL,
  tag TEXT NOT NULL,
  UNIQUE (run_id, piece_index)
);
CREATE INDEX IF NOT EXISTS idx_joint_runs_drawing ON engineering_joint_runs(drawing_id);
```

Hardware QTO **không lưu bảng riêng** — suy từ runs × định mức rule pack lúc đọc (một nguồn sự thật, đổi định mức không backfill). Migration thuần cộng thêm → đi thẳng production theo DoD. RLS/policy 2 nhánh theo đúng mẫu `0092` cho 2 bảng `engineering_*` mới (FORCE RLS, so sánh TEXT, không nhánh missing-context→allow).

## 12. Rule pack (v9) — phần khai mới (đủ 3 nhóm hệ)

```jsonc
// drawTools.systems[].lines[].jointRules — ví dụ 3 đại diện:

// duct-supp (WxH):
"jointRules": {
  "selection": [                     // chọn theo cạnh lớn — dải không chồng, phủ kín
    { "jointType": "nep_c",      "maxSideMm": 450,  "maxLenMm": 1180, "jointGapMm": 0 },
    { "jointType": "tdc",        "maxSideMm": 1500, "maxLenMm": 1110, "jointGapMm": 5 },
    { "jointType": "mat_bich_v", "maxSideMm": null, "maxLenMm": 1180, "jointGapMm": 5 }
  ],
  "divideMode": "deu", "minPieceLenMm": 200,
  "layerStyle": { "suffix": "-JOINT", "color": 8, "linetype": "DASHED" },
  "hardware": {
    "nep_c":      [{ "item": "thanh-nep-c", "perJoint": "2*W" }, { "item": "thanh-s-slip", "perJoint": "2*H" }],
    "tdc":        [{ "item": "ke-goc-tdc", "perJoint": 4 }, { "item": "bulong-m8", "perJoint": 8 }, { "item": "gioang-tdc-m", "perJoint": "2*(W+H)" }],
    "mat_bich_v": [{ "item": "thep-goc-v-m", "perJoint": "2*(W+H)" }, { "item": "bulong-m8", "perJoint": "ceil(2*(W+H)/100)" }]
  }
}

// chw-pipe (DN):
"jointRules": {
  "selection": [
    { "jointType": "ren",     "maxDn": 50,   "maxLenMm": 5800, "jointGapMm": 0 },
    { "jointType": "grooved", "maxDn": null, "maxLenMm": 5800, "jointGapMm": 3 }
  ],
  "divideMode": "cay_nguyen", "minPieceLenMm": 300,
  "layerStyle": { "suffix": "-JOINT", "color": 8, "linetype": "DASHED" },
  "hardware": {
    "ren":     [{ "item": "mang-xong-ren", "perJoint": 1 }],
    "grooved": [{ "item": "coupling-grooved", "perJoint": 1 }, { "item": "gioang-grooved", "perJoint": 1 }]
  }
}

// tray-pwr (WxH):
"jointRules": {
  "selection": [{ "jointType": "tam_noi", "maxSideMm": null, "maxLenMm": 2500, "jointGapMm": 0 }],
  "divideMode": "cay_nguyen", "minPieceLenMm": 300,
  "layerStyle": { "suffix": "-JOINT", "color": 8, "linetype": "DASHED" },
  "hardware": { "tam_noi": [{ "item": "tam-noi-tray", "perJoint": 2 }, { "item": "bulong-m6", "perJoint": 8 }] }
}
```

Validate lúc phát hành rule pack: dải `selection` phủ kín & không chồng (theo `maxSideMm` hoặc `maxDn` tùy `sizeKind` của line); `maxLenMm > minPieceLenMm`; mọi `jointType` trong `selection` có mục `hardware`; layer `-JOINT` không đụng takeoff (FR5); biểu thức hardware parse được (FR7).

## 13. Câu hỏi chờ người dùng chốt (⚠GIẢ ĐỊNH ở trên)

1. **Duct** — dải chọn kiểu nối theo cạnh lớn (≤450 nẹp C / ≤1500 TDC / >1500 bích V), khe gioăng (TDC + bích V = 5, nẹp C = 0), đốt tối thiểu 200?
2. **Pipe** — cây thương phẩm 5800 cho mọi vật liệu đúng chưa (hay uPVC 5800 / thép 6000)? Ngưỡng DN đổi ren→grooved (50)? Có dùng kiểu `han`/`mang_xong` không, khe từng kiểu?
3. **divideMode** — duct chia `deu`, pipe/tray `cay_nguyen` (tối đa cây nguyên + đốt lẻ cuối) — đúng cách xưởng đang làm?
4. **Tray** — thanh 2500 hay 3000? Định mức tấm nối/bulông?
5. **Định mức hardware** cả 3 nhóm (§12) — cần bảng thật của xưởng/dự án.
6. **Tag đốt** `D-<itemId>-<tuyến>-<đốt>` được chưa, hay theo mã spool hiện dùng?
7. Có cần thêm kiểu nối khác ngay đợt này (TDF tự gấp, bích tròn, tray nối khớp nhanh…)? (Thêm sau chỉ là sửa rule pack — không sửa code.)

## 14. Chia PR (sau khi Approved)

> Ghi chú thi hành 2026-08-26: phiên remote làm trên MỘT nhánh được chỉ định (`claude/auto-route-2d-duct-division-h105c6`) — 2 "PR" dưới đây thi hành thành 2 commit tuần tự trên nhánh đó, mở 1 PR chung.

1. **PR1 — nền số liệu (server + rule pack):** rule pack v9 `jointRules` cho 8 line + validator; engine TS + test vector đủ 3 nhóm hệ (AC1–AC8, AC13); migration `0143`; API; trang web. `route: complex` (engine tổng quát + bất biến số học + parser biểu thức) — chạm `lib/ky-thuat`, không chạm vùng rủi ro cao audit.
2. **PR2 — plugin CAD:** `JointRulesConfig`/`JointSegmenter` (Core, dùng chung test vector — AC12) + `XBOSS_VE_CHIADOT` + thống kê/báo cáo phiên vẽ. `route: complex`; verify tay AutoCAD 2026 như M100 §18.
