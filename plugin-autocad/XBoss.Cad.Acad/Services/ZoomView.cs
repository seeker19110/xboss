using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Nút "Zoom tới" của các hộp thoại có danh sách bấm-tới-đối-tượng (M110 FR1, M115 §6).
///
/// Dùng <c>Editor.SetCurrentView</c> chứ KHÔNG gửi lệnh ZOOM: hộp thoại đang modal thì lệnh AutoCAD
/// không chạy được. Lỗi ở đây tuyệt đối không được làm chết hộp thoại — cùng lắm màn hình không nhảy.
/// </summary>
internal static class ZoomView
{
    /// <summary>Đưa màn hình về một bao hình, nới thêm <paramref name="le"/> (đơn vị bản vẽ).</summary>
    internal static void ToiBao(Editor ed, BaoHinh bao, double le)
    {
        Toi(ed, (bao.MinX + bao.MaxX) / 2, (bao.MinY + bao.MaxY) / 2,
            Math.Max(bao.Rong + le * 2, 1e-6), Math.Max(bao.Cao + le * 2, 1e-6));
    }

    /// <summary>Đưa màn hình về một điểm, cửa sổ vuông cạnh <paramref name="canh"/>.</summary>
    internal static void ToiDiem(Editor ed, double x, double y, double canh) =>
        Toi(ed, x, y, Math.Max(canh, 1e-6), Math.Max(canh, 1e-6));

    private static void Toi(Editor ed, double tamX, double tamY, double rong, double cao)
    {
        try
        {
            ed.SetCurrentView(new ViewTableRecord
            {
                CenterPoint = new Point2d(tamX, tamY),
                Width = rong,
                Height = cao,
            });
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // Không zoom được (bản vẽ đang bận / không có view) — bỏ qua, hộp thoại vẫn dùng bình thường.
        }
    }
}
