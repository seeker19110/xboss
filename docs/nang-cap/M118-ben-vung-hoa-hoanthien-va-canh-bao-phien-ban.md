# M118 — Bền vững hoá `XBOSS_HOANTHIEN` + cảnh báo phiên bản plugin lệch server

| Thuộc tính       | Giá trị                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đóng 2 nợ kỹ thuật ghi nhận ở review M115 PR3 (`PROGRESS.md` 2026-08-30) + 1 khoảng trống vận hành phát hiện khi rà toàn cụm plugin      |
| Spec owner       | Phiên chính (opusplan)                                                                                                                   |
| State            | Draft                                                                                                                                    |
| Người/ngày duyệt | —                                                                                                                                        |
| Cập nhật         | 2026-08-30                                                                                                                               |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Ba vấn đề, hai cái đầu là nợ kỹ thuật **đã ghi nhận nguyên văn** trong `PROGRESS.md` mục M115
(2026-08-30, review PR3), cái thứ ba phát hiện khi rà toàn cụm plugin 2026-08-30:

**a) Lỗi giữa pipeline làm bung lệnh, không có báo cáo.** `HoanThienPipeline.Chay`
(`plugin-autocad/XBoss.Cad.Acad/Services/HoanThienPipeline.cs:57`) chạy 8 giai đoạn trong một
vòng `foreach` **không có try/catch bao quanh từng giai đoạn**. Chỉ `DonThucTheM115` bắt riêng
`Autodesk.AutoCAD.Runtime.Exception`; một lỗi .NET thường (`InvalidOperationException`,
`KeyNotFoundException`, lỗi trong service con…) ở giai đoạn ④ sẽ bung thẳng khỏi
`[CommandMethod]`: kỹ sư thấy stack trace của AutoCAD, các giai đoạn ①–③ đã `tr.Commit()` nằm
lại trong bản vẽ, **báo cáo phiên (`VeSessionReport`) không được ghi** nên không có dấu vết
giai đoạn nào xong/giai đoạn nào chưa. Chấp nhận được về dữ liệu (mỗi giai đoạn idempotent —
chạy lại là tự dọn), nhưng trải nghiệm là "lệnh crash", trái với chính nguyên tắc đã khai trong
doc-comment của `Chay`: *"một giai đoạn thiếu tham số rule pack không được phép chặn 7 giai
đoạn kia"* — hiện nguyên tắc đó chỉ đúng với lỗi **đoán trước được** (nhánh `return` sớm),
không đúng với exception.

**b) 4/8 giai đoạn ủy thác ghi đè tinh chỉnh tay của kỹ sư.** Hai giai đoạn M115 tự sinh (phụ
kiện ②, lỗ chờ ⑤) mang `BamHinhHoc` (băm hình học lúc sinh — khuôn M114 FR12): chạy lại
`XBOSS_HOANTHIEN`, thực thể kỹ sư đã dời tay được **giữ nguyên** (`DaSuaTay`,
`HoanThienPipeline.cs:545`). Nhưng 4 giai đoạn ủy thác cho lệnh gốc — **chia đốt ③, giá đỡ ④,
ngắt nét ⑥, thống kê ⑧** — dùng cơ chế idempotent riêng của từng lệnh (xóa theo handle tim:
`VeThucThe.XoaChiaDotCua`, `VeThucThe.XoaNgatNet`…), thực thể sinh ra **không mang
`BamHinhHoc`** (đã xác minh: `grep BamHinhHoc|SuaTay` trên 4 tệp lệnh = 0 kết quả). Hệ quả: kỹ
sư nhích một vạch chia cho khỏi đè text, dời một giá đỡ né lỗ mở trần, kéo bảng thống kê sang
góc khác — chạy lại `XBOSS_HOANTHIEN` là mất sạch. Với vòng lặp tự nhiên của M115 (vẽ thêm
tuyến → chạy lại HOANTHIEN), đây là mất công người thật, đúng loại lỗi mà M114 FR12 sinh ra để
chặn.

**c) Kỹ sư chạy plugin cũ vô hạn mà không ai biết.** Server đã lộ version gói cài đang phát
hành qua `GET /api/engineering/cad/plugin-package` (đọc thẻ `<Version>` trong
`plugin-autocad/Directory.Build.props` — nguồn sự thật duy nhất, `dong-goi.ps1` cũng đọc đúng
thẻ này) cho trang `/engineering/cai-dat-plugin`. Nhưng **plugin không bao giờ so** version
assembly của chính nó với con số đó (đã xác minh: không chỗ nào trong `XBoss.Cad.Acad`/`Core`
đọc `Assembly.GetName().Version` hay gọi route trên). Bundle cài tay từng máy (không có
auto-update — M99 §18), nên một kỹ sư dùng bản 3 tháng tuổi với rule pack v16 mới sẽ chỉ phát
hiện khi lệnh hỏng khó hiểu. Vai trò chịu ảnh hưởng: kỹ sư (mất công vẽ lại, lỗi khó hiểu),
PM/Admin (không có cách nào biết đội đang chạy bản nào).

## 2. Outcome, metric và guardrail

- **Outcome:** chạy lại `XBOSS_HOANTHIEN` an toàn tuyệt đối với công sức tay của kỹ sư ở cả
  8 giai đoạn; lỗi bất kỳ ở một giai đoạn không làm mất báo cáo phiên và không chặn các giai
  đoạn còn lại; plugin lệch phiên bản tự lộ diện trong vòng một lần `XBOSS_RULEPACK`.
- **Metric:** số ca "chạy lại HOANTHIEN mất chỉnh tay" ở 4 giai đoạn ③④⑥⑧ = 0 (đo bằng AC2);
  100% lần chạy có `VeSessionReport` kể cả khi có giai đoạn lỗi (AC1).
- **Guardrail:**
  - **Không đổi hành vi lệnh lẻ chạy tay** (`XBOSS_VE_CHIADOT`/`_GIADO`/`_NGATNET`/`_THONGKE`
    gõ trực tiếp): cơ chế idempotent riêng của chúng giữ nguyên — bảo vệ SuaTay chỉ kích hoạt
    trên thực thể mang `nguon=M115` (sinh qua pipeline). Đây là bất biến có test (AC3).
  - Cảnh báo phiên bản **không bao giờ chặn** lệnh nào; mạng lỗi/401/version null → im lặng
    bỏ qua (fail mềm), tuyệt đối không cảnh báo sai.
  - Không migration, không bảng mới, không khoá rule pack mới (xem §7 NFR3 vì sao đây là bug
    fix, không phải tính năng cần cờ).
  - Rollback = revert PR; không có trạng thái bền nào ngoài XData ghi thêm trường sẵn có.

## 3. Nghiên cứu hiện trạng

- `HoanThienPipeline.Chay` — vòng 8 giai đoạn, switch theo `viec.GiaiDoan.Ten`
  (`HoanThienPipeline.cs:67-84`); nguyên tắc "không chặn 7 giai đoạn kia" ở doc-comment dòng 54.
  `DonThucTheM115` (dòng 480) + `DaSuaTay` (dòng 545) là khuôn giữ-tay hiện có của giai đoạn ②⑤;
  quyết định xóa/giữ tính ở Core `HoanThienKeHoach.TinhThayThe` (có test).
- 4 lệnh ủy thác nhận `giaiDoanM115` và đã ghi `NguonHoanThien`/`GiaiDoanHoanThien` vào XData
  thực thể sinh ra (vd `VeChiaDotCommands.cs:527-531`, `VeGiadoCommands.cs:156-165`,
  `VeThongkeCommands.cs:241-242`) — **nền XData đã có, chỉ thiếu `BamHinhHoc`**. Cơ chế xóa cũ
  của từng lệnh: `VeThucThe.XoaChiaDotCua` (theo handle tim), `VeThucThe.XoaNgatNet`, giá đỡ
  xóa theo handle tim trong `ChayGiaDo`, bảng thống kê cập nhật tại chỗ trong `VeBangService`.
- `VeXDataInfo` đã có trường `BamHinhHoc`, `SuaTay`, `NguonHoanThien`, `GiaiDoanHoanThien`,
  `HandleTim` — không cần thêm trường XData mới. `RevisionSnapshot.BamHinhHoc(dinh)` là hàm băm
  dùng chung (M110/M114).
- `VeSessionReport` (`XBoss.Cad.Core/Reporting/`) — báo cáo phiên vẽ, M115 PR3 đã có mục cho
  HOANTHIEN.
- Phiên bản: `Directory.Build.props` thẻ `<Version>` (hiện `1.0.0`) → nhúng vào assembly lúc
  build; server đọc cùng thẻ qua `bocVersionTuNoiDung`/`docVersionGoiCai`
  (`lib/ky-thuat/cad/dashboard.ts:485-530`), lộ qua route
  `app/api/engineering/cad/plugin-package/route.ts` — **route này hiện chỉ auth session cookie
  (`getCurrentUser`)**, chưa nhận Bearer token scope `cad` như route `rule-pack`
  (`getCadTokenUser` kiểm trước, fallback session — `app/api/engineering/cad/rule-pack/route.ts:31-35`).
  Plugin gọi server qua `XBossApiClient` + token trong `CredentialStore`
  (`XBossCommands.cs:866`); bảng `XBOSS_BANG` tab Trạng thái gom hiển thị qua
  `Ui/TrangThaiGom.cs`.
- Vùng audit liên quan: không chạm `lib/tien-do/recompute.ts`/`auth.ts`/`material-sync.ts`/
  `boq.ts`/route tài chính. Route `plugin-package` sửa auth phải rà theo `docs/audit.md` §1
  (phân quyền) — mẫu đã có sẵn ở `rule-pack`.

## 4. Phương án

| Phương án                                                                       | Lợi ích                                        | Chi phí/rủi ro                                                                                   | Kết luận |
| ------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Không làm                                                                        | 0                                              | Mất công tay kỹ sư mỗi lần chạy lại HOANTHIEN; lệnh crash không dấu vết; plugin cũ chạy vô hạn    | Loại     |
| A — vá tối thiểu theo khuôn sẵn có (FR1 try/catch từng giai đoạn; FR2 nối `BamHinhHoc` vào 4 lệnh khi `giaiDoanM115 != null`; FR3 so version lúc `XBOSS_RULEPACK`) | Diff nhỏ, tái dùng `DaSuaTay`/`RevisionSnapshot`/`getCadTokenUser` nguyên khuôn; không đổi hành vi lệnh lẻ | Bảo vệ SuaTay chỉ phủ thực thể sinh qua pipeline, lệnh lẻ vẫn như cũ (chấp nhận — đúng ranh giới "quyền quyết định thuộc chính lệnh đó" đã khai ở `DaSuaTay`) | **Chọn** |
| B — SuaTay toàn cục cho cả lệnh lẻ + transaction bao ngoài rollback cả pipeline | Phủ mọi đường                                  | Đổi hành vi 4 lệnh đã phát hành; transaction lồng khóa chết service con (đã ghi rõ ở doc-comment `Chay` mục 4); diff lớn | Loại     |

## 5. Scope / non-goals

**Scope:** đúng 3 FR ở §7, toàn bộ trong `plugin-autocad/` + 1 route web sửa auth + 1 dòng UI
web hiện version (đã có sẵn trang, chỉ xác nhận không vỡ).

**Non-goals:**
- KHÔNG tự cập nhật plugin (auto-update/tải gói từ trong AutoCAD) — chỉ cảnh báo; đường phát
  hành vẫn là gói `.zip` + `CAI-DAT.md`.
- KHÔNG đổi cơ chế idempotency của 4 lệnh khi chạy tay (lệnh lẻ, không qua pipeline).
- KHÔNG thêm khái niệm SuaTay cho nét đôi ① và tag ⑦ (nét đôi do `XBOSS_VE_NEN` quản theo chế
  độ nền — hoàn nguyên là hành vi chủ đích; tag do `DanhLai` đánh lại toàn bản vẽ là hành vi
  đúng của lệnh gốc — kỹ sư đổi text tag là đổi dữ liệu, không phải dời hình).
- KHÔNG chạm M116/M117 (đặc tả riêng đã duyệt, thi hành sau).
- KHÔNG làm bảng theo dõi "máy nào chạy bản nào" phía server (mở M mới nếu cần sau UAT).

## 6. User journeys và mọi trạng thái

- **Happy (FR2):** kỹ sư chạy `XBOSS_HOANTHIEN` → dời tay 2 giá đỡ + 1 vạch chia + kéo bảng
  thống kê sang phải → vẽ thêm 1 tuyến, chốt lại đồ thị → chạy lại `XBOSS_HOANTHIEN` → phần tử
  của tuyến mới sinh đủ; 2 giá đỡ, 1 vạch chia, vị trí bảng **giữ nguyên**; dòng tóm tắt in
  "Giữ nguyên N thực thể kỹ sư đã dời/sửa tay".
- **Error giữa pipeline (FR1):** giai đoạn ④ ném exception → dòng `✖ Giá đỡ: lỗi — <message>`
  in ra, giai đoạn ⑤–⑧ vẫn chạy, cuối lệnh in tổng kết `7/8 giai đoạn xong, 1 lỗi — chạy lại
  XBOSS_HOANTHIEN sau khi xử lý là an toàn (idempotent)`, `VeSessionReport` ghi đủ 8 dòng kèm
  trạng thái. `U` một lần vẫn hoàn tác trọn phần đã vẽ.
- **Plugin cũ (FR3):** kỹ sư `XBOSS_RULEPACK` → sau dòng kết quả rule pack in thêm
  `⚠ Plugin đang chạy 1.0.0, server phát hành 1.2.0 — tải bản mới ở <APP_URL>/engineering/cai-dat-plugin`;
  `XBOSS_BANG` tab Trạng thái thêm dòng "Phiên bản plugin: 1.0.0 (server: 1.2.0 — cũ)". Lệnh
  vẫn chạy bình thường, không chặn gì.
- **Offline/mất mạng (FR3):** fetch version lỗi/timeout → không in gì thêm, `XBOSS_BANG` ghi
  "Phiên bản plugin: 1.0.0 (server: chưa rõ)". Không bao giờ hiện cảnh báo khi không chắc.
- **Server chưa cấu hình version (trả `version: null`):** như mất mạng — im lặng.
- **Unauthorized:** token hết hạn → 401 → như mất mạng (fail mềm); không nhắc đăng nhập lại chỉ
  vì check version (lệnh `XBOSS_RULEPACK` đã có nhắc riêng của nó).

## 7. Functional và non-functional requirements

**FR1 — Cách ly lỗi từng giai đoạn trong `HoanThienPipeline.Chay`.**
- Bọc **thân từng giai đoạn** (switch dòng 70) trong `try/catch (System.Exception)`; catch trả
  `KetQuaGiaiDoan(viec.GiaiDoan, DaChay: false, TomTat: "lỗi — <ex.Message>")` kèm trường mới
  `Loi: true` trên record `KetQuaGiaiDoan` để báo cáo phân biệt "bỏ qua có lý do" với "lỗi".
- Sau catch pipeline **đi tiếp** giai đoạn kế (đúng nguyên tắc doc-comment dòng 54; mỗi giai
  đoạn idempotent nên chạy lại vá được).
- Lệnh `XBOSS_HOANTHIEN` (`HoanThienCommands.cs`) in dòng `✖` cho giai đoạn lỗi, cuối lệnh in
  tổng kết `x/8 xong, y lỗi` + nhắc chạy lại an toàn khi `y > 0`; `VeSessionReport` ghi đủ mọi
  giai đoạn kèm cờ lỗi.
- KHÔNG thêm transaction bao ngoài (bất biến mục 4 doc-comment — transaction lồng khóa chết
  service con). KHÔNG rollback giai đoạn đã xong.

**FR2 — Bảo vệ sửa tay cho 4 giai đoạn ủy thác (③ chia đốt, ④ giá đỡ, ⑥ ngắt nét, ⑧ thống kê).**
- Khi `giaiDoanM115 != null` (tức chạy qua pipeline), thực thể sinh ra ghi thêm
  `BamHinhHoc = RevisionSnapshot.BamHinhHoc(<đỉnh đại diện>)` vào XData (các trường
  `NguonHoanThien`/`GiaiDoanHoanThien`/`HandleTim` đã ghi sẵn từ M115 PR3). Đỉnh đại diện từng
  loại: vạch chia = 2 đầu `Line`; nhãn đốt = điểm chèn text; giá đỡ = `BlockReference.Position`;
  đối tượng ngắt nét (vùng che/cung) = điểm đại diện sẵn có của `VeThucThe` cho loại đó; bảng
  thống kê = điểm chèn bảng.
- Đường **dọn cũ** của từng lệnh, CHỈ khi được gọi với `giaiDoanM115 != null`, phải giữ lại
  thực thể có `SuaTay == true` hoặc băm hiện tại ≠ `BamHinhHoc` (tái dùng đúng logic
  `DaSuaTay` — chuyển hàm này về Core, vd `HoanThienKeHoach`, cho cả pipeline lẫn 4 lệnh dùng
  chung, kèm test); đếm và báo `Giữ nguyên N thực thể đã sửa tay` trong tóm tắt giai đoạn.
- Chạy tay lệnh lẻ (`giaiDoanM115 == null`): **không đổi một hành vi nào** — thực thể không
  mang băm, đường dọn cũ như hiện tại. (Đúng ranh giới đã khai ở `DaSuaTay`: "thực thể không
  mang băm thì quyền quyết định thuộc chính lệnh đó".)
- Riêng bảng thống kê ⑧: "sửa tay" nghĩa là **dời bảng** — cập nhật nội dung phải giữ vị trí
  bảng hiện tại (nếu `VeBangService` đã cập nhật tại chỗ thì chỉ thêm test khẳng định; nếu đang
  xóa-vẽ-lại tại vị trí mặc định thì sửa cho cập nhật tại vị trí hiện tại). Nội dung bảng luôn
  được ghi mới — đó là mục đích của việc chạy lại, không coi là "sửa tay".
- Vạch chia/giá đỡ bị kỹ sư **xóa hẳn** (không phải dời): chạy lại được sinh lại — xóa không
  để lại XData nên không phân biệt được với "chưa từng sinh", chấp nhận và ghi rõ trong tài
  liệu lệnh (nhất quán với giai đoạn ②⑤ hiện tại).

**FR3 — Cảnh báo phiên bản plugin lệch server.**
- Server: `app/api/engineering/cad/plugin-package/route.ts` nhận thêm Bearer token scope `cad`
  theo ĐÚNG khuôn `rule-pack/route.ts:31-35` (`getCadTokenUser` kiểm trước, fallback
  `getCurrentUser`; quyền vẫn `CAN.viewEngineeringGraph`). Không đổi shape response.
- Core (`XBoss.Cad.Core`): hàm thuần `SoLechPhienBan(cuaPlugin, cuaServer)` — so **khác chuỗi**
  sau khi chuẩn hoá (trim, bỏ hậu tố build metadata nếu có); server là nguồn sự thật, không cần
  so lớn/nhỏ. `null`/rỗng ở một trong hai vế → "chưa rõ", không lệch. Có test.
- Adapter: version của chính plugin đọc từ `AssemblyInformationalVersion` (nhúng từ thẻ
  `<Version>` của `Directory.Build.props` lúc build — cùng nguồn sự thật với server, không
  hard-code). `XBossApiClient` thêm `FetchPluginPackageAsync(token)` gọi `GET /plugin-package`,
  timeout ngắn theo khuôn `TaiSnapshotBoq` (`XBossCommands.cs:912-918`). Gọi ở 2 chỗ:
  (1) cuối `XBOSS_RULEPACK` sau khi kéo rule pack thành công — in dòng `⚠` nếu lệch;
  (2) `XBOSS_BANG` tab Trạng thái (`TrangThaiGom`) — dòng "Phiên bản plugin: X (server: Y)".
- Mọi lỗi fetch (mạng/401/403/timeout/`version: null`) → nuốt im lặng, hiển thị "server: chưa
  rõ" ở `XBOSS_BANG`, KHÔNG in cảnh báo ở `XBOSS_RULEPACK`. Không cache cảnh báo qua phiên.

**NFR:**
1. Logic quyết định (so băm, so version, tính giữ/xóa) nằm ở **Core**, test được trên CI Linux
   bằng xunit + AcadShim — Core không chạm `Database`/`Editor` (khuôn M106/M115).
2. Mọi thông điệp tiếng Việt, đi qua `ed.WriteMessage` như hiện tại; không PII (không gửi tên
   máy/tên người lên server — request version là GET không body).
3. **Không khoá rule pack mới:** FR1/FR2 là bug fix an toàn hơn cho người dùng (không sinh
   thêm hình học, chỉ bớt phá và bớt crash), FR3 là cảnh báo thuần — không cái nào đổi kết quả
   vẽ của một bản vẽ đã đúng, nên không cần cờ tắt/bật theo dự án như các tính năng vẽ M109+.
4. Backward compatible: XData cũ (thực thể sinh trước M118, không có `BamHinhHoc`) đi qua
   đường dọn cũ như hiện tại — không đổi hành vi trên bản vẽ đã có.

## 8. Acceptance criteria

- **AC1 (FR1):** Given kế hoạch 8 giai đoạn mà giai đoạn ④ ném `InvalidOperationException`
  (test AcadShim: mock service ném lỗi), When `Chay`, Then trả đủ 8 `KetQuaGiaiDoan`, phần tử
  thứ 4 có `Loi == true`, các giai đoạn ⑤–⑧ có chạy (mock ghi nhận lời gọi), không exception
  thoát khỏi `Chay`. → test xunit `HoanThienPipelineTests`.
- **AC2 (FR2, ca chính):** Given bản vẽ đã `XBOSS_HOANTHIEN` xong, kỹ sư dời 1 vạch chia +
  1 giá đỡ + bảng thống kê (test: sửa tọa độ thực thể trong shim), When chạy lại pipeline,
  Then 3 thực thể đó giữ nguyên tọa độ, các thực thể không dời bị xóa-sinh lại, tóm tắt có
  "Giữ nguyên 3". → test xunit trên shim + verify tay C12.
- **AC3 (guardrail, bất biến):** Given tuyến có vạch chia sinh bởi lệnh lẻ `XBOSS_VE_CHIADOT`
  (không `giaiDoanM115`), kỹ sư dời 1 vạch, When chạy lại lệnh lẻ, Then hành vi Y HỆT trước
  M118 (vạch dời bị xóa-sinh lại theo cơ chế cũ). → test xunit khẳng định hành vi cũ.
- **AC4 (FR2):** Given thực thể giai đoạn ③④⑥⑧ sinh qua pipeline, Then XData có `BamHinhHoc`
  không rỗng và `GiaiDoanHoanThien` đúng tên giai đoạn; sinh qua lệnh lẻ Then không có
  `BamHinhHoc`. → test xunit.
- **AC5 (FR3):** Given assembly version `1.0.0`, server trả `{version: "1.2.0"}`, When
  `XBOSS_RULEPACK`, Then in đúng 1 dòng cảnh báo chứa cả hai số; Given server trả
  `{version: null}` hoặc fetch ném lỗi, Then không in cảnh báo. → test Core
  (`SoLechPhienBan`) + test shim cho đường in.
- **AC6 (FR3 server):** Given request có Bearer token cad hợp lệ của user có quyền, When GET
  `/api/engineering/cad/plugin-package`, Then 200 + shape cũ; token sai → 401; role không có
  `viewEngineeringGraph` → 403; web session như cũ. → node:test route (khuôn test rule-pack
  sẵn có).
- **AC7 (FR1+FR2):** `U` một lần sau `XBOSS_HOANTHIEN` (kể cả lần chạy có giai đoạn lỗi) hoàn
  tác trọn phần đã vẽ của lần đó. → verify tay C12 (không tự động hoá được trên shim).
- **AC8:** `VeSessionReport` của lần chạy có lỗi vẫn ghi đủ 8 giai đoạn + cờ lỗi. → test xunit.

## 9. Kiến trúc và điểm chạm code

Không đổi ranh giới nào (ADR-0007/0008 không liên quan phần plugin; route web giữ nguyên vai
trò ranh giới HTTP). Tệp dự kiến chạm:

- `plugin-autocad/XBoss.Cad.Acad/Services/HoanThienPipeline.cs` — FR1 try/catch, FR2 truyền
  cờ; `Commands/HoanThienCommands.cs` — in tổng kết + report.
- `plugin-autocad/XBoss.Cad.Core/Graph/HoanThienKeHoach.cs` (hoặc tệp cạnh đó) — chuyển
  `DaSuaTay` thuần về Core, record `KetQuaGiaiDoan` thêm `Loi`.
- `plugin-autocad/XBoss.Cad.Acad/Commands/VeChiaDotCommands.cs`, `VeGiadoCommands.cs`,
  `VeNgatNetCommands.cs`, `VeThongkeCommands.cs` (+ `Services/VeBangService.cs`,
  `Services/VeThucThe.cs`) — FR2 ghi băm + đường dọn giữ-tay khi `giaiDoanM115 != null`.
- `plugin-autocad/XBoss.Cad.Core` — `SoLechPhienBan` + DTO `PluginPackageInfo`;
  `XBossApiClient.FetchPluginPackageAsync`.
- `plugin-autocad/XBoss.Cad.Acad/Commands/XBossCommands.cs` (`XBOSS_RULEPACK`) +
  `Ui/TrangThaiGom.cs` — FR3 hiển thị.
- `plugin-autocad/XBoss.Cad.AcadShim/AcadStub.cs` — stub bổ sung nếu thiếu API.
- `app/api/engineering/cad/plugin-package/route.ts` — nhận Bearer (khuôn rule-pack).
- `plugin-autocad/VERIFY-VA-PHAT-HANH.md` — mục **C12** mới (AC2/AC5/AC7 trên AutoCAD 2026).
- `plugin-autocad/README.md` + `CAI-DAT.md` — ghi hành vi giữ-tay + cảnh báo version.

## 10. API contract

Không API mới. Một route sửa auth:

`GET /api/engineering/cad/plugin-package`
- Auth: `getCadTokenUser(Authorization: Bearer <token cad>)` kiểm trước → fallback
  `getCurrentUser()` (session). Quyền: `CAN.viewEngineeringGraph`. 401 chưa đăng nhập/token
  sai; 403 thiếu quyền.
- Response 200 (không đổi): `{ "version": string | null, "sha256": string | null }`.
- Idempotent GET, không tham số; plugin gọi tối đa 1 lần mỗi lần `XBOSS_RULEPACK`/mở
  `XBOSS_BANG`, timeout phía client theo khuôn `TaiSnapshotBoq`, không retry (fail mềm).

## 11. Data contract và DDL

Không migration, không bảng, không cột. Dữ liệu mới duy nhất là trường `BamHinhHoc` (đã tồn
tại trong schema XData `VeXDataInfo`) được ghi thêm trên thực thể do 4 giai đoạn ủy thác sinh
qua pipeline — sống trong DWG, tương thích ngược (thực thể cũ không băm đi đường cũ, §7 NFR4).

## 12. Security/privacy/abuse

- Route `plugin-package` sau sửa: mẫu auth y hệt `rule-pack` (đã qua audit M99 PR2); không lộ
  thêm dữ liệu (shape giữ nguyên, version gói cài không nhạy cảm hơn trang cài đặt đang hiện).
- Plugin gửi đúng token sẵn có, không gửi định danh máy/người mới; không ghi version của máy
  lên server (không có chiều ghi).
- Không đường SQL mới. Không upload. Rate limit: route đã nằm sau `hitRateLimit`? — nếu route
  hiện chưa có rate limit thì GIỮ NGUYÊN như các route GET đọc nhẹ cùng nhóm (không thêm —
  tránh phạt nhầm `XBOSS_BANG` mở nhiều lần; route chỉ đọc tệp tĩnh + env).

## 13. UX/a11y/content

- Toàn bộ chuỗi tiếng Việt; ký hiệu trạng thái theo bộ đang dùng của pipeline (`✔`/`—`, thêm
  `✖` cho lỗi) — thông tin không chỉ bằng màu (console AutoCAD không màu, ký hiệu là đủ).
- `XBOSS_BANG` dòng version: text thuần trong tab Trạng thái hiện có, theo layout sẵn — không
  control mới, không đổi theme/tương phản (ADR-0010 không bị chạm).
- Copy chốt: cảnh báo `⚠ Plugin đang chạy {X}, server phát hành {Y} — tải bản mới tại
  {APP_URL}/engineering/cai-dat-plugin` (APP_URL lấy từ base URL đã lưu ở `CredentialStore` —
  chính là server plugin đang nối, không đọc env phía máy kỹ sư).

## 14. Observability và vận hành

- `VeSessionReport` là kênh quan sát chính: thêm cờ lỗi từng giai đoạn + đếm "giữ vì sửa tay"
  (không PII). Không metric server mới.
- Runbook: kỹ sư gặp `✖` → xử lý theo message → chạy lại `XBOSS_HOANTHIEN` (an toàn,
  idempotent); thấy cảnh báo version → tải gói theo `CAI-DAT.md`, đối chiếu sha256 trên trang
  cài đặt. Owner: đội plugin.

## 15. Test plan

- **xunit (CI Linux, AcadShim):** AC1 (lỗi giữa pipeline), AC2 (giữ-tay 4 giai đoạn), AC3
  (bất biến lệnh lẻ), AC4 (XData băm), AC8 (report); Core: `SoLechPhienBan` (lệch/khớp/null/
  metadata), `DaSuaTay` sau khi chuyển về Core (các ca băm khớp/lệch/không băm/cờ SuaTay).
- **node:test:** AC6 route `plugin-package` với Bearer/session/403 (khuôn test rule-pack);
  không test DB (route không chạm DB).
- **Verify tay AutoCAD 2026 — mục C12 mới:** AC2 thao tác chuột thật, AC5 hai máy lệch bản,
  AC7 một lần `U`; xếp hàng SAU C9 (M111), C10 (M114), C11 (M115) theo thứ tự nợ hiện có.
- Không E2E web mới (UI web không đổi hành vi), không axe mới (không control mới).

## 16. Kế hoạch slice/PR

Ba PR, độc lập triển khai theo thứ tự; không PR nào phụ thuộc migration/staging:

1. **PR1 — FR1 cách ly lỗi + report** · `route: standard` — phạm vi rõ, 2 tệp + test; đặc tả
   kín ở §7 FR1.
2. **PR2 — FR2 giữ-tay 4 giai đoạn** · `route: spec` — phức tạp (6–7 tệp đan nhau, chạm 4 lệnh
   đã phát hành) nhưng đặc tả đã kín: hành vi từng giai đoạn, đỉnh đại diện băm, ranh giới
   lệnh lẻ, AC2–AC4. Không có chỗ tự quyết.
3. **PR3 — FR3 cảnh báo version** · `route: standard` — server 1 route theo khuôn sẵn +
   Core/Adapter nhỏ + C12 + tài liệu.

Mỗi PR tự chạy đủ cổng plugin (`dotnet test` AcadShim 0 warning) + cổng web khi chạm web
(`npm run lint`/`typecheck`/`test`), cập nhật `PROGRESS.md` trước khi push (DoD).

## 17. Rollout/rollback

- Không migration → không staging bắt buộc; PR3 chạm route web nhưng chỉ nới auth theo khuôn
  đã audit — deploy thẳng theo luồng thường.
- Phát hành plugin: gộp vào gói kế tiếp (tăng `<Version>` trong `Directory.Build.props` —
  việc tăng số này đồng thời là điều kiện để FR3 có gì đó để so). Cổng phát hành rộng KHÔNG
  đổi: vẫn chờ trả nợ verify tay C9/C10/C11 trước, C12 nối vào cùng đợt ngồi máy AutoCAD 2026.
- Rollback: revert PR tương ứng; bản vẽ đã mang `BamHinhHoc` không cần dọn (trường bị bỏ qua
  bởi code cũ).

## 18. Risk/assumption/open decisions

| Mục | Xác minh/giảm thiểu | Owner | Hạn | Quyết định |
| --- | --- | --- | --- | --- |
| Băm điểm đại diện của vùng che ngắt nét (wipeout) có thể không bắt được kiểu "sửa tay" duy nhất thực tế (kỹ sư xóa vùng che thay vì dời) | Xóa hẳn = sinh lại (đã chấp nhận ở FR2, nhất quán ②⑤); nếu pilot cho thấy cần "đã xóa thì đừng sinh lại", mở M mới với cơ chế ghi nhớ chủ đích | Phiên chính | Sau pilot | Chấp nhận rủi ro |
| `VeBangService` có thể đã cập nhật bảng tại chỗ (FR2 nhánh "chỉ thêm test") | Worker PR2 đọc code xác định nhánh nào; cả hai nhánh đều trong đặc tả, không phải open decision | Worker PR2 | Trong PR2 | Đã chốt cả 2 nhánh |
| `AssemblyInformationalVersion` có thể mang hậu tố `+<hash>` do SourceLink | `SoLechPhienBan` cắt từ `+` trước khi so (đã ghi ở FR3) | Worker PR3 | Trong PR3 | Đã chốt |
| Có nên hiện cảnh báo version ngay khi NETLOAD (mỗi lần mở AutoCAD)? | Không — NETLOAD không có mạng đảm bảo và làm chậm khởi động; `XBOSS_RULEPACK`/`XBOSS_BANG` là đủ điểm chạm | — | — | **Chốt: không** |

## 19. Approval

- [ ] Product/scope
- [ ] UX/a11y
- [ ] Architecture/API/data
- [ ] Security/RBAC/SoD/audit
- [ ] Test/telemetry/rollout/rollback
- [ ] Không còn blocking question

**Kết luận:** Draft
**Người/ngày duyệt:** —
