# XBoss.Cad.AcadShim — cổng CI biên dịch thử Adapter trên Linux

Project này biên dịch **toàn bộ mã nguồn của `XBoss.Cad.Acad`** trên Linux/CI bằng bộ khai báo
giả (stub) API AutoCAD trong `AcadStub.cs`, **không** cần Windows, **không** cần ObjectARX SDK.

```bash
dotnet build plugin-autocad/XBoss.Cad.AcadShim/XBoss.Cad.AcadShim.csproj -c Release
```

## ⚠ Đây KHÔNG phải AutoCAD — đọc kỹ giới hạn

`AcadStub.cs` chỉ có **kiểu và chữ ký**; mọi thân hàm rỗng hoặc trả giá trị vô nghĩa
(`Area => 0`, `GetObject(...) => null`, …). Không có DWG, không có transaction, không có
hình học. Vì vậy:

| Cổng này BẮT được                                              | Cổng này KHÔNG bắt được                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------- |
| Lỗi cú pháp (thiếu `}`, ngoặc lệch, gộp nhánh git hỏng)        | Sai logic nghiệp vụ, sai công thức hình học                    |
| Gọi sai tên/chữ ký API AutoCAD **so với những gì stub khai**   | Sai chữ ký so với API **thật**, nếu stub khai sai              |
| Sai kiểu, sai `using`, tên không tồn tại, ép kiểu không hợp lệ | Lỗi lúc chạy: `eNotOpenForWrite`, ObjectId chết, khóa tài liệu |
| Cảnh báo trình biên dịch (đang bật `TreatWarningsAsErrors`)    | Hành vi UI, prompt, undo, hiển thị font trong AutoCAD          |
| —                                                              | **Trạng thái bản vẽ**: layer khoá, xref, quyền ghi đối tượng   |

**Cổng xanh KHÔNG thay được verify tay trên máy có AutoCAD + license.** Quy trình phát hành
Adapter vẫn phải: build thật theo `plugin-autocad/README.md` §Build → chạy lệnh trên bản vẽ
mẫu (`plugin-autocad/mau-ban-ve/`) → đối chiếu `doi-chung/`.

## Vì sao project này tồn tại

`XBoss.Cad.Acad` là `net10.0-windows` và tham chiếu `acmgd/acdbmgd/accoremgd`, nên CI **không
build được nó**. Lỗ hổng đó đã cháy 2 lần thật (xem `PROGRESS.md`):

1. Lần đầu Adapter được biên dịch trên máy thật: **8 lỗi mà CI hoàn toàn không thể bắt**.
2. Đợt M100: một lần gộp xung đột tay làm **mất 3 dòng đóng khối** trong
   `Services/TakeoffScanner.cs` — cả plugin không build nổi trên Windows, mà **toàn bộ CI vẫn
   xanh**. Chỉ phát hiện được nhờ một bộ stub dựng tạm ngoài repo.

Cả hai lớp lỗi đều nằm gọn trong cột trái của bảng trên. Project này đưa bộ stub đó vào repo và
biến nó thành cổng CI chạy mỗi PR (job `plugin-shim` trong `.github/workflows/ci.yml`).

## Khi build đỏ vì "thiếu kiểu / thiếu thành viên"

Nghĩa là Adapter vừa dùng một API AutoCAD mà stub chưa khai. **Bổ sung vào `AcadStub.cs`** —
đừng sửa Adapter cho vừa stub, và đừng thêm `<NoWarn>` để né.

Bắt buộc khi bổ sung:

1. **Đối chiếu tài liệu ObjectARX 2026 / .NET API Reference** cho đúng namespace, tên kiểu,
   thứ tự + kiểu tham số, kiểu trả về, và **quan hệ kế thừa** — vd `Polyline` kế thừa `Curve`
   kế thừa `Entity` kế thừa `DBObject`; khai sai cây kế thừa thì `case Curve cv:` trong Adapter
   lọt/không lọt sai mà vẫn biên dịch trót lọt.
2. Ghi chú ngắn bằng tiếng Việt cho thành viên nào có ngữ nghĩa dễ hiểu nhầm (xem
   `Database.Purge` — API thật lọc **tại chỗ** collection truyền vào).
3. Giữ thân hàm **rỗng/vô nghĩa**. Stub mà "chạy được" là stub sai mục đích: nó dụ người đọc
   tin rằng cổng đang kiểm hành vi.

**Stub khai sai chữ ký thì cổng xanh giả — tệ hơn là không có cổng.** Đó là lý do phải đối
chiếu tài liệu chứ không đoán theo lỗi biên dịch.

## Ghi chú thiết kế

- **Glob, không liệt kê tay.** csproj lấy `../XBoss.Cad.Acad/**/*.cs`. Liệt kê tay thì mỗi tệp
  lệnh mới sẽ lọt lưới — đúng lớp lỗi đang bịt. Target `KiemGlobAdapterKhongRong` bắt đỏ nếu
  glob không khớp tệp nào (thư mục bị đổi tên → cổng xanh trên hư không).
- **`#nullable disable` trong `AcadStub.cs`** tái hiện việc assembly AutoCAD thật không có chú
  thích nullable, để Adapter (`Nullable=enable`) nhận **cùng** bộ cảnh báo nullable như bản
  build thật trên Windows.
- **Suppress cảnh báo đặt trong `AcadStub.cs`, không đặt vào `<NoWarn>` csproj** — để mã Adapter
  vẫn bị soi bằng đủ bộ cảnh báo.
- **`net8.0` chứ không `net10.0-windows`.** Stub thay hoàn toàn assembly AutoCAD nên không còn
  ràng buộc nền; net8 là SDK có sẵn trên `ubuntu-latest`. Thứ đang kiểm là cú pháp + chữ ký,
  không phụ thuộc nền. `System.Windows.Forms.DialogResult`/`FolderBrowserDialog` được stub tự
  khai (cuối `AcadStub.cs`) vì Linux không có WinForms.
- **`WpfStub.cs` — stub WPF + mã sinh từ XAML (M106).** Hộp thoại của plugin viết bằng WPF, mà WPF
  chỉ có trên Windows nên Linux không biên dịch được `System.Windows.*`; `WpfStub.cs` khai giả đúng
  phần Adapter chạm tới (`Window`, `RoutedEventArgs`, `Color`/`Brush`) **và** phần
  `InitializeComponent()` mà MSBuild sinh từ `.xaml` khi build thật. Tách khỏi `AcadStub.cs` vì đây
  không phải API AutoCAD. **Cổng này không kiểm được nội dung XAML** (markup, binding, tên style) —
  mỗi hộp thoại phải có dòng verify tay trong `plugin-autocad/VERIFY-VA-PHAT-HANH.md`.
  Code-behind của cửa sổ cố ý không chạm phần tử `x:Name` (mọi thứ đi qua binding vào ViewModel ở
  Core), nên thêm hộp thoại mới là thêm `DataTemplate` trong XAML chứ không phải thêm stub.
- **Cố ý KHÔNG nằm trong `XBoss.Cad.sln`.** Solution là góc nhìn sản phẩm (Core + Tests +
  Adapter thật); project này là công cụ CI. Để ngoài giữ `dotnet build/test` trên solution có
  hành vi y hệt trước, và tránh biên dịch mã Adapter hai lần trong IDE trên Windows.

## Giới hạn đã biết của cổng (và cách đã vá)

Cổng biên dịch mã Adapter trên Linux nên **không thể bật `UseWindowsForms`/`UseWPF`** — mà chính
hai cờ đó quyết định bộ `ImplicitUsings` của bản build thật. Hệ quả từng làm lọt lỗi:

| Ngày       | Lọt gì                                                                                                                                                                                                                                                                                                           | Vá thế nào                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | `CS0104 'Brush' ambiguous` ở `Ui/Wpf/MauBangWpf.cs` — chỉ lộ khi build trên máy có AutoCAD                                                                                                                                                                                                                       | Stub `System.Drawing.Brush`/`Pen` cuối `AcadStub.cs` (tái hiện cặp tên trùng) + `System.Drawing` nay nằm trong `XBoss.Cad.Acad/GlobalUsings.cs` nên cổng thấy đúng bộ using của bản thật                                                                                                                                                                                                                                                    |
| 2026-08-26 | 181 lỗi `CS0103 Path/File/Directory` ở pha biên dịch markup XAML — cổng xanh, bản thật đỏ                                                                                                                                                                                                                        | `ImplicitUsings` bị TẮT ở cả Adapter lẫn cổng, thay bằng `XBoss.Cad.Acad/GlobalUsings.cs` tường minh: project tạm `*_wpftmp` mà `UseWPF` sinh ra không kế thừa property `ImplicitUsings`, nhưng luôn nhận tệp `.cs`                                                                                                                                                                                                                         |
| 2026-08-26 | `CS8120 switch case unreachable` ở `Services/StandardizePipeline.cs` — stub khai `AttributeReference : Entity` trong khi ObjectARX thật là `AttributeReference : DBText`, nên cổng thấy hai nhánh rời nhau                                                                                                       | Sửa stub về đúng lớp cha. **Cây kế thừa của stub là một phần hợp đồng của cổng, không phải chi tiết trang trí** — khai sai lớp cha là mở lỗ cho mọi lỗi liên quan kiểu: nhánh chết, ép kiểu, chọn nạp chồng                                                                                                                                                                                                                                 |
| 2026-08-26 | **Lỗi TRẠNG THÁI bản vẽ, cổng không thể thấy**: `eOnLockedLayer` (sửa thực thể trên layer đang khoá) và `eInvalidKey` (mở bản ghi bảng ký hiệu của xref ForWrite) làm chết `XBOSS_BATCH`/`XBOSS_VE_NEN` trên bản vẽ MEP thật. Stub không có bản vẽ, không có khoá, không có xref ⇒ mọi thân hàm đều "thành công" | Không vá được bằng stub. Vá bằng **bất biến trên mã nguồn**: `XBoss.Cad.Tests/XrefVaKhoaLayerTests.cs` bắt mọi vòng duyệt `LayerTable`/`BlockTable` trong Adapter phải lọc xref (`IsDependent`/`IsFromExternalReference`) hoặc chú thích `xref-ok: <lý do>` tại chỗ, và bắt `StandardizePipeline.Run` phải khoá lại layer trong `finally`. Cộng thêm mục **C2b** trong `VERIFY-VA-PHAT-HANH.md` (chạy tay trên bản vẽ có xref + layer khoá) |

| 2026-08-26 | **Lỗi MARKUP, cổng không thể thấy**: `<Style TargetType="ComboBox">` trong `XBossDialog.xaml` đặt `Background` bằng Setter suông — ControlTemplate mặc định của WPF bỏ qua `Background` nên combo ra nền SÁNG + chữ gần trắng, đọc như bị khóa, giữa hộp thoại tối. Cổng chỉ biên dịch C#, XAML nằm hoàn toàn ngoài tầm | Thay hẳn ControlTemplate cho mọi control tự vẽ chrome (ComboBox/ComboBoxItem/TextBox/CheckBox/RadioButton/ScrollBar/Button). Vá lỗ cổng bằng **bất biến trên chính tệp XAML**: `XBoss.Cad.Tests/ThemeHopThoaiTests.cs` bắt đỏ khi style màu thiếu `Template`, thiếu trạng thái `IsEnabled=False`, `TargetName` trỏ hư không, gọi brush không có trong `MauBangWpf`, hoặc hardcode mã màu. Cộng mục **C8b** trong `VERIFY-VA-PHAT-HANH.md` (soi từng trạng thái bằng mắt) |

Quy tắc rút ra: **cổng chỉ trung thực khi bộ `using` của nó giống hệt bản thật.** Vì vậy Adapter
không dùng `ImplicitUsings` nữa — mọi `global using` nằm trong `XBoss.Cad.Acad/GlobalUsings.cs`,
một tệp `.cs` mà cả ba đường build (bản thật, pha markup `_wpftmp`, cổng CI) đều nhận. Thêm cờ nào
vào `XBoss.Cad.Acad.csproj` thì hỏi ngay: **cờ này có sinh project tạm hoặc đổi bộ using không?**
Cổng không mô phỏng được thì ghi vào bảng trên thay vì để im.
