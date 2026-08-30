# Đối chứng 2 tầng (M99 AC6)

Rủi ro số 1 của M99 (§18) là **trôi quy tắc giữa 2 tầng**: plugin C# (tầng 2) và server TS (tầng 3)
cùng đọc `lib/ky-thuat/cad/rule-packs/v2.json`, nhưng hai cách diễn giải có thể lệch nhau lúc nào
không hay. Thư mục này là cổng chặn việc đó, chạy được trên **CI Linux, không cần AutoCAD**.

| Tệp                           | Vai trò                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corpus.json`                 | Dữ liệu **VÀO** duy nhất cho cả hai tầng — viết tay, sửa có chủ đích                                                                                                                   |
| `ket-qua-mong-doi.json`       | Kết quả **RA** kỳ vọng, **sinh tự động** từ tầng 3 — đừng sửa tay                                                                                                                      |
| `block-lib-manifest-mau.json` | (M100 PR2) Manifest thư viện block mẫu — 1 block mỗi loại, dùng chung 2 tầng                                                                                                           |
| `block-lib-mau.dxf`           | (M100 PR2) DXF sidecar của thư viện mẫu — chứa đúng 5 định nghĩa block manifest khai                                                                                                   |
| `block-lib-mau.dwg.txt`       | (M100 PR2) Nội dung giả lập tệp `.dwg` thư viện; `dwgSha256` trong manifest băm từ nó                                                                                                  |
| `takeoff-sidecar-mau.json`    | (M101 PR5) Mẫu sidecar `takeoff.json` — đối chứng hợp đồng field giữa `TakeoffJsonReport.cs` (plugin, sinh ra) và `lib/ky-thuat/cad/bang-dieu-khien.ts` (server, đọc kiểu duck-typing) |
| `crossing-doi-chung.json`     | (M109 PR1) Bộ ca kiểm khối `drawTools.crossingPolicy` — cùng luật ở `lib/ky-thuat/cad/rule-pack.ts` (`kiemCrossingPolicy`) và `DrawToolsConfig.ValidateCrossingPolicy`                 |

```bash
npm run cad:doi-chung            # sinh lại ket-qua-mong-doi.json sau khi đổi quy tắc/corpus
npm run cad:doi-chung -- --kiem  # chỉ kiểm, lệch thì đỏ (dùng trong CI)
```

Hai bộ test đối chiếu với đúng hai tệp trên:

- Tầng 3: `tests/cad-doi-chung-2-tang.test.ts` (`npm test`)
- Tầng 2: `XBoss.Cad.Tests/DoiChungHaiTangTests.cs` (`dotnet test`, job `plugin` trong CI)

Bộ ca `crossing-doi-chung.json` (M109 PR1) cũng vậy: `tests/cad-crossing-doi-chung.test.ts` (tầng 3)
và `XBoss.Cad.Tests/CrossingDoiChungTests.cs` (tầng 2) chạy CÙNG danh sách ca — mỗi ca có đúng một
lỗi (hoặc không lỗi) vì tầng C# ném `RulePackException` ngay ở lỗi đầu tiên.

Bộ mẫu thư viện block (M100 PR2) đi cùng nguyên tắc: `tests/cad-block-lib.test.ts` (tầng 3, kiểm
định lúc phát hành) và `XBoss.Cad.Tests/BlockManifestTests.cs` (tầng 2, kiểm lúc nạp) nạp **cùng
ba tệp** trên — sửa manifest mẫu mà quên bên nào là bên đó đỏ ngay.

Đổi quy tắc chuẩn hóa → `ket-qua-mong-doi.json` đổi theo và **hiện rõ trong diff**; nếu plugin không
đổi cùng nhịp, `dotnet test` đỏ ngay.

**`takeoff-sidecar-mau.json`** (M101 PR5): nội dung khớp tay theo đúng tên field
`[JsonPropertyName]` sinh ra bởi `XBoss.Cad.Core/Reporting/TakeoffJsonReport.cs`, đối chứng khép
kín cả hai tầng như bộ manifest thư viện block:

- Tầng 3: `tests/cad-takeoff-sidecar-doi-chung-2-tang.test.ts` — khẳng định
  `lib/ky-thuat/cad/bang-dieu-khien.ts` (`docKlBocTuBaoCao`) phân giải đúng mọi field từ tệp mẫu.
- Tầng 2: `XBoss.Cad.Tests/TakeoffSidecarMauDoiChungTests.cs` (`dotnet test`, job `plugin` trong
  CI) — nạp cùng tệp mẫu vào `TakeoffJsonReport`/`TakeoffJsonLine` (khẳng định deserialize đủ mọi
  khoá bắt buộc) rồi `ToJson()` lại, khẳng định kết quả serialize vẫn có đủ mọi khoá mà tệp mẫu
  có. Đổi tên `[JsonPropertyName]` phía C# mà quên đổi tệp mẫu là đỏ ngay ở đây, không phải đợi
  tầng TS phát hiện sau.

**Phạm vi:** ánh xạ layer + giải mã font TCVN3/VNI. Phần AC6 về **hình học** (toạ độ, số thực thể
theo loại) cần AutoCAD thật → nằm ở kiểm tích hợp `accoreconsole` trên runner có license (PR7b),
dùng bộ mẫu trong `../mau-ban-ve/`.
