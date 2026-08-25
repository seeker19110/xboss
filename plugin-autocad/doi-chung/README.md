# Đối chứng 2 tầng (M99 AC6)

Rủi ro số 1 của M99 (§18) là **trôi quy tắc giữa 2 tầng**: plugin C# (tầng 2) và server TS (tầng 3)
cùng đọc `lib/ky-thuat/cad/rule-packs/v2.json`, nhưng hai cách diễn giải có thể lệch nhau lúc nào
không hay. Thư mục này là cổng chặn việc đó, chạy được trên **CI Linux, không cần AutoCAD**.

| Tệp                     | Vai trò                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `corpus.json`           | Dữ liệu **VÀO** duy nhất cho cả hai tầng — viết tay, sửa có chủ đích |
| `ket-qua-mong-doi.json` | Kết quả **RA** kỳ vọng, **sinh tự động** từ tầng 3 — đừng sửa tay    |

```bash
npm run cad:doi-chung            # sinh lại ket-qua-mong-doi.json sau khi đổi quy tắc/corpus
npm run cad:doi-chung -- --kiem  # chỉ kiểm, lệch thì đỏ (dùng trong CI)
```

Hai bộ test đối chiếu với đúng hai tệp trên:

- Tầng 3: `tests/cad-doi-chung-2-tang.test.ts` (`npm test`)
- Tầng 2: `XBoss.Cad.Tests/DoiChungHaiTangTests.cs` (`dotnet test`, job `plugin` trong CI)

Đổi quy tắc chuẩn hóa → `ket-qua-mong-doi.json` đổi theo và **hiện rõ trong diff**; nếu plugin không
đổi cùng nhịp, `dotnet test` đỏ ngay.

**Phạm vi:** ánh xạ layer + giải mã font TCVN3/VNI. Phần AC6 về **hình học** (toạ độ, số thực thể
theo loại) cần AutoCAD thật → nằm ở kiểm tích hợp `accoreconsole` trên runner có license (PR7b),
dùng bộ mẫu trong `../mau-ban-ve/`.
