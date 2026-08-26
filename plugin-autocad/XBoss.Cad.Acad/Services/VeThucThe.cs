using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

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

    /// <summary>
    /// Dựng LWPOLYLINE 2D (Z=0) từ danh sách đỉnh + bulge của Core — dùng chung cho tuyến tim
    /// (<c>XBOSS_VE</c>) và nét biên dựng lại (<c>XBOSS_VE_DOI</c>).
    /// KHÔNG đặt layer ở đây: tên layer chỉ tra cứu được khi thực thể ĐÃ thuộc một database
    /// (đặt trước khi AppendEntity là nguồn lỗi eNoDatabase kinh điển) — caller đặt sau khi thêm
    /// (xem <see cref="Them"/>). Cũng KHÔNG gọi SetDatabaseDefaults: thực thể mới mặc định ByLayer,
    /// đúng chuẩn dự án (màu/nét lấy theo layer đích, không dính CECOLOR hiện hành của kỹ sư).
    /// </summary>
    internal static Polyline TaoPolyline(IReadOnlyList<DinhPolyline> dinh, bool kin)
    {
        var pl = new Polyline();
        for (var i = 0; i < dinh.Count; i++)
            pl.AddVertexAt(i, new Point2d(dinh[i].X, dinh[i].Y), dinh[i].Bulge, 0, 0);
        pl.Closed = kin;
        pl.Elevation = 0;
        pl.Normal = Vector3d.ZAxis;
        return pl;
    }

    /// <summary>ObjectId từ chuỗi handle trong XData; null khi handle đã mục (đối tượng bị xóa).</summary>
    internal static ObjectId? TimTheoHandle(Database db, string? handle)
    {
        if (string.IsNullOrWhiteSpace(handle)) return null;
        try
        {
            return db.TryGetObjectId(new Handle(Convert.ToInt64(handle, 16)), out var id) ? id : null;
        }
        catch (FormatException)
        {
            return null; // XData bị sửa tay thành chuỗi không phải handle
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    /// <summary>
    /// Vạch chia + tag đốt (<c>XBOSS_VE_CHIADOT</c> — M105) nhóm theo handle tuyến tim mà chúng
    /// bám vào. Quét MỘT lần cho cả lệnh: <c>XBOSS_VE_CHIADOT</c> dùng để chạy lại không nhân đôi,
    /// <c>XBOSS_VE_DOI</c> dùng để dọn vạch cũ khi cỡ tuyến đổi (số đốt phụ thuộc cỡ).
    /// </summary>
    internal static Dictionary<string, List<ObjectId>> ChiaDotTheoTim(Database db, Transaction tr)
    {
        var ra = new Dictionary<string, List<ObjectId>>(StringComparer.OrdinalIgnoreCase);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro is not (VaiTroVe.VachChia or VaiTroVe.NhanDot)) continue;
            if (xd.HandleTim is not { Length: > 0 } tim) continue;
            if (!ra.TryGetValue(tim, out var ds)) ra[tim] = ds = [];
            ds.Add(id);
        }
        return ra;
    }

    /// <summary>
    /// Xóa vạch chia + tag đốt của MỘT tuyến (dùng chung cho "chạy lại chia đốt" và "đổi cỡ tuyến").
    /// Tự mở khóa layer của chính đối tượng sắp xóa — sau <c>XBOSS_VE_NEN</c> mọi layer đang khóa,
    /// mở theo layer thật của đối tượng thì không phải tra ngược hậu tố layer trong rule pack.
    /// </summary>
    internal static int XoaChiaDotCua(
        Database db, Transaction tr, IReadOnlyDictionary<string, List<ObjectId>> theoTim, string handleTim)
    {
        if (!theoTim.TryGetValue(handleTim, out var ids)) return 0;
        var soXoa = 0;
        foreach (var id in ids)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity doc) continue;
            VeLayerService.MoKhoaNeuCo(db, tr, doc.Layer);
            if (tr.GetObject(id, OpenMode.ForWrite) is not Entity ghi) continue;
            ghi.Erase();
            soXoa++;
        }
        return soXoa;
    }

    /// <summary>Một khối do bộ lệnh vẽ chèn và đang bám vào một tuyến tim.</summary>
    internal readonly record struct KhoiBamTim(VaiTroVe VaiTro, Diem2 Diem, string? BlockId);

    /// <summary>
    /// Mọi khối do bộ lệnh vẽ chèn, nhóm theo handle của tim mà nó bám vào (phụ kiện, thiết bị,
    /// giá đỡ, lỗ chờ, mũi tên hướng dốc). Quét MỘT lần cho cả lệnh — bản vẽ shop có hàng nghìn
    /// khối, quét lại theo từng tuyến là chậm thấy rõ.
    /// </summary>
    internal static Dictionary<string, List<KhoiBamTim>> KhoiTheoTim(Database db, Transaction tr)
    {
        var ra = new Dictionary<string, List<KhoiBamTim>>(StringComparer.OrdinalIgnoreCase);
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            var xd = VeXDataStore.Doc(br);
            if (xd?.HandleTim is not { Length: > 0 } tim) continue;
            if (!ra.TryGetValue(tim, out var ds)) ra[tim] = ds = [];
            ds.Add(new KhoiBamTim(xd.VaiTro, new Diem2(br.Position.X, br.Position.Y), xd.BlockId));
        }
        return ra;
    }
}
