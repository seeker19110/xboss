# M110 — Đặc tả Revision cloud + tam giác revision (`XBOSS_VE_REV`)

| Thuộc tính       | Giá trị                                                                                                                  |
| :--------------- | :----------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đánh dấu vùng đã sửa giữa hai lần phát hành để CĐT/tư vấn thấy ngay "lần này sửa gì ở đâu", thay vì phải dò cả tờ bản vẽ |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                     |
| State            | **Approved for implementation**                                                                                          |
| Người/ngày duyệt | Seeker / 2026-08-29                                                                                                      |
| Cập nhật         | 2026-08-28                                                                                                               |
| Nguồn            | `M100-xboss-ve-shop-drawing.md` §20 hàng 2                                                                               |
| Phạm vi đã chốt  | **Chỉ phần CAD** (người dùng chốt 2026-08-28) — không đụng server/web, không liên kết `drawing_revisions` trong đợt này  |
| Phụ thuộc        | M100 (XData, `sheetSetup.titleblockId`, `XBOSS_VE_TRANGIN`), M106 (hộp thoại WPF)                                        |

---

## 1. Vấn đề

Bản vẽ shop drawing đi qua nhiều vòng: nộp → tư vấn phê bình → sửa → nộp lại. Quy ước hồ sơ là mỗi
vùng sửa được khoanh **revision cloud** kèm **tam giác mang số revision**, và khung tên có **bảng
revision** ghi ngày + nội dung sửa. Hiện plugin XBoss không có gì cho việc này: kỹ sư vẽ cloud tay
bằng lệnh `REVCLOUD` của AutoCAD, đánh số tay, gõ bảng revision tay — sai số và bỏ sót là chuyện
thường, và **không có cách nào biết mình đã khoanh đủ chỗ đã sửa hay chưa**.

Điểm M110 làm khác lệnh `REVCLOUD` sẵn có: plugin **biết bản vẽ đã đổi những gì** kể từ lần chốt
revision trước (nhờ XData của chính bộ lệnh vẽ), nên **đề xuất được** vùng cần khoanh thay vì để kỹ
sư tự nhớ.

## 2. Outcome và guardrail

- **Target:** chốt một revision trong ≤ 3 thao tác, cloud + tam giác + bảng revision khớp nhau tuyệt
  đối, và có danh sách "vùng đã đổi mà chưa khoanh" để không bỏ sót.
- **Guardrail:**
  1. **Không đụng hình học nghiệp vụ.** Cloud/tam giác/bảng là đối tượng chú thích trên layer riêng,
     mang XData vai trò `Revision`; tim, biên, phụ kiện không bị chạm.
  2. **Số revision là chuỗi tăng, không tái sử dụng.** Đã phát hành `R2` thì `R2` không bao giờ bị
     ghi đè — cùng nguyên tắc append-only của rule pack và thư viện block (ADR-0006).
  3. Cloud của các revision cũ **giữ nguyên**, chỉ đổi hiển thị (xem FR6) — hồ sơ phải tra ngược được.
  4. 1 lệnh = 1 nhóm UNDO, hỏi đáp ngoài transaction (M100 §6.11).

## 3. Scope / non-goals

**Trong phạm vi:** 3 lệnh — `XBOSS_VE_REV` (khoanh vùng + gán revision hiện hành),
`XBOSS_VE_REV_CHOT` (chốt revision: tăng số, ghi bảng revision, lưu mốc so sánh),
`XBOSS_VE_REV_HIENTHI` (bật/tắt hiển thị cloud theo từng revision); khóa rule pack
`drawTools.revisionPolicy`; đề xuất vùng sửa bằng cách so mốc; ghi bảng revision vào **attribute
khung tên** của các layout do `XBOSS_VE_TRANGIN` dựng.

**Non-goals (chốt 2026-08-28):**

- **Không đụng server/web.** Không gọi API, không ghi `drawing_revisions`, không đổi
  `standardize_report`. Liên kết chu trình duyệt trên web là một đợt riêng (khi làm phải mở M mới).
- Không so sánh hình ảnh 2 tệp DWG bất kỳ (diff ảnh) — mốc so sánh chỉ dựa trên XData của **chính bản
  vẽ này**, tức chỉ theo dõi được đối tượng do bộ lệnh XBoss quản.
- Không tự viết nội dung mô tả sửa đổi (kỹ sư gõ; plugin gợi ý danh sách đối tượng đã đổi).

## 4. Mốc so sánh — cách plugin biết "đã đổi gì"

Khi `XBOSS_VE_REV_CHOT` chạy, plugin ghi một **mốc** vào `NamedObjectsDictionary` của bản vẽ
(`XBOSS_REV_SNAPSHOT`, Xrecord): với mỗi thực thể mang XData `XBOSS_VE` vai trò `Tim`/`PhuKien`/
`ThietBi`/`LoCho` lưu `{handle, vaiTro, heId, itemId, size, hashHinhHoc}` — `hashHinhHoc` là băm
SHA-256 của chuỗi tọa độ đỉnh làm tròn tới 0,1 mm (hàm thuần ở Core, có test).

Lần chạy `XBOSS_VE_REV` sau đó so bản vẽ hiện tại với mốc gần nhất và phân loại:

| Loại     | Điều kiện                                      | Đề xuất                                 |
| :------- | :--------------------------------------------- | :-------------------------------------- |
| Thêm mới | handle không có trong mốc                      | khoanh bao hình của đối tượng           |
| Xóa      | handle trong mốc không còn trong bản vẽ        | khoanh tại **vị trí cũ** lấy từ mốc     |
| Đổi      | cùng handle, khác `hashHinhHoc` hoặc khác size | khoanh bao hình (hợp bao hình cũ + mới) |

Bản vẽ **chưa từng chốt revision** (không có mốc) → không đề xuất được, lệnh vẫn chạy ở chế độ khoanh
tay và nói rõ lý do bằng tiếng Việt.

## 5. Khóa rule pack mới (`drawTools.revisionPolicy`)

Version mới = hiện hành + 1 (**lấy số thật lúc code**, xem ghi chú cùng nội dung ở M109 §5). Mặc định
`enabled: false`.

```jsonc
"revisionPolicy": {
  "enabled": false,
  "cloudArcMm": 300,             // chiều dài cung cloud ở tỉ lệ 1:1, nhân theo VeContext.TiLeIn
  "layer": "M-ANNO-REVS",
  "triangleBlockId": "rev-tag",  // block kind=annotation trong manifest thư viện (M100 PR2)
  "numberFormat": "R{n}",        // R1, R2… — {n} bắt buộc có, validator bắt
  "titleblockAttrPattern": {     // tên attribute trong khung tên, {n} = số revision
    "so": "REV{n}_NO", "ngay": "REV{n}_DATE", "noiDung": "REV{n}_DESC", "nguoi": "REV{n}_BY"
  },
  "maxRows": 6,                  // số dòng revision khung tên chứa được
  "boundingPaddingMm": 200       // nới bao hình khi đề xuất vùng khoanh
}
```

Validator 2 tầng bắt: `numberFormat` phải chứa `{n}`; `cloudArcMm` > 0; `triangleBlockId` khác rỗng
khi `enabled`; `maxRows` ≥ 1.

## 6. Functional requirements

- **FR1 `XBOSS_VE_REV` — khoanh vùng.** Hộp thoại (M106) hiện: số revision **đang mở** (mốc gần nhất
  - 1), danh sách **đề xuất** theo §4 (mỗi dòng: loại thêm/xóa/đổi, hệ, cỡ, có nút _zoom tới_), và 2
    đường vào — “khoanh theo đề xuất đã tick” hoặc “tự chọn vùng bằng chuột”.
- **FR2 Dựng cloud.** Polyline cloud quanh bao hình (nới `boundingPaddingMm`), cung dài `cloudArcMm ×
tỉ lệ in`, trên layer `revisionPolicy.layer`; kèm block tam giác `triangleBlockId` đặt tại góc trên
  phải cloud, attribute = số revision theo `numberFormat`.
- **FR3 XData.** Cloud và tam giác mang XData `XBOSS_VE` **vai trò mới `Revision`** với: số revision,
  danh sách handle đối tượng nằm trong vùng, và `HandleCapDoi` (cloud ↔ tam giác) để xóa/sửa luôn đi
  cặp — cùng kiểu liên kết 2 chiều tim↔biên của M100.
- **FR4 `XBOSS_VE_REV_CHOT` — chốt revision.** Hỏi ngày + nội dung sửa + người thực hiện; ghi bảng
  revision vào attribute khung tên **của mọi layout** theo `titleblockAttrPattern` (layout thiếu
  attribute → bỏ qua kèm cảnh báo nêu tên layout, **không** tự thêm attribute); ghi mốc mới theo §4;
  tăng số revision hiện hành. Vượt `maxRows` → dừng kèm thông báo rõ (khung tên không đủ dòng, phải
  đổi khung tên hoặc gộp revision) — **không** ghi đè dòng cũ (guardrail 2).
- **FR5 Cảnh báo bỏ sót.** Cuối `XBOSS_VE_REV_CHOT`: liệt kê các thay đổi phát hiện theo §4 mà
  **không** nằm trong cloud nào của revision đang chốt; hỏi lại “vẫn chốt?” — kỹ sư quyết, plugin
  không chặn.
- **FR6 `XBOSS_VE_REV_HIENTHI`.** Bật/tắt hiển thị cloud theo từng revision bằng cách bật/tắt layer
  con `<layer>-R{n}` (mỗi revision một layer con, sinh khi khoanh). Mặc định: revision hiện hành hiện,
  các revision cũ tắt — đúng quy ước “bản in chỉ khoanh lần sửa mới nhất”, mà vẫn tra ngược được.
- **FR7 Idempotent.** Chạy lại `XBOSS_VE_REV` trên cùng một vùng/đề xuất đã khoanh → cập nhật cloud
  tại chỗ, không nhân đôi cloud + tam giác.
- **FR8 Xóa.** Xóa cloud bằng lệnh AutoCAD thường thì tam giác **mồ côi** — `XBOSS_KIEMTRA` thêm một
  phép kiểm (số hiệu tiếp theo trong `PhepKiemMoRong.cs`) báo “tam giác revision không có cloud” và
  ngược lại.
- **FR9 Đường lui.** `XBOSS_UI_DIALOG=0` → hỏi đáp dòng lệnh, kết quả trùng khít (M106 FR9).
- **FR10 Vị trí trong quy trình.** Cả 3 lệnh xếp `BuocQuyTrinh.HoSoBanVe` (bước 5), sau
  `XBOSS_VE_TRANGIN`; khai trong `LenhCatalog` kèm `ThuTuTrongBuoc`.
- **NFR1** Mốc §4 trên bản vẽ 5000 đối tượng: ghi/đọc ≤ 3 giây, kích thước Xrecord ≤ 2 MB (băm chứ
  không lưu tọa độ đầy đủ).
- **NFR2** Toàn bộ logic so mốc + hình cloud ở Core thuần, test chạy CI Linux. Không thêm NuGet.

## 7. Acceptance criteria

- **AC1** Chốt `R1` trên bản vẽ đã vẽ xong → mốc được ghi; bảng revision khung tên có dòng `R1` đúng
  ngày/nội dung/người trên **mọi** layout.
- **AC2** Dời 1 tuyến, đổi cỡ 1 tuyến, xóa 1 phụ kiện, thêm 1 thiết bị → `XBOSS_VE_REV` đề xuất
  **đúng 4 vùng**, phân loại đúng thêm/xóa/đổi; vùng của phụ kiện đã xóa nằm ở **vị trí cũ**.
- **AC3** Khoanh 3/4 vùng rồi chốt `R2` → cảnh báo FR5 nêu đúng vùng còn thiếu; chọn “vẫn chốt” thì
  `R2` được ghi bình thường.
- **AC4** Cloud `R1` vẫn còn trong bản vẽ sau khi chốt `R2`, mặc định **tắt hiển thị**; bật lại bằng
  `XBOSS_VE_REV_HIENTHI` thì hiện đúng cloud `R1`.
- **AC5** Chạy `XBOSS_VE_REV` 3 lần trên cùng vùng → đúng 1 cloud + 1 tam giác.
- **AC6** Khung tên chỉ có `maxRows` = 6 dòng và đang ở `R6` → chốt `R7` **dừng kèm thông báo**, bảng
  revision không mất dòng nào.
- **AC7** Xóa cloud bằng `ERASE` → `XBOSS_KIEMTRA` báo tam giác mồ côi.
- **AC8** `revisionPolicy.enabled: false` (mặc định) → cả 3 lệnh dừng kèm thông báo cách bật, không
  vẽ gì; bản vẽ không đổi.
- **AC9** Một lần `U` hoàn tác trọn vẹn mỗi lệnh.
- **AC10** `XBOSS_BOCKL` sau khi khoanh cloud cho **đúng con số như trước** (guardrail 1).

## 8. Điểm chạm code

| Tầng           | Tệp                                                                      | Vai trò                                                 |
| :------------- | :----------------------------------------------------------------------- | :------------------------------------------------------ |
| Rule pack (TS) | `lib/ky-thuat/cad/rule-packs/v<next>.json` + validator                   | Khóa `revisionPolicy`                                   |
| Core           | `RulePack/RulePackModels.cs`, `RulePackLoader.cs`                        | Đọc + validate                                          |
| Core (mới)     | `Draw/RevisionCloud.cs`                                                  | Hình cloud từ bao hình, vị trí tam giác — thuần         |
| Core (mới)     | `Draw/RevisionSnapshot.cs`                                               | Mốc §4: băm hình học, so mốc, phân loại thêm/xóa/đổi    |
| Core           | `Draw/VeXData.cs`                                                        | `VaiTroVe.Revision` + `SoRevision` + `HandleCapDoi`     |
| Core           | `Inspection/PhepKiemMoRong.cs`                                           | Phép kiểm cloud/tam giác mồ côi (FR8)                   |
| Core           | `Ui/ViewModels/RevisionDialogViewModel.cs` + `RevChotDialogViewModel.cs` | Hộp thoại M106                                          |
| Core           | `Ui/LenhCatalog.cs`, `Reporting/VeSessionReport.cs`                      | Khai 3 lệnh + mục revision trong báo cáo phiên vẽ       |
| Adapter (mới)  | `XBoss.Cad.Acad/Commands/VeRevCommands.cs`                               | 3 `[CommandMethod]`, transaction, UNDO                  |
| Adapter (mới)  | `XBoss.Cad.Acad/Services/RevisionStore.cs`                               | Đọc/ghi Xrecord `XBOSS_REV_SNAPSHOT`, layer con `-R{n}` |
| Adapter        | `Services/VeThucThe.cs`, `Ui/Wpf/XBossDialog.xaml`                       | Dựng cloud/tam giác, `DataTemplate`                     |
| Adapter        | `Services/StandardizePipeline.cs` — **không đụng**                       | (ghi rõ để người thi hành không mở rộng nhầm)           |
| Tài liệu       | `plugin-autocad/README.md`, `CAI-DAT.md`, `VERIFY-VA-PHAT-HANH.md`       | Lệnh mới + mục verify tay                               |

Không migration, không API, không đụng `app/`, `lib/` ngoài tệp rule pack + validator.

## 9. Test plan

- **Core (xunit):** băm hình học ổn định qua làm tròn 0,1 mm và **đổi thứ tự đỉnh thì hash đổi**; so
  mốc ra đúng 3 nhóm thêm/xóa/đổi; bao hình + `boundingPaddingMm`; số cung cloud theo `cloudArcMm ×
tỉ lệ`; `numberFormat` không có `{n}` bị validator chặn; `maxRows` chặn đúng.
- **Đối chứng 2 tầng:** ca `revisionPolicy` vào `plugin-autocad/doi-chung/`.
- **Verify tay:** AC1–AC7, AC9, AC10 trên máy có AutoCAD 2026 (bổ sung mục vào
  `VERIFY-VA-PHAT-HANH.md`) — đặc biệt AC1 phải mở **từng layout** kiểm attribute khung tên.

## 10. Kế hoạch PR

| PR  | Nội dung                                                                                            | `route:` |
| :-- | :-------------------------------------------------------------------------------------------------- | :------- |
| PR1 | Rule pack `v<next>` + validator + `RevisionCloud` + `RevisionSnapshot` + `VaiTroVe.Revision` + test | `spec`   |
| PR2 | Adapter: 3 lệnh, `RevisionStore`, layer con theo revision, hộp thoại M106, phép kiểm FR8, tài liệu  | `spec`   |

Cả 2 PR `route: spec` — đặc tả kín, không có chỗ phải cân nhắc đánh đổi lúc code.

## 11. Rủi ro / open decisions

| Mục                                                     | Giảm thiểu                                                                                     | Quyết định                        |
| :------------------------------------------------------ | :--------------------------------------------------------------------------------------------- | :-------------------------------- |
| Mốc chỉ theo dõi đối tượng có XData XBoss               | Ghi rõ giới hạn ở FR1 và trong báo cáo; đối tượng vẽ tay không được đề xuất — kỹ sư khoanh tay | Chấp nhận (đúng phạm vi CAD-only) |
| Khung tên của dự án khác `titleblockAttrPattern`        | Pattern khai trong rule pack, sửa được per-project qua `?project=` (M101 PR4)                  | Chấp nhận                         |
| Handle đổi khi WBLOCK/copy sang tệp khác → mốc vô hiệu  | Phát hiện “mốc không khớp handle nào” → báo rõ và đề nghị chốt lại mốc, không đề xuất bừa      | Chấp nhận                         |
| Có nên đẩy mốc + danh sách cloud lên server luôn không? | Ngoài phạm vi đợt này theo quyết định 2026-08-28; mở M mới nếu cần                             | **Đã chốt: không**                |

## 12. Approval

- [x] Product/scope (CAD-only)
- [x] UX (hộp thoại + cảnh báo bỏ sót)
- [x] Architecture (mốc trong DWG, append-only số revision)
- [x] Test/verify tay
- [x] Không còn blocking question

**Kết luận:** **Approved for implementation** (người dùng chốt 2026-08-29: "duyệt tất cả").
**Người/ngày duyệt:** Seeker / 2026-08-29
