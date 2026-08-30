using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.GraphicsInterface;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Drawing` (xem MarkService.cs).
using AcadColor = Autodesk.AutoCAD.Colors.Color;
// AutoCAD thật có cả DatabaseServices.Polyline và GraphicsInterface.Polyline.
using DbPolyline = Autodesk.AutoCAD.DatabaseServices.Polyline;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Nét mảnh TẠM cho bước xem trước của <c>XBOSS_VE_TUYENTUDONG</c> (M114 FR10).
///
/// <para><b>Quyết định: dùng ĐỒ HỌA TẠM (<see cref="TransientManager"/>), không phải thực thể tạm
/// trong bản vẽ.</b> AC11 đòi "bấm Hủy thì bản vẽ không đổi một nét nào — so số thực thể
/// trước/sau". Thực thể tạm phải được thêm vào database rồi xóa đi: nó để lại bước UNDO, để lại
/// layer mới, và nếu AutoCAD/lệnh chết giữa chừng thì nét tạm nằm lại trong bản vẽ nộp. Đồ họa
/// tạm KHÔNG chạm database: không thực thể, không layer, không bước UNDO — hủy là sạch tuyệt đối,
/// kể cả khi lệnh vỡ giữa chừng (lớp này là <see cref="IDisposable"/> nên <c>using</c> dọn hộ).</para>
///
/// Màu ACI 6 (tím) cố ý khác màu nét tim (ACI 2/4) và hành lang (ACI 4) để nét đề xuất không lẫn
/// với nét thật trong lúc kỹ sư soi bản vẽ.
/// </summary>
internal sealed class NetTamXemTruoc : IDisposable
{
    /// <summary>ACI của nét tạm — tím, không trùng màu tuyến/hành lang của bộ lệnh vẽ.</summary>
    private const short AciNetTam = 6;

    private readonly Editor _ed;
    private readonly List<DbPolyline> _net = [];

    internal NetTamXemTruoc(Editor ed) => _ed = ed;

    /// <summary>
    /// Vẽ lại toàn bộ nét tạm theo kế hoạch mới (xóa nét cũ trước). Gọi mỗi lần hộp thoại tính lại.
    /// </summary>
    internal void Ve(IReadOnlyList<NhanhVeRa> nhanh)
    {
        Xoa();
        var quanLy = TransientManager.CurrentTransientManager;
        foreach (var n in nhanh)
        {
            if (n.Diem.Count < 2) continue;
            var pl = VeThucThe.TaoPolyline(
                n.Diem.Select(d => new DinhPolyline(d.X, d.Y, 0)).ToList(), kin: false);
            // Thực thể chưa thuộc database nên KHÔNG để ByLayer (không có layer nào để tra) — đặt
            // màu tường minh.
            pl.Color = AcadColor.FromColorIndex(ColorMethod.ByAci, AciNetTam);
            quanLy.AddTransient(pl, TransientDrawingMode.DirectShortTerm, 128, new IntegerCollection());
            _net.Add(pl);
        }
        _ed.UpdateScreen();
    }

    /// <summary>Gỡ sạch nét tạm khỏi màn hình.</summary>
    internal void Xoa()
    {
        if (_net.Count == 0) return;
        var quanLy = TransientManager.CurrentTransientManager;
        foreach (var pl in _net)
        {
            quanLy.EraseTransient(pl, new IntegerCollection());
            pl.Dispose();
        }
        _net.Clear();
        _ed.UpdateScreen();
    }

    public void Dispose() => Xoa();
}
