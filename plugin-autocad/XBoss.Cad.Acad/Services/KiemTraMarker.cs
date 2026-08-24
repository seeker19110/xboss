using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Marker trực quan của XBOSS_KIEMTRA (M99 §6.4): vòng tròn nhỏ trên layer tạm
/// XBOSS_KIEMTRA_MARK tại vị trí lỗi. KHÔNG đụng thuộc tính đối tượng gốc; chạy lại
/// lệnh sẽ dọn sạch marker cũ trước; marker không được tính vào diff chuẩn hóa.
/// </summary>
internal static class KiemTraMarker
{
    internal const string TenLayer = "XBOSS_KIEMTRA_MARK";

    /// <summary>Xoá toàn bộ marker cũ (nếu có) — gọi ở đầu mỗi phiên kiểm và trước chuẩn hóa.</summary>
    internal static int DonSach(Database db, Transaction tr)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (!lt.Has(TenLayer)) return 0;
        var soXoa = 0;
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (!string.Equals(ent.Layer, TenLayer, StringComparison.OrdinalIgnoreCase)) continue;
            ent.UpgradeOpen();
            ent.Erase();
            soXoa++;
        }
        return soXoa;
    }

    /// <summary>Vẽ marker tại các thực thể lỗi (theo handle), bán kính ~1% khổ hình.</summary>
    internal static void Ve(Database db, Transaction tr, IEnumerable<string> handles, int aci)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        ObjectId layerId;
        if (lt.Has(TenLayer))
        {
            layerId = lt[TenLayer];
        }
        else
        {
            lt.UpgradeOpen();
            var ltr = new LayerTableRecord
            {
                Name = TenLayer,
                Color = Color.FromColorIndex(ColorMethod.ByAci, (short)aci),
                IsPlottable = false, // marker không bao giờ được in
            };
            layerId = lt.Add(ltr);
            tr.AddNewlyCreatedDBObject(ltr, true);
        }
        _ = layerId;

        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForWrite);
        var banKinh = BanKinhMarker(db);
        foreach (var handle in handles)
        {
            if (!db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id)) continue;
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            Point3d tam;
            try
            {
                var ext = ent.GeometricExtents;
                tam = new Point3d(
                    (ext.MinPoint.X + ext.MaxPoint.X) / 2,
                    (ext.MinPoint.Y + ext.MaxPoint.Y) / 2, 0);
            }
            catch (Autodesk.AutoCAD.Runtime.Exception)
            {
                continue; // thực thể không có extents (vd xline) — bỏ marker
            }
            var vong = new Circle(tam, Vector3d.ZAxis, banKinh) { Layer = TenLayer };
            ms.AppendEntity(vong);
            tr.AddNewlyCreatedDBObject(vong, true);
        }
    }

    private static double BanKinhMarker(Database db)
    {
        var rong = db.Extmax.X - db.Extmin.X;
        var cao = db.Extmax.Y - db.Extmin.Y;
        var kho = Math.Max(rong, cao);
        return kho > 0 && !double.IsInfinity(kho) ? kho / 100.0 : 100.0;
    }
}
