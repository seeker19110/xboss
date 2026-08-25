using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Cầu nối nhỏ giữa thực thể AutoCAD và mô hình thuần của Core cho bộ lệnh vẽ — khai MỘT lần,
/// mọi lệnh dùng chung (trước đây mỗi lệnh chép lại một bản, dễ lệch nhau khi sửa).
/// </summary>
internal static class VeThucThe
{
    /// <summary>Đỉnh + bulge của polyline dưới dạng mô hình thuần của Core.</summary>
    internal static List<DinhPolyline> DinhCua(Polyline pl)
    {
        var dinh = new List<DinhPolyline>(pl.NumberOfVertices);
        for (var i = 0; i < pl.NumberOfVertices; i++)
        {
            var p = pl.GetPoint2dAt(i);
            dinh.Add(new DinhPolyline(p.X, p.Y, pl.GetBulgeAt(i)));
        }
        return dinh;
    }

    /// <summary>
    /// Thêm thực thể vào một block record rồi MỚI đặt layer (tên layer chỉ tra được khi thực thể
    /// đã thuộc database — đặt trước AppendEntity là lỗi eNoDatabase kinh điển).
    /// </summary>
    internal static void Them(Transaction tr, BlockTableRecord noiChua, Entity ent, string layer)
    {
        noiChua.AppendEntity(ent);
        tr.AddNewlyCreatedDBObject(ent, true);
        ent.Layer = layer;
    }
}
