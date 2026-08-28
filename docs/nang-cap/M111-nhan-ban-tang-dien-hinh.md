# M111 — Đặc tả Nhân bản tầng điển hình (`XBOSS_VE_NHANTANG`)

| Thuộc tính       | Giá trị                                                                                                                                                           |
| :--------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Tháp căn hộ (AVIO) có hàng chục tầng điển hình giống hệt nhau; vẽ xong 1 tầng rồi chép sang N tầng phải giữ nguyên dữ liệu XBoss và tự đổi tag/tên vùng theo tầng |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                              |
| State            | **Draft** — chờ duyệt                                                                                                                                             |
| Người/ngày duyệt |                                                                                                                                                                   |
| Cập nhật         | 2026-08-28                                                                                                                                                        |
| Nguồn            | `M100-xboss-ve-shop-drawing.md` §20 hàng 3 ("giá trị lớn nhưng rủi ro nhân bản lỗi hàng loạt")                                                                    |
| Phụ thuộc        | M100 (XData 2 chiều, `TagSchedule` pattern `{type}-{floor}-{seq}`), M101 PR3 (bóc theo vùng — `Core/Zoning/`), M105 (chia đốt), M106 (hộp thoại)                  |

---

## 1. Vấn đề

Vẽ xong hệ MEPF của một tầng điển hình, kỹ sư phải có tầng 5→25. Copy bằng `COPY` của AutoCAD tạo ra
bản vẽ **trông đúng nhưng dữ liệu sai toàn tập**:

- XData `XBOSS_VE` lưu **handle** liên kết 2 chiều (tim ↔ biên ↔ nhãn ↔ vạch chia ↔ giá đỡ). Bản copy
  giữ nguyên handle **của bản gốc** ⇒ mọi lệnh sau (`XBOSS_VE_DOI`, `XBOSS_VE_CHIADOT`,
  `XBOSS_VE_NGATNET`) sửa nhầm sang tuyến tầng gốc, hoặc báo "không tìm thấy tim".
- Tag thiết bị `{type}-{floor}-{seq}` giữ nguyên tầng cũ ⇒ `XBOSS_KIEMTRA` phép 17 báo **trùng tag**
  hàng loạt, và bảng thống kê sai.
- Vùng bóc khối lượng (M101 PR3) trùng tên ⇒ sheet `Tong-hop-vung` gộp nhầm 20 tầng vào một dòng.

Đây đúng là lý do M100 §20 hoãn mục này: **giá trị lớn, rủi ro nhân bản lỗi hàng loạt**. M111 làm
việc mà `COPY` không làm được — chép kèm **ánh xạ lại toàn bộ liên kết dữ liệu**.

## 2. Outcome và guardrail

- **Target:** một lệnh chép hệ của tầng điển hình sang N tầng, sau đó `XBOSS_KIEMTRA` **không phát
  sinh lỗi mới nào**, `XBOSS_BOCKL` bóc ra đúng N lần khối lượng tầng gốc (sai số 0).
- **Guardrail:**
  1. **Không đụng tầng nguồn.** Sau lệnh, mọi đối tượng của tầng nguồn phải trùng khít trạng thái
     trước lệnh — kể cả XData.
  2. **Không sinh handle mồ côi.** Mọi handle trong XData của bản chép phải trỏ tới đối tượng **trong
     chính bản chép đó**. Đây là bất biến có test riêng (AC3), không phải mục kiểm phụ.
  3. **Không có tag trùng.** Sau lệnh `XBOSS_KIEMTRA` phép 17 phải sạch (AC4).
  4. **Xem trước bắt buộc.** Lệnh luôn hiện bảng "sẽ chép gì, sang tầng nào, tag thành gì" trước khi
     ghi — nhân bản 20 tầng sai là hỏng cả buổi làm việc.
  5. 1 lệnh = 1 nhóm UNDO cho **toàn bộ** N tầng (M100 §6.11) — không được nửa chừng.

## 3. Scope / non-goals

**Trong phạm vi:** lệnh `XBOSS_VE_NHANTANG`; khóa rule pack `drawTools.floorPolicy` (danh sách tầng,
bước cao độ, quy tắc đặt tên vùng/layout); chép **trong cùng một bản vẽ** theo lưới dời (offset X/Y
hoặc theo layout) hoặc **sang bản vẽ khác** đang mở; ánh xạ lại XData; đổi tag `{floor}`; đổi tên
vùng bóc; xem trước; báo cáo.

**Non-goals:**

- **Không** chép sang tệp DWG đóng (ghi vào tệp không mở là đường dễ hỏng dữ liệu nhất; kỹ sư mở tệp
  rồi chép, đúng như `XBOSS_BATCH` đã tách bạch chế độ side-database chỉ-đọc).
- **Không** tự dựng layout/trang in cho tầng mới — đã có `XBOSS_VE_TRANGIN`, chạy sau.
- **Không** suy tầng từ hình học (cao độ trong bản vẽ 2D là không có thật — luật M100 §6.3). Danh
  sách tầng do kỹ sư khai.
- Không xử lý tầng **khác** điển hình (tầng kỹ thuật, tầng mái) — chép rồi sửa tay, plugin không đoán.

## 4. Khóa rule pack mới (`drawTools.floorPolicy`)

Version mới = hiện hành + 1 (**lấy số thật lúc code**, xem M109 §5). Mặc định `enabled: false`.

```jsonc
"floorPolicy": {
  "enabled": false,
  "floors": ["05","06","07","08","09","10"],   // nhãn tầng dùng cho {floor}; thứ tự = thứ tự chép
  "floorsNote": "Nhãn tầng là CHUỖI (giữ số 0 đứng đầu), không phải số — tag phải khớp hồ sơ.",
  "layoutMode": "offsetY",                      // offsetY | offsetX | luoi
  "stepMm": 30000,                              // khoảng dời giữa 2 tầng liền nhau trong model space
  "gridColumns": 4,                             // chỉ dùng khi layoutMode = "luoi"
  "zoneNamePattern": "{zone}-T{floor}",         // tên vùng bóc của bản chép
  "copyRoles": ["Tim","Bien","Nhan","PhuKien","ThietBi","GiaDo","LoCho","VachChia","NhanDot"],
  "copyRolesNote": "Vai trò KHÔNG chép: MatCat, TuyenCat, BangThongKe, Revision, NgatNet — đều là hồ sơ/trình bày, dựng lại bằng lệnh của chúng sau khi chép."
}
```

Validator 2 tầng bắt: `floors` không rỗng và không trùng khi `enabled`; `stepMm` > 0;
`zoneNamePattern` phải chứa `{floor}`; `copyRoles` chỉ nhận tên vai trò có thật trong `VaiTroVe`.

## 5. Functional requirements

- **FR1 Chọn nguồn.** Kỹ sư quét chọn vùng tầng điển hình (hoặc chọn **vùng bóc** đã khai ở M101 PR3
  theo tên). Lọc theo `copyRoles`; đối tượng không mang XData `XBOSS_VE` (nền kiến trúc, xref) **bỏ
  qua kèm lý do đếm được** — nền tầng do bản kiến trúc cung cấp, plugin không chép.
- **FR2 Khai tầng nguồn + tầng đích.** Hộp thoại (M106): tầng nguồn (chuỗi, lấy sẵn từ tag đang có
  nếu suy được), danh sách tầng đích tick từ `floorPolicy.floors`, kiểu dời + `stepMm` (mặc định từ
  rule pack, sửa được).
- **FR3 Xem trước (bắt buộc — guardrail 4).** Bảng chỉ-đọc: số đối tượng theo từng vai trò, số tuyến,
  tổng chiều dài sẽ nhân thêm, danh sách tầng đích kèm **vị trí đặt** và **ví dụ tag trước → sau**
  (`FCU-05-01 → FCU-06-01`). Có nút _zoom tới_ vùng nguồn. Không bấm "Thực hiện" thì không ghi gì.
- **FR4 Chép + ánh xạ handle.** Với mỗi tầng đích: `DeepCloneObjects` toàn bộ tập nguồn trong **một**
  transaction, rồi **duyệt lại XData của bản chép và thay từng handle cũ bằng handle mới** theo bảng
  ánh xạ do `DeepCloneObjects` trả về (`IdMapping`). Handle cũ không có trong bảng ánh xạ (trỏ ra
  ngoài tập chọn) → **xóa khỏi XData** và ghi vào báo cáo, tuyệt đối không giữ handle trỏ về tầng
  nguồn (guardrail 2).
- **FR5 Đổi tag.** Với vai trò `ThietBi`/`PhuKien` có tag: phân tích tag bằng `TagSchedule.PhanTich`,
  thay `{floor}` bằng nhãn tầng đích, giữ nguyên `{type}`/`{seq}`; tag không khớp pattern → **giữ
  nguyên + cảnh báo nêu tên** (không đoán bừa). Sau khi chép, chạy lại kiểm trùng tag của
  `TagSchedule` trên toàn bản vẽ và báo ngay trong tóm tắt lệnh.
- **FR6 Đổi tên vùng bóc.** Vùng (M101 `Core/Zoning/`) trong tập chọn được chép và **đổi tên theo**
  `zoneNamePattern`; trùng tên vùng đã có → dừng cả lệnh kèm danh sách trùng (chứ không tự thêm hậu
  tố — tên vùng đi thẳng vào sheet Excel `Tong-hop-vung`, đặt bừa là sai hồ sơ).
- **FR7 Không chép hồ sơ.** Vai trò `MatCat`/`TuyenCat`/`BangThongKe`/`Revision`/`NgatNet` không chép
  (§4); tóm tắt cuối lệnh **nhắc** chạy lại `XBOSS_VE_THONGKE`/`_MATCAT`/`_NGATNET` cho tầng mới.
- **FR8 Dấu bóc.** Đối tượng nguồn đang mang dấu đã bóc (`XBOSS_BOCKL`) → bản chép **gỡ dấu bóc**
  (tầng mới chưa được bóc lần nào), cùng cách xử lý của M107 FR6.
- **FR9 Idempotent theo tầng.** Tầng đích đã có đối tượng do chính lệnh này sinh ra (XData mang
  `TangNguon` + nhãn tầng) → hộp thoại hiện rõ và hỏi: **bỏ qua tầng đó** hay **chép đè** (xóa bản
  chép cũ của đúng tầng đó rồi chép lại). Mặc định _bỏ qua_.
- **FR10 Báo cáo.** Tóm tắt: số tầng đã chép, số đối tượng mỗi tầng, số handle bị gỡ vì trỏ ra ngoài
  tập chọn, số tag không đổi được, cảnh báo trùng tag/vùng còn lại. Ghi mục tương ứng vào
  `VeSessionReport`.
- **FR11 Đường lui.** `XBOSS_UI_DIALOG=0` → hỏi đáp dòng lệnh cho kết quả trùng khít; **xem trước
  FR3 vẫn phải hiện** dưới dạng bảng text trên dòng lệnh + hỏi xác nhận.
- **FR12 Vị trí quy trình.** `BuocQuyTrinh.VeShopDrawing` (bước 3), sau `XBOSS_VE_THIETBI` — chép là
  việc của giai đoạn vẽ, trước chi tiết chế tạo.
- **NFR1** Chép 1 tầng 2000 đối tượng sang 20 tầng ≤ 60 giây; một nhóm UNDO duy nhất.
- **NFR2** Lỗi giữa chừng ở tầng thứ k → **abort transaction, không ghi tầng nào** (nguyên tử). Không
  có trạng thái "chép được 12/20 tầng".
- **NFR3** Toàn bộ logic ánh xạ tag/tên vùng/vị trí đặt ở Core thuần, test CI Linux. Không NuGet mới.

## 6. Acceptance criteria

- **AC1** Tầng 05 có 40 tuyến + 12 FCU + 3 vùng bóc → chép sang tầng 06–10 → mỗi tầng có đủ 40/12/3,
  đặt đúng vị trí theo `stepMm`.
- **AC2** Tầng nguồn trùng khít trạng thái trước lệnh (so tọa độ đỉnh + nội dung XData từng đối tượng).
- **AC3** **Không handle mồ côi:** với mọi đối tượng của tầng chép, mọi handle trong XData
  (`HandleTim`, `HandleBien`, `HandleNhan`, `HandleCapDoi`…) đều phân giải được và trỏ tới đối tượng
  **cùng tầng chép đó** — kiểm bằng script tự động, không kiểm mắt.
- **AC4** `XBOSS_KIEMTRA` sau lệnh **không phát sinh lỗi mới** so với trước; riêng phép 17 (tag trùng)
  sạch.
- **AC5** `XBOSS_BOCKL` sau lệnh cho tổng = 6 × tổng tầng 05 (nguồn + 5 tầng chép), sai số 0; sheet
  `Tong-hop-vung` có 18 dòng vùng, tên đúng `zoneNamePattern`.
- **AC6** `XBOSS_VE_DOI` đổi cỡ một tuyến ở tầng 08 → chỉ tuyến + biên + nhãn **của tầng 08** đổi;
  tầng 05 không suy suyển (đây là bằng chứng trực tiếp cho guardrail 2).
- **AC7** `XBOSS_VE_CHIADOT` chạy trên tuyến tầng 08 ra đúng số đốt như tầng 05.
- **AC8** Chạy lại lệnh cho tầng 06 với tuỳ chọn _bỏ qua_ → không sinh thêm gì; với _chép đè_ → số
  đối tượng tầng 06 không đổi (không nhân đôi).
- **AC9** Tên vùng đích trùng vùng đã có → lệnh **dừng**, bản vẽ không đổi, danh sách trùng hiện rõ.
- **AC10** Ngắt lệnh giữa chừng (Esc) hoặc lỗi ở tầng thứ 3 → bản vẽ trùng khít trạng thái ban đầu.
- **AC11** Một lần `U` hoàn tác cả 5 tầng.
- **AC12** `floorPolicy.enabled: false` (mặc định) → lệnh dừng kèm thông báo cách bật, không ghi gì.

## 7. Điểm chạm code

| Tầng           | Tệp                                                                | Vai trò                                                                                  |
| :------------- | :----------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| Rule pack (TS) | `lib/ky-thuat/cad/rule-packs/v<next>.json` + validator             | Khóa `floorPolicy`                                                                       |
| Core           | `RulePack/RulePackModels.cs`, `RulePackLoader.cs`                  | Đọc + validate                                                                           |
| Core (mới)     | `Draw/FloorReplicator.cs`                                          | Vị trí đặt từng tầng, đổi tag, đổi tên vùng, **kế hoạch ánh xạ handle** — thuần, có test |
| Core           | `Draw/TagSchedule.cs`                                              | Dùng lại `PhanTich`/`Dung` cho `{floor}` — không viết lại                                |
| Core           | `Zoning/VungClipper.cs`                                            | Dời + đổi tên vùng                                                                       |
| Core           | `Draw/VeXData.cs`                                                  | Thêm `TangNguon` + `NhanTang` (nhận diện bản chép — FR9)                                 |
| Core           | `Ui/ViewModels/NhanTangDialogViewModel.cs` (mới)                   | Hộp thoại + bảng xem trước FR3                                                           |
| Core           | `Ui/LenhCatalog.cs`, `Reporting/VeSessionReport.cs`                | Khai lệnh + mục báo cáo                                                                  |
| Adapter (mới)  | `XBoss.Cad.Acad/Commands/VeNhanTangCommands.cs`                    | `DeepCloneObjects` + `IdMapping` → thi hành kế hoạch của Core                            |
| Adapter        | `Services/VeThucThe.cs`, `Services/MarkService.cs`                 | Gỡ dấu bóc bản chép (FR8), xóa bản chép cũ (FR9)                                         |
| Adapter        | `Ui/Wpf/XBossDialog.xaml`                                          | `DataTemplate` cho ViewModel mới                                                         |
| Shim           | `XBoss.Cad.AcadShim/AcadStub.cs`                                   | Stub `DeepCloneObjects`/`IdMapping` nếu còn thiếu                                        |
| Tài liệu       | `plugin-autocad/README.md`, `CAI-DAT.md`, `VERIFY-VA-PHAT-HANH.md` | Lệnh mới + mục verify tay                                                                |

Không migration, không API, không đụng web.

## 8. Test plan

- **Core (xunit):** vị trí đặt theo `offsetX`/`offsetY`/`luoi`; đổi tag đúng `{floor}` và giữ
  `{type}`/`{seq}`; tag không khớp pattern → giữ nguyên + cảnh báo; đổi tên vùng theo pattern; **kế
  hoạch ánh xạ handle**: handle trong tập → thay, handle ngoài tập → gỡ (bảng ánh xạ giả lập, không
  cần AutoCAD); validator bắt đủ 4 lỗi §4.
- **Đối chứng 2 tầng:** ca `floorPolicy` vào `plugin-autocad/doi-chung/`.
- **Script kiểm handle mồ côi (AC3):** viết như một lệnh phụ trợ `XBOSS_VE_KIEMHANDLE` hoặc một phép
  kiểm mới trong `XBOSS_KIEMTRA` — **quyết định lúc duyệt** (xem §10). Dù chọn đường nào, AC3 phải
  kiểm được tự động chứ không kiểm mắt.
- **Verify tay:** AC1–AC12 trên máy có AutoCAD 2026; bổ sung mục vào `VERIFY-VA-PHAT-HANH.md`. Đây là
  lệnh **rủi ro cao nhất** trong cả bộ plugin — verify tay phải làm trên bản vẽ thật của dự án AVIO
  trước khi phát hành rộng.

## 9. Kế hoạch PR

| PR  | Nội dung                                                                                                      | `route:`   |
| :-- | :------------------------------------------------------------------------------------------------------------ | :--------- |
| PR1 | Rule pack `v<next>` + validator + `FloorReplicator` (vị trí/tag/vùng/kế hoạch ánh xạ) + XData mới + test Core | `spec`     |
| PR2 | Adapter: lệnh, `DeepCloneObjects` + thi hành ánh xạ handle, xem trước FR3, FR8/FR9, nguyên tử NFR2            | `complex`  |
| PR3 | Kiểm handle mồ côi tự động (AC3) + tài liệu + mục verify tay                                                  | `standard` |

PR2 là `complex`: `DeepCloneObjects` + `IdMapping` + tính nguyên tử là chỗ phải cân nhắc đánh đổi.
**Ranh giới được phép quyết trong PR2:** cách gom transaction cho N tầng (một transaction lớn hay
transaction lồng có rollback thủ công), cách xử lý đối tượng thuộc nhiều vùng cùng lúc. **Không được
tự quyết:** bỏ bất kỳ guardrail nào ở §2, đổi `copyRoles`, hay chép sang tệp đóng.

## 10. Rủi ro / open decisions

| Mục                                                                  | Giảm thiểu                                                                                              | Quyết định                        |
| :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :-------------------------------- |
| Nhân bản sai hàng loạt (lý do M100 §20 hoãn mục này)                 | Xem trước bắt buộc FR3 + nguyên tử NFR2 + AC3/AC6 + verify tay trên bản vẽ AVIO thật                    | Chấp nhận với đủ 4 chốt           |
| `DeepCloneObjects` không chép XData trên vài loại thực thể           | Phải xác minh **ngay đầu PR2** trên máy có AutoCAD; nếu thiếu thì tự ghi lại XData sau khi clone        | Xác minh trước khi code tiếp      |
| Kiểm handle mồ côi: lệnh riêng hay phép kiểm trong `XBOSS_KIEMTRA`?  | Phép kiểm trong `XBOSS_KIEMTRA` có lợi lâu dài (mọi lệnh đều được canh), tốn thêm một số hiệu phép kiểm | **Open — chốt khi duyệt**         |
| Tầng nguồn chưa chuẩn (KIEMTRA đang đỏ) thì chép nhân lỗi lên N tầng | Hộp thoại cảnh báo nếu `XBOSS_KIEMTRA` gần nhất có lỗi; **không chặn** (kỹ sư quyết)                    | **Open — chặn hay chỉ cảnh báo?** |
| Bản chép trong cùng model space làm bản vẽ quá nặng                  | `layoutMode` cho phép chọn lưới; ghi khuyến nghị mỗi tệp ≤ 10 tầng trong `CAI-DAT.md`                   | Chấp nhận                         |

## 11. Approval

- [ ] Product/scope
- [ ] UX (xem trước bắt buộc)
- [ ] Architecture (ánh xạ handle, nguyên tử)
- [ ] Test/verify tay (AC3 tự động)
- [ ] Không còn blocking question (2 mục Open ở §10)

**Kết luận:** Draft — chờ duyệt.
