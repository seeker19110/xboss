# M115 — Đặc tả Hoàn thiện bản vẽ từ tuyến tim (kỹ sư vẽ line/pline → plugin hoàn thiện)

| Thuộc tính | Giá trị |
| --- | --- |
| Issue / Goal | Tự động triển khai bản vẽ thi công MEPF: kỹ sư chỉ vẽ tuyến tim, plugin hoàn thiện phần còn lại |
| Spec owner | Phiên chính (opusplan) |
| State | **Approved for implementation** |
| Người/ngày duyệt | Người dùng duyệt 2026-08-30 |
| Cập nhật | 2026-08-30 |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Kỹ sư (vai trò `engineer`) triển khai shop drawing MEPF từ sơ đồ nguyên lý hiện phải vẽ tay từng
thứ: nét đôi ống/gió, co/cút/tê tại mỗi chỗ rẽ, chia đốt theo kiểu nối, giá đỡ, lỗ chờ, tag, bảng
thống kê — dù mọi lệnh vẽ đơn lẻ đã có trong plugin (M100→M114). Khảo sát thị trường 2026-08-30
(xem `RESEARCH-AUTO-ROUTING-MEPF.md` và báo cáo phiên): các tool auto-route toàn phần (Augmenta,
FireDesign.ai) chỉ thành công ở hệ luật rõ và đều giữ human-in-the-loop; nhóm ROI tốt nhất
(eVolve/SysQue) không route mà **tự động hoá tất định phần hạ nguồn**. Hướng chốt: **kỹ sư vẽ
line/pline tuyến tim từ điểm nguồn tới thiết bị (kèm thuộc tính hệ/size/cao độ khi cần) — plugin
tự hoàn thiện bản vẽ: nét đôi, nhánh/tê, co/cút, chia đốt, giá đỡ, lỗ chờ, ngắt nét, tag, thống
kê.** Con người quyết *đi đâu* (constructability), máy lo *vẽ đúng chuẩn thế nào*. Tích hợp trực
tiếp vào plugin AutoCAD hiện có, không làm tool rời.

## 2. Outcome, metric và guardrail

- **Target:** thời gian từ tuyến tim → bản vẽ đủ thành phần giảm ≥70% so với vẽ tay từng lệnh
  (đo trong pilot 1 hệ, 1 tầng điển hình TT AVIO); tỉ lệ phần tử sinh ra phải sửa tay <20%.
- **Guardrail:** (a) **polyline tim của kỹ sư không bao giờ bị cắt/chia/đổi tọa độ** (bất biến
  M109 mở rộng — mọi thứ sinh thêm là thực thể mới, XData trỏ về tuyến gốc); (b) chạy lại lệnh
  trên cùng tuyến = idempotent, không nhân đôi phần tử; (c) `XBOSS_BOCKL` trên bản vẽ đã hoàn
  thiện ra đúng khối lượng như bóc trên tuyến tim + phụ kiện sinh ra; (d) mọi bước hoàn thiện tắt
  được từng phần qua rule pack (mặc định như hành vi hiện tại — merge không đổi hành vi máy kỹ sư).
- **Stop/rollback:** khoá version rule pack cũ là đủ (append-only); không migration DB nên không
  có rollback dữ liệu server.

## 3. Nghiên cứu hiện trạng (điểm tựa — grep lại trước khi code)

- **M107** đã nhận line/pline có sẵn thành tuyến XBoss (XData hệ/size) — nền của bước gán thuộc tính.
- **M100/M105/M109:** `XBOSS_VE_NEN` (nét đôi), `XBOSS_VE_PHUKIEN` (`Core/Draw/FittingPlacement.cs`),
  `XBOSS_VE_CHIADOT` (`jointRules`), `XBOSS_VE_GIADO`/`_LOCHO`/`_TAG`/`_THONGKE`, `XBOSS_VE_NGATNET`
  (`crossingPolicy`) — toàn bộ "động tác" đã có, thiếu người **điều phối** chạy chuỗi trên cả cụm tuyến.
- **M114:** `Core/Routing/` (`HanhLangGraph`, `DinhTuyen`, `KeHoachDiTuyen`) — tái dùng cấu trúc
  graph/hình học, KHÔNG tái dùng phần tự quyết đường đi (ngoài scope M115).
- **M108/M113:** thư viện block có `kind`/`systemId` — dùng cho snap đầu tuyến vào thiết bị.
- Rule pack hiện hành **v15** (`lib/ky-thuat/cad/rule-packs/`); web sau refactor #438 gom về
  `lib/ky-thuat/cad/{rule-pack,block,drawing,dashboard,dxf-parser}.ts`.

## 4. Phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Kết luận |
| --- | --- | --- | --- |
| Không làm | 0 | Kỹ sư tiếp tục chạy tay ~8 lệnh/tuyến | Loại |
| A. AI đọc schematic rồi tự route toàn phần | "Một nút bấm" | Khó nhất thị trường; Augmenta mới xong hệ điện; sai constructability mất lòng tin | Để giai đoạn sau (GĐ 3 của lộ trình nghiên cứu) |
| **B. Kỹ sư vẽ tuyến tim, plugin hoàn thiện (đã chốt)** | Tất định, tái dùng ~70% lệnh sẵn có, ROI kiểu eVolve/SysQue, không LLM trên đường găng | Phải dựng graph từ nhiều pline + suy phụ kiện tại nút | **Chọn** |

## 5. Scope / non-goals

**Scope:** dựng đồ thị tuyến–thiết bị từ line/pline kỹ sư vẽ; gán/suy thuộc tính; suy phụ kiện tại
nút; lệnh điều phối chạy chuỗi lệnh vẽ sẵn có; báo cáo phiên. Chạy chung cho mọi hệ khai trong
`drawTools.systems`; **pilot verify trên 1 hệ** (chốt lúc verify tay, đề xuất: thoát nước ngưng
hoặc ống gió). **Non-goals:** tự quyết định đường đi (auto-route toàn phần), đọc sơ đồ nguyên lý
bằng AI, phối hợp xung đột liên hệ (combined services), 3D/BIM, thay đổi các lệnh vẽ hiện có.

## 6. Quy trình chuẩn (user journey — thứ tự từng bước đã chốt)

Toàn bộ trong AutoCAD, nối vào trình dẫn 6 giai đoạn M106:

| Bước | Ai | Làm gì | Lệnh |
| --- | --- | --- | --- |
| 0 | Kỹ sư | Ghép máy, tải rule pack + thư viện block, chuẩn hoá nền kiến trúc | `XBOSS_LOGIN`, `XBOSS_CHUANHOA` (đã có) |
| 1 | Kỹ sư | **Vẽ line/pline tuyến tim** từ điểm nguồn tới từng thiết bị (block thư viện đã đặt); rẽ nhánh = pline chạm/giao tuyến chính | AutoCAD thuần |
| 2 | Kỹ sư | **Gán thuộc tính tuyến**: chọn 1..n tuyến → form WPF (hệ, size, cao độ, vật liệu/cách nhiệt, kiểu nối) → ghi XData; layer khớp `layerMap` thì thuộc tính hệ được điền sẵn | `XBOSS_TUYEN_GAN` (mới; mở rộng M107) |
| 3 | Plugin | **Dựng đồ thị + kiểm**: gộp điểm chạm/giao thành nút; suy **tê** (nút 3 nhánh), **co/cút** (đổi hướng tại đỉnh, chọn theo góc + `heavyFittingIds`), **giảm** (size 2 đoạn khác nhau), **đoạn lên/xuống** (cao độ đổi); chiều dòng từ điểm nguồn; snap đầu tuyến vào block thiết bị (`kind`/`systemId` khớp hệ). Báo lỗi chặn: tuyến hở, thiếu size, thiết bị sai hệ, cao độ mâu thuẫn | `XBOSS_TUYEN_DOTHI` (mới) |
| 4 | Kỹ sư | **Duyệt đồ thị** trên hộp thoại M106: danh sách nút/nhánh/phụ kiện suy ra, sửa từng điểm (đổi loại tê/co, bỏ qua) — chốt human-in-the-loop số 1 | (trong hộp thoại bước 3) |
| 5 | Plugin | **Hoàn thiện bản vẽ** — điều phối chạy chuỗi lệnh sẵn có theo đúng thứ tự trên toàn cụm tuyến, từng giai đoạn hoặc trọn gói, xem trước + bỏ qua được từng giai đoạn: ① nét đôi (`VE_NEN`) ② phụ kiện tại nút (`VE_PHUKIEN`) ③ chia đốt (`VE_CHIADOT`) ④ giá đỡ (`VE_GIADO`) ⑤ lỗ chờ tại giao tường (`VE_LOCHO`) ⑥ ngắt nét giao chéo (`VE_NGATNET`) ⑦ tag (`VE_TAG`) ⑧ bảng thống kê (`VE_THONGKE`) | `XBOSS_HOANTHIEN` (mới) |
| 6 | Kỹ sư | Sửa tay phần chưa ưng (bản vẽ là "draft ~80%") — chốt human-in-the-loop số 2; chạy lại bước 5 an toàn (idempotent) | AutoCAD thuần |
| 7 | Kỹ sư | Kiểm + bóc khối lượng + nộp về server như quy trình hiện hành | `XBOSS_KIEMTRA`, `XBOSS_BOCKL`, `XBOSS_UPLOAD` (đã có) |

Trạng thái lỗi/offline: bước 3 không đạt → không cho chạy bước 5, danh sách lỗi bấm-tới-đối-tượng
(zoom); mất mạng → dùng rule pack/thư viện block cache offline M113, không chặn.

## 7. FR/NFR chính

- **FR1** `XBOSS_TUYEN_GAN`: gán XData thuộc tính cho nhiều tuyến một lượt; suy hệ từ layer qua
  `layerMap` khi khớp; hiển thị tuyến chưa đủ thuộc tính.
- **FR2** `XBOSS_TUYEN_DOTHI`: dựng graph trong `Core` (thuần, test được trên CI Linux) với dung
  sai bắt điểm theo rule pack; phân loại nút; suy phụ kiện theo bảng luật trong rule pack; xuất
  danh sách lỗi chặn/cảnh báo.
- **FR3** `XBOSS_HOANTHIEN`: điều phối 8 giai đoạn ở bước 5 theo thứ tự cố định, mỗi giai đoạn
  bật/tắt theo rule pack + lựa chọn phiên; ghi báo cáo phiên (`VeSessionReport` M100 PR5).
- **FR4** Idempotent: phần tử sinh ra mang XData `nguon=M115` + id tuyến gốc; chạy lại thì thay
  thế phần của chính nó, không đụng phần kỹ sư vẽ/sửa tay.
- **FR5** Rule pack +1 version (append-only): khối `completionPolicy` (dung sai nút, bảng chọn
  co/cút/tê theo hệ+size+góc, thứ tự giai đoạn bật mặc định = TẮT hết → không đổi hành vi khi merge).
- **NFR:** không LLM trên đường găng (AI chỉ ở tiện ích gợi ý ngoài luồng, qua `lib/nen/ai.ts` nếu
  bổ sung sau); toàn bộ suy diễn graph chạy cục bộ <2s cho 500 đoạn tuyến; mọi nhãn tiếng Việt.

## 8. Acceptance criteria (rút gọn — chi tiết hoá khi duyệt)

- **AC1** Given 1 pline nguồn + 2 nhánh chạm + block FCU đúng hệ, When chạy bước 3, Then graph có
  2 tê + các co tại đỉnh đổi hướng + 3 kết nối thiết bị, 0 lỗi chặn (test Core, chạy CI).
- **AC2** Tọa độ đỉnh mọi pline tim trước/sau `XBOSS_HOANTHIEN` bằng nhau từng byte (verify tay + test Core).
- **AC3** Chạy `XBOSS_HOANTHIEN` 2 lần liên tiếp → số thực thể không đổi (idempotent).
- **AC4** `XBOSS_BOCKL` sau hoàn thiện = khối lượng tuyến + phụ kiện đã duyệt ở bước 4.
- **AC5** Rule pack version mới với `completionPolicy` mặc định tắt → mọi lệnh cũ cho kết quả y hệt v15.
- **AC6** Tuyến hở/thiếu size → bước 5 bị chặn, thông báo trỏ đúng đối tượng.

## 9. Kiến trúc và điểm chạm code

- `XBoss.Cad.Core/Graph/` (mới): `TuyenGraph.cs`, `NutPhanLoai.cs`, `SuyPhuKien.cs`, `KiemTuyen.cs`
  — thuần, xunit trên CI. Tái dùng `Geometry/Segment2D`, cấu trúc từ `Routing/HanhLangGraph`.
- `XBoss.Cad.Acad/Commands/`: `TuyenGanCommand.cs`, `TuyenDoThiCommand.cs`, `HoanThienCommand.cs`
  (điều phối gọi lại service của các lệnh `VE_*` hiện có, không nhân đôi logic vẽ).
- `Ui/`: 3 ViewModel + DataTemplate trong `XBossDialog.xaml`; thêm 3 lệnh vào `LenhCatalog.cs`
  (Ribbon + trình dẫn M106, giai đoạn "Vẽ").
- Web: rule pack version mới trong `lib/ky-thuat/cad/rule-packs/` + validator trong
  `lib/ky-thuat/cad/rule-pack.ts`; trang `/engineering/cai-dat-plugin` bổ sung 3 lệnh vào bảng lệnh.
- **Không API mới, không migration** — server chỉ nhận báo cáo phiên/upload như hiện hành.

## 10–11. API & DDL

Không có. Dữ liệu graph sống trong DWG (XData) + báo cáo phiên JSON hiện có.

## 12. Chia PR (route theo bảng CLAUDE.md)

| PR | Nội dung | route: |
| --- | --- | --- |
| PR1 | Rule pack +1 version (`completionPolicy`, mặc định tắt) + validator 2 tầng (TS + C#) + `Core/Graph/` (dựng graph, phân loại nút, suy phụ kiện, kiểm) + test xunit/node:test | `complex` (ranh giới quyết: cấu trúc dữ liệu graph + bảng luật suy phụ kiện; không đổi lệnh cũ) |
| PR2 | `XBOSS_TUYEN_GAN` + `XBOSS_TUYEN_DOTHI` (Adapter + ViewModel + hộp thoại duyệt đồ thị) | `spec` |
| PR3 | `XBOSS_HOANTHIEN` điều phối 8 giai đoạn + idempotency XData + báo cáo phiên + LenhCatalog/Ribbon | `spec` |
| PR4 | Tài liệu (bảng lệnh web, `CAI-DAT.md`), mục verify mới trong `VERIFY-VA-PHAT-HANH.md`, cập nhật `PROGRESS.md`/README nâng cấp | `standard` |

## 13. Điều kiện tiên quyết & rủi ro

- **Cổng verify:** trả nợ verify tay AutoCAD 2026 các đợt trước (M111 đang chặn phát hành rộng)
  trước khi phát hành M115 rộng; M115 thêm mục verify riêng (AC2/AC3/AC4 trên máy thật).
- Bản vẽ TVTK layer tùy tiện → bước 2 phụ thuộc `layerMap`/gán tay; chấp nhận gán tay nhiều ở đầu.
- Bảng chọn co/cút theo hệ (constructability) phải do kỹ sư trưởng duyệt nội dung rule pack trước pilot.
