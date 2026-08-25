using Autodesk.AutoCAD.Windows;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// PaletteSet "XBoss" (M102) — cửa sổ neo được chứa <see cref="BangDieuKhienControl"/>.
/// Singleton theo phiên AutoCAD, Guid cố định để AutoCAD nhớ vị trí neo giữa các lần mở.
/// </summary>
internal static class BangDieuKhienPalette
{
    // Guid cố định (không sinh động) — đổi Guid là AutoCAD quên vị trí neo người dùng đã chỉnh.
    private static readonly Guid IdPalette = new("7c2f6f7e-9b1a-4d2c-8f5e-ab055000102a");

    private static PaletteSet? _paletteSet;
    private static BangDieuKhienControl? _control;

    /// <summary>Bật/tắt bảng; lần bật nào cũng làm mới trạng thái.</summary>
    internal static void BatTat()
    {
        if (_paletteSet is null)
        {
            _control = new BangDieuKhienControl();
            _paletteSet = new PaletteSet("XBoss", IdPalette)
            {
                Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowAutoHideButton,
                MinimumSize = new System.Drawing.Size(280, 320),
            };
            _paletteSet.Add("Trạng thái", _control);
        }

        if (_paletteSet.Visible)
        {
            _paletteSet.Visible = false;
            return;
        }
        _control!.HienThi(TrangThaiGom.LayTrangThai());
        _paletteSet.Visible = true;
    }
}
