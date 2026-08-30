using Autodesk.AutoCAD.Windows;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

namespace XBoss.Cad.Acad.Ui;

/// <summary>
/// PaletteSet "XBoss" (M102, mở rộng ở M106 FR7) — cửa sổ neo được, hai tab:
/// <list type="bullet">
/// <item><b>Quy trình</b> (<see cref="TrinhDanControl"/>) — trình dẫn 6 giai đoạn, tab mặc định
/// vì đây là lối vào chính: đang ở bước nào, tiếp theo bấm gì.</item>
/// <item><b>Trạng thái</b> (<see cref="BangDieuKhienControl"/>) — bảng trạng thái M102, GIỮ
/// NGUYÊN: server/thiết bị, rule pack, thư viện block, sidecar cạnh bản vẽ.</item>
/// </list>
/// Singleton theo phiên AutoCAD, Guid cố định để AutoCAD nhớ vị trí neo giữa các lần mở.
/// </summary>
internal static class BangDieuKhienPalette
{
    // Guid cố định (không sinh động) — đổi Guid là AutoCAD quên vị trí neo người dùng đã chỉnh.
    private static readonly Guid IdPalette = new("7c2f6f7e-9b1a-4d2c-8f5e-ab055000102a");

    private static PaletteSet? _paletteSet;
    private static BangDieuKhienControl? _control;
    private static TrinhDanControl? _trinhDan;

    /// <summary>Bật/tắt bảng; lần bật nào cũng làm mới trạng thái.</summary>
    internal static void BatTat()
    {
        if (_paletteSet is null)
        {
            _control = new BangDieuKhienControl();
            _trinhDan = new TrinhDanControl();
            _paletteSet = new PaletteSet("XBoss", IdPalette)
            {
                Style = PaletteSetStyles.ShowCloseButton | PaletteSetStyles.ShowAutoHideButton,
                MinimumSize = new System.Drawing.Size(280, 320),
            };
            _paletteSet.Add("Quy trình", _trinhDan);
            _paletteSet.Add("Trạng thái", _control);
            TheoDoiDoiBanVe();
        }

        if (_paletteSet.Visible)
        {
            _paletteSet.Visible = false;
            return;
        }
        _trinhDan!.LamMoi();
        _control!.LamMoi();
        _paletteSet.Visible = true;
    }

    /// <summary>
    /// Đổi bản vẽ hiện hành là đổi gần hết dữ liệu của bảng (sidecar cạnh DWG, XData trên bản vẽ)
    /// nên phải tính lại — không thì trình dẫn nói về bản vẽ khác với bản vẽ trước mắt kỹ sư.
    /// Chỉ tính lại khi bảng đang hiện, và cố ý KHÔNG gọi <c>BangDieuKhienControl.LamMoi</c>
    /// (hàm đó kèm một lượt hỏi server danh sách đề xuất block): vẽ lại bằng dữ liệu cục bộ là đủ,
    /// mỗi lần chuyển tab bản vẽ mà bắn một request là hành xử tồi khi mạng công trường yếu.
    /// </summary>
    private static void TheoDoiDoiBanVe() =>
        AcadApp.DocumentManager.DocumentActivated += (_, _) =>
        {
            if (_paletteSet is not { Visible: true }) return;
            _trinhDan?.LamMoi();
            _control?.HienThi(TrangThaiGom.LayTrangThai());
        };
}
