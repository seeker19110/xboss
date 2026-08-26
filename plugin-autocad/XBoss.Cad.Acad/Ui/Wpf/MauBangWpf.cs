// Alias TƯỜNG MINH, KHÔNG dùng `using System.Windows.Media;`: project Adapter bật CẢ
// UseWindowsForms LẪN UseWPF, nên ImplicitUsings kéo vào cùng lúc `System.Drawing` (của WinForms)
// và `System.Windows.Media` (của WPF) — hai namespace này đều có `Brush`, `Color`, `Pen`… nên tên
// trần là mơ hồ và build thật trên Windows đỏ CS0104. Cổng CI AcadShim KHÔNG bắt được lớp lỗi này
// (nó tắt WinForms để chạy trên Linux nên chỉ thấy một nửa bộ implicit using) — đã vấp thật
// 2026-08-26, lộ ra lúc build trên máy có AutoCAD. Quy tắc cho mọi tệp trong thư mục này: dùng
// alias hoặc tên đầy đủ cho các kiểu trùng tên giữa hai bộ.
using Brush = System.Windows.Media.Brush;
using Color = System.Windows.Media.Color;
using SolidColorBrush = System.Windows.Media.SolidColorBrush;

namespace XBoss.Cad.Acad.Ui.Wpf;

/// <summary>
/// Bảng màu của bảng điều khiển (<see cref="MauBang"/>) chuyển sang <see cref="Brush"/> để XAML
/// dùng được qua <c>{x:Static}</c>. Cố ý KHÔNG khai lại mã màu: bảng điều khiển WinForms (M102) và
/// hộp thoại WPF (M106) phải luôn cùng một tông — hai bảng màu là hai bảng sẽ trôi khỏi nhau.
///
/// Công khai (public) vì bộ biên dịch XAML truy cập qua <c>x:Static</c>; brush đã <c>Freeze()</c>
/// nên chia sẻ được giữa nhiều cửa sổ mà không tốn khóa luồng.
/// </summary>
public static class MauBangWpf
{
    public static readonly Brush Nen = Tu(MauBang.Nen);
    public static readonly Brush NenKhoi = Tu(MauBang.NenKhoi);
    public static readonly Brush NenO = Tu(MauBang.NenO);
    public static readonly Brush Chu = Tu(MauBang.Chu);
    public static readonly Brush ChuMo = Tu(MauBang.ChuMo);
    public static readonly Brush Tot = Tu(MauBang.Tot);
    public static readonly Brush CanhBao = Tu(MauBang.CanhBao);
    public static readonly Brush NutChinh = Tu(MauBang.NutChinh);

    private static Brush Tu(System.Drawing.Color mau)
    {
        var brush = new SolidColorBrush(Color.FromRgb(mau.R, mau.G, mau.B));
        brush.Freeze();
        return brush;
    }
}
