using System.Drawing;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// Bảng màu dùng chung cho các cửa sổ WinForms của plugin (bảng điều khiển M102, hộp thoại
/// đề xuất block M103). Bám theme TỐI của AutoCAD — không theo theme web, vì đây là cửa sổ nằm
/// trong AutoCAD. Khai MỘT chỗ để hai cửa sổ không trôi màu khỏi nhau.
/// </summary>
internal static class MauBang
{
    internal static readonly Color Nen = Color.FromArgb(43, 43, 46);
    internal static readonly Color NenKhoi = Color.FromArgb(55, 55, 60);
    internal static readonly Color NenO = Color.FromArgb(32, 32, 35);
    internal static readonly Color Chu = Color.FromArgb(220, 220, 222);
    internal static readonly Color ChuMo = Color.FromArgb(160, 160, 165);
    internal static readonly Color Tot = Color.FromArgb(96, 200, 140);
    internal static readonly Color CanhBao = Color.FromArgb(235, 170, 80);
    internal static readonly Color NutChinh = Color.FromArgb(16, 124, 88);
}
