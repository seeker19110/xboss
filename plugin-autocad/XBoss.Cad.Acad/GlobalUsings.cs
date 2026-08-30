// Bộ `global using` TƯỜNG MINH của Adapter — thay cho `ImplicitUsings` của SDK.
//
// VÌ SAO KHÔNG DÙNG ImplicitUsings Ở ĐÂY (đã vấp thật 2026-08-26, lộ khi build trên máy có
// AutoCAD): project này bật `UseWPF`, nên khi có tệp .xaml, MSBuild sinh một project tạm
// `XBoss.Cad.Acad_<hash>_wpftmp.csproj` để biên dịch pha markup. Project tạm đó **không kế thừa
// `ImplicitUsings`** (nó chép Compile/Reference chứ không chép property này từ
// Directory.Build.props), nên toàn bộ mã Adapter mất `System.IO`, `System.Net.Http`… và pha
// markup đỏ 181 lỗi CS0103 `Path`/`File`/`Directory` — trong khi pha build thường vẫn xanh.
//
// Tệp .cs thì LUÔN được truyền sang project tạm, nên khai `global using` ở đây là cách duy nhất
// chắc chắn cho cả hai pha. `ImplicitUsings` bị tắt trong XBoss.Cad.Acad.csproj và trong
// XBoss.Cad.AcadShim.csproj (cổng CI biên dịch chính các tệp này) để không trùng khai báo.
//
// THÊM/BỚT DÒNG NÀO Ở ĐÂY LÀ ĐỔI CẢ HAI: bản build thật lẫn cổng CI. Giữ đúng bộ mà SDK sẽ tự
// thêm cho một project `Microsoft.NET.Sdk` bật `UseWindowsForms`, không hơn không kém.

// Bộ mặc định của Microsoft.NET.Sdk khi ImplicitUsings=enable.
global using System;
global using System.Collections.Generic;
global using System.IO;
global using System.Linq;
global using System.Net.Http;
global using System.Threading;
global using System.Threading.Tasks;

// Bộ mà UseWindowsForms thêm vào (UseWPF không thêm namespace nào — xem ghi chú trong
// XBoss.Cad.AcadShim.csproj). `System.Drawing` là lý do các tệp WPF phải dùng alias tường minh
// cho Brush/Color/Pen: hai namespace này trùng tên kiểu.
global using System.Drawing;
global using System.Windows.Forms;
