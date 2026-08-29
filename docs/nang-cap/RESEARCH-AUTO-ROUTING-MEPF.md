# Nghiên cứu — Auto-routing MEPF từng hệ (hybrid: kỹ sư chuẩn bị → máy đi tuyến)

| Thuộc tính | Giá trị                                                                                                                   |
| :--------- | :------------------------------------------------------------------------------------------------------------------------ |
| Loại       | **Tài liệu nghiên cứu** — không phải đặc tả, không phải kế hoạch thi hành                                                 |
| Yêu cầu    | "nghiên cứu lại cách để auto route từng hệ riêng 1, hybird cũng được, kỹ sư chuẩn bị trước rồi auto routing" (2026-08-29) |
| Cập nhật   | 2026-08-29                                                                                                                |
| Kết luận   | Làm được, nhưng **không phải bằng thứ đang có tên "auto-routing" trong repo** — xem §1 và §6                              |

---

## 1. Hiện trạng: cái đang mang tên "auto-routing" không dùng lại được

Repo đã có `M77-auto-routing-beam-sleeve.md` đánh dấu "Đã hoàn thành (2026-08-19)", `migrations/0111`,
`lib/ky-thuat/engineering-auto-routing.ts`, `lib/ky-thuat/engineering-generative-routing.ts`, trang
`/engineering/auto-routing`. Đã đọc code thật, và cần nói thẳng trước khi ai đó xây tiếp lên nó:

**a) Không có A\* nào cả.** `findOptimalRoute3D` (`engineering-auto-routing.ts:113`) mang doc-comment
"Thuật toán 3D A\* Pathfinding" nhưng thân hàm là một cây quyết định cố định: thử tuyến trực giao
3 đoạn (`start → mid1 → mid2 → end`); nếu vướng thì nâng **toàn bộ** tuyến lên cao độ
`max(maxZ của mọi vật cản) + 150` rồi nối 2 đoạn đứng. Không có open set, không có heuristic, không
có lưới tìm kiếm. Bị chặn ở một chỗ thì cả tuyến bay lên trên **mọi** vật cản trong danh sách — kể
cả vật cản ở đầu kia mặt bằng.

`solve3DGenerativeRoute` (`engineering-generative-routing.ts:72`, dưới tiêu đề khối
`3D A* PATHFINDING WITH HYDRAULIC & SPATIAL INVARIANTS`) cũng vậy — cây quyết định "nếu là dầm và
nằm trong L/3 và ống đủ nhỏ thì xuyên, không thì né xuống dưới". Là heuristic hợp lý cho **một** vật
cản, không phải bộ tìm đường.

**b) Phép thử va chạm sai bản chất.** `doesSegmentIntersectBox` so **hộp bao của đoạn thẳng** với hộp
vật cản. Đoạn chéo đi sát góc hộp vẫn bị báo là cắt. Đây là sai theo hướng an toàn (báo thừa, không
báo sót), nhưng với tuyến chéo dài thì gần như **luôn** báo vướng — nghĩa là nhánh "bay lên trên tất
cả" ở (a) là nhánh chạy thường xuyên, không phải nhánh dự phòng.

**c) Không dính gì tới bản vẽ.** Cả hai nhận `start`/`end`/`obstacles` dưới dạng JSON do người gọi tự
khai, trả `waypoints` JSON. Không đọc DWG, không sinh thực thể, không biết `XBOSS_VE` là gì. Kết quả
nằm trong bảng `engineering_auto_routes` và một trang web — **không có đường nào chạy vào bản vẽ của
kỹ sư**, mà bản vẽ mới là nơi công việc thật diễn ra.

**d) 4 ca test.** `tests/engineering-auto-routing.test.ts` có 4 ca — đủ cho `validateBeamSleeve`,
không phủ được hành vi đi tuyến.

⇒ **Kết luận §1:** coi M77/generative-routing là _ước lượng phía web_, không phải nền móng. Xây
auto-routing trong plugin **không** dùng lại chúng. (Việc M77 ghi "3D A\*" trong khi code không phải
vậy nên được ghi vào nợ kỹ thuật — tài liệu đang mô tả sai code.)

**Một thứ đáng giữ:** `planMultiTierCorridor` (`engineering-cad-corridor.ts:67`) là code thật và
dùng được — phân tầng cao độ (ống gió sát đáy dầm → máng cáp → ống nước → sprinkler sát trần), cấp
phát **làn ngang** (`lateralOffset` cộng dồn theo bề rộng + khoảng hở), kiểm thông thủy trần, cảnh
báo máng cáp nằm dưới ống nước. Đó đúng là **nửa Z + nửa làn** của bài toán. Nửa còn thiếu là đi
tuyến trên mặt bằng.

Phía plugin: **chưa có gì** về routing (`grep` toàn `plugin-autocad/*.cs`).

## 2. Vì sao "auto routing thuần" là bài toán sai trên nền của XBoss

Không phải vì khó thuật toán, mà vì **thiếu dữ liệu đầu vào**, và đây là ràng buộc đã được chốt nhiều
lần trong dự án:

| Thứ auto-routing thật cần          | XBoss có gì                                                                                                                           |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| Mô hình kết cấu 3D (dầm, sàn, cột) | Không. Nền là **bản vẽ 2D**; luật M100 §6.3 đã chốt "bản vẽ 2D không có Z đáng tin" — `XBOSS_VE_MATCAT` phải HỎI cao độ chứ không bịa |
| Trần/không gian kỹ thuật khả dụng  | Không, trừ khi kỹ sư khai                                                                                                             |
| Tải/lưu lượng từng thiết bị        | Không (chưa có mô hình thủy lực trong plugin)                                                                                         |
| Ranh giới kiến trúc máy đọc được   | Nền kiến trúc là xref, hình học tự do — máy không phân biệt được tường với nét trang trí                                              |

Ép máy tự tìm tất cả những thứ trên từ DXF là con đường đã có tiền lệ hỏng trong chính dự án này
(ADR-0006 ghi lý do ngừng viết lại AutoCAD bằng TypeScript). **Hybrid không phải là bản rút gọn của
auto-routing — nó là cách đúng**: kỹ sư nạp đúng 4 mẩu tri thức mà máy không thể tự suy, mất vài
phút, đổi lại máy làm phần lặp lại hàng trăm lần.

## 3. Kỹ sư chuẩn bị gì — đúng 4 thứ

Bốn thứ này chọn theo tiêu chí: **máy tuyệt đối không suy được, mà người vẽ 2 phút là xong.**

1. **Hành lang kỹ thuật** (`XBOSS_VE_HANHLANG`) — kỹ sư vẽ polyline tim hành lang nơi hệ được phép
   chạy (trục hành lang, khoang kỹ thuật, dọc dầm chính), khai bề rộng khả dụng. Đây là mẩu quan
   trọng nhất: nó **thu không gian tìm kiếm từ cả mặt bằng xuống một đồ thị vài chục cạnh**. Bài
   toán đổi từ "tìm đường trong mặt phẳng có vật cản" (khó, dễ ra tuyến xấu) thành "tìm đường trên
   đồ thị" (dễ, tối ưu được, giải thích được).
2. **Điểm đấu nối** — phần lớn **đã có sẵn**: thiết bị do `XBOSS_VE_THIETBI` chèn đã mang XData
   `ThietBi`. Chỉ cần thêm điểm **nguồn/trục chính** cho mỗi hệ (`XBOSS_VE_TRUCDUNG` của M112 chính
   là thứ này ở phương đứng).
3. **Vùng cấm** — polyline khoanh chỗ không được đi qua (lõi thang, ô thông tầng, vùng CĐT cấm).
   Dùng lại `Core/Zoning/VungClipper.cs` của M101 PR3, không viết mới.
4. **Dải cao độ + làn của từng hệ** — khai trong rule pack, mặc định lấy đúng thứ tự phân tầng của
   `planMultiTierCorridor` (§1). Kỹ sư sửa theo dự án.

Ba trong bốn thứ đã có công cụ hoặc dữ liệu sẵn. Chỉ **hành lang** là lệnh mới thật sự.

## 4. Cách đi tuyến — đồ thị hành lang, không phải A\* không gian tự do

**Bước 1 — dựng đồ thị.** Từ các polyline hành lang: nút = giao điểm hành lang + điểm rẽ xuống
thiết bị (hình chiếu vuông góc của thiết bị lên hành lang gần nhất trong bán kính cho phép); cạnh =
đoạn hành lang, trọng số = chiều dài.

**Bước 2 — đi tuyến từng hệ, một hệ một lượt.** Đúng như yêu cầu "auto route từng hệ riêng 1":

- Nhánh nhỏ về trục chính bằng đường đi ngắn nhất trên đồ thị (Dijkstra — đồ thị vài chục nút, chạy
  tức thì, **không cần A\***).
- Hàm chi phí không chỉ là chiều dài: `chiều dài + α×số lần chuyển hướng + β×độ đông của hành lang
− γ×(dùng lại cạnh mà nhánh khác của CHÍNH hệ này đã đi)`. Số hạng `γ` là thứ khiến kết quả trông
  giống bản vẽ người làm: các nhánh **gom vào một trục chung** rồi mới tỏa ra, thay vì mỗi thiết bị
  một tuyến riêng chạy song song lãng phí. Đây là xấp xỉ cây Steiner bằng cách đi tuần tự và giảm
  giá cạnh đã dùng — đủ tốt, dễ giải thích, dễ kiểm.
- Hệ **tự chảy** (thoát nước) là chế độ riêng: ràng buộc cao độ **đơn điệu giảm** dọc tuyến, độ dốc
  lấy từ `slopeRequired` đã có trong rule pack. Không thỏa được → **báo không giải được kèm lý do**,
  không hạ chuẩn.

**Bước 3 — cấp phát Z và làn ngang.** Gọi đúng logic `planMultiTierCorridor`: hệ đang chạy nhận tầng

- làn còn trống trong hành lang, biết trước các hệ đã chạy chiếm chỗ nào. Đây là chỗ **thứ tự hệ trở
  thành thiết kế, không phải tùy tiện**: thoát nước → ống gió lớn → sprinkler → chiller → cấp nước →
  máng cáp (đúng `TRADE_HIERARCHY` đã khai sẵn). Hệ chạy trước có quyền chọn chỗ tốt; hệ dẻo chạy sau
  và lượn tránh — giống hệt cách phối hợp ngoài đời.

**Bước 4 — sinh ra tuyến thật.** Đây là điểm khác biệt lớn nhất so với M77: kết quả **không** phải
JSON waypoints, mà là **polyline tim mang XData `XBOSS_VE` đúng cấu trúc `XBOSS_VE` vẽ ra** — cùng
cách M107 (`XBOSS_VE_NHANTUYEN`) làm cho tuyến của người khác. Hệ quả: ngay sau khi auto-route,
`XBOSS_VE_PHUKIEN`, `_NHAN`, `_CHIADOT`, `_GIADO`, `_LOCHO`, `_TAG`, `_THONGKE` và `XBOSS_BOCKL`
**dùng được ngay, không cần biết tuyến từ đâu ra**. Auto-routing không phải một hòn đảo — nó là
**máy phát đầu vào cho dây chuyền đã có**.

**Bước 5 — kỹ sư sửa.** Tuyến sinh ra là polyline bình thường: kéo đỉnh, dùng `XBOSS_VE_DOI` đổi cỡ,
xóa nhánh nào không ưng. Chạy lại lệnh chỉ đụng nhánh chưa bị kỹ sư sửa tay (đánh dấu bằng cờ trong
XData) — **không đè lên công sức của người**.

## 5. Vì sao cách này đứng vững trong khi "auto-routing thuần" thì không

| Điểm                  | Đồ thị hành lang (đề xuất)                                | A\* không gian tự do (M77 định làm)                 |
| :-------------------- | :-------------------------------------------------------- | :-------------------------------------------------- |
| Đầu vào cần           | Hành lang kỹ sư vẽ (2 phút)                               | Mô hình kết cấu + kiến trúc 3D đầy đủ (không có)    |
| Kết quả trông thế nào | Chạy dọc hành lang, gom trục — **giống bản vẽ người làm** | Đường zigzag theo lưới, kỹ sư phải sửa lại gần hết  |
| Giải thích được       | "Đi hành lang C vì ngắn hơn 12 m và ít 2 co"              | "Thuật toán chọn thế" — không cãi được với tư vấn   |
| Chi phí tính          | Dijkstra trên vài chục nút — tức thì                      | Lưới 3D toàn tầng: hàng triệu ô, chậm và tốn bộ nhớ |
| Sai thì sao           | Kỹ sư kéo lại một nhánh                                   | Sai hệ thống, phải sửa toàn bộ                      |
| Test được không       | Đồ thị + chi phí là hàm thuần → test trên CI Linux        | Cần mô hình 3D giả lập phức tạp                     |

## 6. Đề xuất phạm vi nếu làm

Nếu chốt làm, mở **M114** (số M kế tiếp — xác nhận lại bằng `ls docs/nang-cap`), chia 4 PR:

| PR  | Nội dung                                                                                                                                                                                                             |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR1 | Core thuần: dựng đồ thị hành lang, Dijkstra + hàm chi phí (`α/β/γ`), gom trục, chế độ tự chảy. Không đụng AutoCAD, test đầy đủ trên CI Linux                                                                         |
| PR2 | Cấp phát tầng/làn: đưa logic `planMultiTierCorridor` sang C# ở Core (**hoặc** gọi server — quyết định lúc duyệt), kèm bộ đối chứng 2 tầng để TS và C# không trôi khác nhau                                           |
| PR3 | `XBOSS_VE_HANHLANG` (vẽ + sửa hành lang, XData vai trò mới `HanhLang`) + khóa rule pack `routingPolicy`                                                                                                              |
| PR4 | `XBOSS_VE_TUYENTUDONG`: chạy cho **một hệ**, xem trước (tuyến đề xuất nét mảnh + bảng chiều dài/số co/hệ đang chiếm chỗ), chấp nhận thì sinh tuyến thật mang XData `Tim`; cờ "kỹ sư đã sửa tay" để chạy lại không đè |

**Ranh giới bắt buộc, không được thương lượng khi thi hành:**

- Chạy **một hệ một lượt**, thứ tự do kỹ sư chọn (mặc định theo `TRADE_HIERARCHY`). Không có nút
  "route tất cả" ở bản đầu.
- **Xem trước bắt buộc** trước khi ghi — cùng lý do M111 (nhân bản tầng): sinh sai hàng loạt là hỏng
  cả buổi.
- Không giải được thì **nói không giải được kèm lý do** (thiếu hành lang nối tới thiết bị nào, hành
  lang hết làn, không thỏa độ dốc). Tuyệt đối không "cứ vẽ đại một tuyến" — sai ở đây đi thẳng vào
  khối lượng và vào hiện trường.
- Không tự nắn tuyến của hệ đã chạy trước để nhường chỗ (đó là bài toán combined services, vẫn chưa
  có đặc tả; và M109 §3 đã ghi rõ ranh giới này).

## 7. Câu còn phải chốt trước khi viết đặc tả

1. **Hành lang vẽ mới hay nhận từ bản kiến trúc?** Vẽ mới thì đơn giản và chắc; nhận từ nét kiến
   trúc có sẵn thì nhanh hơn nhưng phải đoán — nghiêng về **vẽ mới**, có thể "nhận" ở đợt sau (cùng
   lối M107 nhận tuyến).
2. **Tầng/làn tính ở Core (C#) hay gọi server?** Core thì plugin chạy độc lập, nhưng phải chuyển
   `planMultiTierCorridor` sang C# và gánh rủi ro 2 bản trôi khác nhau (rủi ro số 1 của M99, đã có
   khuôn `plugin-autocad/doi-chung/` để canh).
3. **Có làm thủy lực không** (chọn cỡ ống theo lưu lượng)? Đề xuất: **không** ở bản đầu — kỹ sư khai
   cỡ như `XBOSS_VE` đang làm. Ghép thủy lực vào là mở một mặt trận khác.
4. **M77 xử lý sao?** Đề xuất ghi nợ kỹ thuật: sửa tài liệu M77 cho khớp code (bỏ chữ "A\*"), hoặc
   đánh dấu `engineering-auto-routing.ts` là ước lượng phía web và **không** để lệnh plugin gọi vào.

## 8. Nguồn đã đọc

`lib/ky-thuat/engineering-auto-routing.ts`, `engineering-generative-routing.ts`,
`engineering-cad-corridor.ts`; `migrations/0111_auto_routing_sleeve_matrix.sql`;
`tests/engineering-auto-routing.test.ts`; `app/engineering/auto-routing/page.tsx`;
`docs/nang-cap/M77-auto-routing-beam-sleeve.md`; `plugin-autocad/XBoss.Cad.Core/Draw/VeXData.cs`,
`Zoning/VungClipper.cs`, `Ui/QuyTrinh.cs`; `lib/ky-thuat/cad/rule-packs/v9.json`;
`docs/nang-cap/M100/M101/M107/M109-M113`; ADR-0006. `mepf-worker/tests/test_routing.py` đã kiểm và
**không liên quan** — đó là định tuyến **agent** trong LangGraph, không phải đi tuyến hình học.
