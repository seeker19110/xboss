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

    // ===== Tông TRẠNG THÁI của control (thêm ở M106 PR4, khi viết ControlTemplate cho hộp thoại
    // WPF). ControlTemplate mặc định của WPF vẽ chrome theo theme Windows và BỎ QUA Background của
    // control, nên hộp thoại phải tự vẽ đủ mọi trạng thái — mà "đủ mọi trạng thái" thì cần tông cho
    // viền / rê chuột / bị khóa, thứ bảng màu cũ (chỉ có nền + chữ) không có.
    //
    // Số liệu tương phản (WCAG, tính trên nền Nen 43,43,46 và NenO 32,32,35):
    //   Vien 3.46 : 1 với Nen, 3.97 : 1 với NenO → đạt ngưỡng 3:1 cho ranh giới control.
    //   Chu trên NenO 11.8 : 1 (bình thường) so với ChuKhoa trên NenKhoa 3.9 : 1 (bị khóa) —
    //   chênh đủ xa để KHÔNG lẫn hai trạng thái, đúng lỗi đã gặp (ô bình thường trông như khóa).

    /// <summary>Viền control trên nền tối (ô nhập, combo, nút phụ) — đủ 3:1 để thấy được ranh giới.</summary>
    internal static readonly Color Vien = Color.FromArgb(125, 125, 133);

    /// <summary>Viền khi rê chuột: sáng hơn <see cref="Vien"/> rõ rệt (tỉ lệ sáng ~1.9 lần).</summary>
    internal static readonly Color VienSang = Color.FromArgb(175, 175, 185);

    /// <summary>Viền control bị khóa: mờ gần bằng nền, cố ý — control khóa phải "chìm" đi.</summary>
    internal static readonly Color VienKhoa = Color.FromArgb(72, 72, 78);

    /// <summary>Nền khi rê chuột (mục danh sách, nút phụ) — sáng hơn nền tĩnh.</summary>
    internal static readonly Color NenRe = Color.FromArgb(66, 66, 72);

    /// <summary>Nền control bị khóa: PHẲNG hơn nền ô nhập bình thường (vốn tối, lõm).</summary>
    internal static readonly Color NenKhoa = Color.FromArgb(48, 48, 52);

    /// <summary>Chữ trong control bị khóa.</summary>
    internal static readonly Color ChuKhoa = Color.FromArgb(140, 140, 146);

    /// <summary>Nút chính khi rê chuột — ĐẬM hơn (ADR-0010: nền accent sáng dần sẽ kéo tụt tương
    /// phản với chữ trắng; ở đây 5.24:1 → 7.16:1 khi rê).</summary>
    internal static readonly Color NutChinhRe = Color.FromArgb(12, 100, 71);

    /// <summary>Nút chính khi đang nhấn (đậm nhất, 9.7:1 với chữ).</summary>
    internal static readonly Color NutChinhNhan = Color.FromArgb(9, 78, 56);
}
