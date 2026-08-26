# Kiểm thử plugin AutoCAD khi CHƯA có server XBoss

Không cần dựng web/DB. Plugin có sẵn **đường dự phòng offline** cho cả hai thứ nó phụ thuộc — bộ quy tắc (rule pack) và thư viện block — nên **11/14 ca AC chạy được ngay trên một máy AutoCAD đứng một mình**.

---

## 1. Chạy được gì / không chạy được gì

| Nhóm             | Lệnh                                                                                                                              | Cần server?                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Nạp cấu hình     | `XBOSS_RULEPACK` (chọn tệp `.json`)                                                                                               | **Không**                                                        |
|                  | `XBOSS_VE_THUVIEN` → chọn **Tep**                                                                                                 | **Không**                                                        |
|                  | `XBOSS_LOGIN`                                                                                                                     | **Có**                                                           |
| Vẽ               | `XBOSS_VE_NEN` `XBOSS_VE` `_PHUKIEN` `_THIETBI` `_NHAN` `_DOI` `_GIADO` `_LOCHO` `_TAG` `_THONGKE` `_MATCAT` `_TRANGIN` `_BAOCAO` | **Không**                                                        |
| Kiểm / chuẩn hóa | `XBOSS_KIEMTRA` `XBOSS_CHUANHOA` `XBOSS_BATCH`                                                                                    | **Không**                                                        |
| Bóc khối lượng   | `XBOSS_BOCKL` `_XOA` `_XUAT`                                                                                                      | **Không**                                                        |
| Ghi sổ           | `XBOSS_UPLOAD`                                                                                                                    | **Có**                                                           |
| Đối chiếu BOQ    | sheet `Doi-chieu` trong `XBOSS_BOCKL_XUAT`                                                                                        | **Có** (mặc định trả lời **Không** → vẫn xuất Excel bình thường) |

**Ca AC làm được offline:** AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9, AC10, AC11, AC12, AC13, AC14 — tức **toàn bộ trừ AC8**.
**Ca AC phải đợi server:** **AC8** (thư viện tự cập nhật theo ETag khi `XBOSS_LOGIN`) — bản chất là kiểm đường mạng, không có server thì không kiểm được.

> Lý do đường offline tồn tại: máy kỹ sư ở công trường thường không ra được mạng (M100 §6.10). Đây không phải "chế độ thử nghiệm", mà là đường dùng thật.

---

## 2. Chuẩn bị (30 phút, làm một lần)

### 2.1 Bộ quy tắc — lấy thẳng từ repo

Chép tệp này từ repo sang máy AutoCAD (USB/chia sẻ mạng nội bộ đều được):

```
lib/ky-thuat/cad/rule-packs/v8.json
```

Trong AutoCAD:

```
XBOSS_RULEPACK      → chọn tệp v8.json
```

Phải hiện: `Đã nạp rule pack v8 (… nhóm layer). Cache: C:\Users\<bạn>\AppData\Roaming\XBoss\rule-pack.json`

☐ Rule pack nạp OK, version = **v8**

> Nạp version thấp hơn v4 thì mọi lệnh `XBOSS_VE_*` từ chối chạy ("cần rule pack từ v4 trở lên") — đúng thiết kế. v8 thêm 2 phép kiểm mới (17: tag trùng số trong cùng hệ; 18: hạng mục thiếu mã BOQ), cả hai **mặc định tắt** nên kết quả kiểm/chuẩn hóa không đổi so với v7.

### 2.2 Thư viện block — phải tự tạo, đây là phần tốn công nhất

Repo chỉ có **manifest mẫu**; tệp `.dwg` trong repo là bản giả ASCII (`block-lib-mau.dwg.txt`) **không dùng được** — cần một tệp `.dwg` thật.

**Bước 1 — vẽ block trong AutoCAD.** Tạo một bản vẽ mới, dùng lệnh `BLOCK` tạo tối thiểu 6 block (tên phải khớp bảng dưới), rồi lưu thành `blocks.dwg`:

| Tên block        | Loại              | Ghi chú khi vẽ                                                        |
| ---------------- | ----------------- | --------------------------------------------------------------------- |
| `XB-DUCT-ELBOW`  | co ống gió        | vẽ theo **kích thước danh nghĩa 1 đơn vị** (xem cảnh báo dưới)        |
| `FCU`            | thiết bị          | phải có **ATTDEF** tên `TAG` (thêm `MODEL`, `SIZE` nếu muốn)          |
| `XB-TB-A1`       | khung tên A1      | ATTDEF: `DU_AN`, `HANG_MUC`, `TI_LE`, `NGAY`, `NGUOI_VE`, `SO_BAN_VE` |
| `XB-SUP-DUCT`    | giá đỡ            |                                                                       |
| `XB-SLEEVE-W`    | lỗ chờ tường      |                                                                       |
| `XB-SLOPE-ARROW` | mũi tên hướng dốc | thiếu block này thì nhãn dốc chỉ có chữ `i=2%`                        |

⚠️ **Quy ước kích thước chưa chốt:** block có `scaleBySize` đang được giả định vẽ theo **1 đơn vị**, plugin scale theo bề rộng thật. Vẽ theo mm thật (vd 100mm) sẽ ra **sai 100 lần**. Đây chính là quy ước cần chốt trước khi CAD manager vẽ thư viện thật.

**Bước 2 — soạn `manifest.json`** đặt **cùng thư mục** với `blocks.dwg`. Lấy `plugin-autocad/doi-chung/block-lib-manifest-mau.json` làm mẫu, sửa `version` tùy ý.

**Bước 3 — điền `dwgSha256` cho đúng.** Plugin **từ chối nạp** nếu hash không khớp (chống dùng nhầm tệp). Tính hash trên Windows:

```powershell
(Get-FileHash .\blocks.dwg -Algorithm SHA256).Hash.ToLower()
```

Dán kết quả vào trường `"dwgSha256"` của manifest.

**Bước 4 — nạp:**

```
XBOSS_VE_THUVIEN    → chọn Tep → chọn manifest.json
```

`.dwg` **tự nhận** nếu thư mục chỉ có đúng một tệp `.dwg`; nhiều tệp thì plugin hỏi chọn.
Phải hiện: `✔ Đã nạp thư viện block <version> (N block) từ tệp tay → …\XBoss\block-lib`

☐ Thư viện nạp OK, số block = ......

**Nếu báo lỗi hash:** `Tệp thư viện block không khớp manifest (manifest abc…, tệp def…)` → tính lại `Get-FileHash` và dán lại. Đây là lỗi hay gặp nhất khi làm tay, vì sửa `.dwg` xong quên cập nhật hash.

---

## 3. Chạy checklist

Theo `docs/ops/verify-tay-plugin-autocad-M100-M101.md`, **bỏ qua mục 0.3 (`XBOSS_LOGIN`)** và làm mục 2.1/2.2 ở trên thay cho mục 0.4.

Riêng vài ca cần chỉnh cách làm khi offline:

| Ca                                    | Cách làm offline                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **AC7** (trùng tên block)             | Vẫn làm được nguyên vẹn — chỉ cần thư viện đã nạp tay                                                                                                                                            |
| **AC8** (tự cập nhật ETag)            | **Bỏ qua**, ghi "chờ server"                                                                                                                                                                     |
| **AC9** (rule pack cũ không phá lệnh) | Nạp `v3.json` từ repo bằng `XBOSS_RULEPACK` → chạy `XBOSS_KIEMTRA`/`XBOSS_CHUANHOA`/`XBOSS_BOCKL`; xong nạp lại `v8.json`                                                                        |
| **`XBOSS_BOCKL_XUAT`**                | Khi hỏi "Kéo KL BOQ hợp đồng?" trả lời **Không** (mặc định) → Excel vẫn xuất đủ, chỉ thiếu sheet `Doi-chieu`                                                                                     |
| **Mã BOQ theo dự án**                 | Không có server thì sửa tay `takeoff.items[].boqCode` trong bản `v8.json` cục bộ rồi nạp lại — **chỉ để thử**, đừng dùng cách này khi chạy thật (rule pack là append-only, phát hành qua server) |

---

## 4. Kiểm phần server sau, khi đã có server

Ba việc còn lại, làm khi dựng xong web + DB:

1. **AC8** — phát hành thư viện version mới trên `/engineering/chuan-hoa-ban-ve` → `XBOSS_LOGIN` trên máy kỹ sư → kiểm plugin tải bản mới.
2. **`XBOSS_UPLOAD`** — gửi bản vẽ đã chuẩn hóa, kiểm server trả **422 kèm danh sách lỗi** khi bản vẽ không đạt và **không tạo revision nào**.
3. **Sheet `Doi-chieu`** — gán mã BOQ theo dự án trên web, `XBOSS_BOCKL_XUAT` chọn **Có**, kiểm KL hợp đồng hiện cạnh KL bóc và chênh lệch là **công thức sống**.

Muốn dựng server tối thiểu để kiểm 3 việc này: cần `DATABASE_URL` + `XBOSS_SECRET`, chạy `npm run dev` — xem `DEPLOY.md`. Không cần dữ liệu thật, chỉ cần DB trống (migration tự chạy ở query đầu tiên).

---

## 5. Ghi nhận

☐ Rule pack v8 nạp tay OK ☐ Thư viện block tự tạo nạp OK
☐ Đã chạy 13 ca AC không cần server — số ca đạt: ....../13
☐ Ca không đạt: `________________________________`
☐ Còn treo chờ server: AC8, `XBOSS_UPLOAD`, sheet `Doi-chieu`

Người chạy: ....................... Ngày: ...............
