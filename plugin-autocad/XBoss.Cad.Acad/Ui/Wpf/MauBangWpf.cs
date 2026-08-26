using System.Windows.Media;

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
