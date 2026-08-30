# Test vector chia đốt MEPF (M105) — dùng chung cho engine TS và engine C#

Mỗi tệp `*.json` trong thư mục này là **một ca kiểm** của engine chia đốt theo kiểu kết nối
(M105 §7 FR1–FR7). Bộ vector này là **hợp đồng khóa 2 engine với nhau** (M105 NFR1 / AC12):

- `lib/ky-thuat/engineering-joint-segmentation.ts` (web) — đọc bởi
  `tests/engineering-joint-segmentation.test.ts`;
- `plugin-autocad/XBoss.Cad.Core/Draw/JointSegmenter.cs` (plugin, PR2) — đọc bởi unit test xunit.

Cùng đầu vào thì **hai engine phải ra cùng từng con số** (±0,1 mm). Sửa công thức một bên mà quên
bên kia sẽ làm bộ vector này đỏ — đó là mục đích.

Mọi giá trị `expected` trong các tệp này được **tính tay theo công thức FR2/FR3** (xem phần công
thức bên dưới và ghi chú `note` từng tệp), **không** sinh ra bằng cách chạy engine — nếu không thì
test chỉ khóa engine với chính nó.

## Cấu trúc một tệp

```jsonc
{
  "id": "duct-tdc-7200", // trùng tên tệp
  "ac": "AC1, AC13", // tiêu chí chấp nhận trong đặc tả M105 §8 mà ca này phủ
  "note": "mô tả tiếng Việt ca kiểm",

  "input": {
    "systemId": "HVAC", // hệ trong rule pack (drawTools.systems[].id)
    "itemId": "duct-supp", // tuyến trong rule pack (…lines[].itemId)
    "size": "800x400", // cỡ đọc từ XData: "WxH" (mm) hoặc "DN<n>"
    "sizeKind": "WxH", // "WxH" | "DN"
    "runIndex": 1, // số thứ tự tuyến trong bản vẽ → vào tag đốt (3 chữ số)
    "overrideJointType": "…", // (tuỳ chọn) kỹ sư ghi đè kiểu nối tự chọn — FR1

    // Bản sao khối `jointRules` của tuyến trong rule pack v9. CHÉP VÀO ĐÂY (không tham chiếu
    // rule pack) để vector tự mô tả đủ và test C# không phải nạp rule pack.
    "rules": {
      "selection": [{ "jointType": "…", "maxSideMm": 450, "maxLenMm": 1180, "jointGapMm": 0 }],
      "divideMode": "deu", // "deu" | "cay_nguyen"
      "minPieceLenMm": 200,
      "layerStyle": { "suffix": "JOINT", "color": 8, "linetype": "DASHED" },
      "hardware": { "<jointType>": [{ "item": "…", "perJoint": 4, "unit": "cái" }] },
    },

    // Các đoạn thẳng của tim tuyến — mỗi vertex polyline là ranh giới đốt bắt buộc (FR4),
    // nên mỗi đoạn được chia ĐỘC LẬP.
    "segments": [{ "lengthMm": 7200 }],
  },

  "expected": {
    "jointType": "tdc", // kiểu nối engine phải chọn (hoặc kiểu đã ghi đè)
    "overridden": false,
    "divideMode": "deu",
    "maxLenMm": 1110, // tham số của kiểu nối đã chọn
    "jointGapMm": 5,
    "minPieceLenMm": 200,
    "totalLengthMm": 7200, // Σ lengthMm của mọi đoạn
    "pieceCount": 7,
    "jointCount": 6, // Σ(nᵢ − 1) — mối tại vertex là ranh giới, không tính
    "pieces": [
      { "segmentIndex": 0, "pieceIndex": 1, "lengthMm": 1024.3, "tag": "D-duct-supp-001-01" },
    ],
    "warnings": [], // slug cảnh báo, gộp trùng, theo thứ tự xuất hiện
    "hardware": [
      // phụ kiện mối nối đã tổng hợp, SẮP XẾP THEO `item`
      { "item": "bulong-m8", "unit": "cái", "quantity": 48 },
    ],
  },
}
```

## Công thức mà vector khóa lại (M105 FR2/FR3)

Ký hiệu: `L` = chiều dài đoạn, `maxLen` = `maxLenMm`, `gap` = `jointGapMm` (khe mối nối cộng thêm
giữa 2 đốt liền kề), `min` = `minPieceLenMm`.

1. **`L < min`** → đúng 1 đốt dài `L`, cảnh báo `dot_ngan_hon_toi_thieu`.
2. **`divideMode = "deu"`** (ống gió): `n = ceil(L / (maxLen + gap))`;
   `pieceLen = (L − (n−1)·gap) / n` làm tròn 0,1 mm; **đốt cuối nhận phần dư**
   (`L − (n−1)·gap − (n−1)·pieceLen`) để tổng khớp đúng — nên đốt cuối có thể lệch ±0,1 mm so với
   các đốt trước.
3. **`divideMode = "cay_nguyen"`** (ống nước/PCCC/máng cáp): lặp cắt đốt `maxLen`, mỗi đốt **sau
   đốt đầu tiên** tiêu tốn thêm `gap`; đốt cuối là phần dư. Nếu phần dư `> 0` nhưng `< min` thì gộp
   nó với đốt trước rồi **chia đôi đều 2 đốt cuối**.
4. **Bất biến bắt buộc** cho mọi chế độ: `Σ pieceLen + (n−1)·gap = L` (sai số ±0,5 mm). Engine tự
   kiểm; vi phạm → cảnh báo `sai_lech_tong_chieu_dai` (phòng thủ, không bao giờ nên xảy ra).
5. **Chọn kiểu nối** (FR1): duyệt `selection` **theo thứ tự**, mục đầu tiên khớp thì thắng — tuyến
   `WxH` so **cạnh lớn** `max(W,H)` với `maxSideMm`, tuyến `DN` so số DN với `maxDn`; giá trị `null`
   = mục bắt hết phần còn lại.
6. **Tag đốt**: `D-<itemId>-<runIndex 3 chữ số>-<pieceIndex 2 chữ số>`; `pieceIndex` đánh **liên
   tục toàn tuyến** (không reset theo đoạn).
7. **Phụ kiện mối nối** (FR7): mỗi mối sinh `perJoint` (số hoặc biểu thức mini theo `W`/`H`/`DN`,
   chỉ gồm `+ - * /`, ngoặc và `ceil()`), nhân với `jointCount`, tổng hợp theo `item` + `unit`;
   `unit = "m"` quy đổi mm → m, đơn vị khác giữ nguyên trị. Tuyến 0 mối → không phát sinh phụ kiện.

## Lưu ý cho bản C# (PR2)

- **Làm tròn 0,1 mm phải là "nửa lên, ra xa 0"**: `Math.Round(x, 1, MidpointRounding.AwayFromZero)`.
  Mặc định của .NET là làm tròn ngân hàng (về số chẵn) nên sẽ lệch đúng ở các ca `,x5`.
- So khớp `pieces[].lengthMm` với dung sai `±0,05 mm`, `hardware[].quantity` với `±0,001`.
- `hardware` trong `expected` đã sắp theo `item` (rồi `unit`) — sắp cùng thứ tự trước khi so.

## Thêm ca mới

Thêm một tệp `.json` là đủ — `tests/engineering-joint-segmentation.test.ts` tự quét cả thư mục.
Nhớ tính tay `expected` và ghi công thức vào `note`.
