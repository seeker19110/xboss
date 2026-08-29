using System.Globalization;
using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Nơi cất/đọc <b>mốc revision</b> của bộ lệnh <c>XBOSS_VE_REV*</c> (M110 §4) và các tiện ích đọc
/// bản vẽ đi kèm (quét đối tượng theo dõi, quét cloud/tam giác đã khoanh, tên layer con theo
/// revision).
///
/// Mốc nằm trong <b>Xrecord ở Named Objects Dictionary</b> của chính bản vẽ — cùng cách
/// <see cref="VeLayerService"/> nhớ trạng thái nền và <c>XBOSS_VE_TAG</c> nhớ tầng: đóng/mở lại
/// bản vẽ, đổi máy vẫn so mốc được, và mốc đi theo tệp DWG khi gửi cho người khác.
///
/// Toàn bộ LUẬT (băm hình học, so mốc, mã hóa dòng) nằm ở Core
/// (<see cref="RevisionSnapshot"/>) — lớp này chỉ chuyển đổi thực thể AutoCAD ↔ mô hình thuần,
/// đúng ranh giới của <see cref="VeXDataStore"/>.
/// </summary>
internal static class RevisionStore
{
    /// <summary>Khóa mục trong Named Objects Dictionary giữ mốc revision (M110 §4).</summary>
    internal const string KhoaNOD = "XBOSS_REV_SNAPSHOT";

    /// <summary>Phiên bản định dạng bản ghi mốc — khác thì không đọc mù, coi như chưa có mốc.</summary>
    private const string PhienBanMoc = "1";

    /// <summary>Mốc của lần chốt revision gần nhất.</summary>
    /// <param name="So">Số revision đã chốt tại thời điểm ghi mốc (1 = R1).</param>
    /// <param name="NgayIso">Ngày chốt (<c>yyyy-MM-dd</c>) — hiện trong thông báo của lệnh sau.</param>
    /// <param name="Muc">Trạng thái các đối tượng được theo dõi lúc chốt (§4).</param>
    internal sealed record Moc(int So, string NgayIso, IReadOnlyList<MucMoc> Muc);

    /// <summary>Một đối tượng revision đang có trong bản vẽ (cloud hoặc tam giác).</summary>
    internal sealed record DoiTuongRevision(ObjectId Id, string Handle, bool LaCloud, VeXDataInfo XData);

    // ===== Mốc trong NOD =====

    /// <summary>Mốc gần nhất; null = bản vẽ chưa từng chốt revision (hoặc bản ghi định dạng lạ).</summary>
    internal static Moc? DocMoc(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
        if (!nod.Contains(KhoaNOD)) return null;
        if (tr.GetObject(nod.GetAt(KhoaNOD), OpenMode.ForRead) is not Xrecord xrec) return null;
        if (xrec.Data is not { } data) return null;

        var gt = data.AsArray().Select(tv => tv.Value?.ToString() ?? "").ToList();
        if (gt.Count < 3 || gt[0] != PhienBanMoc) return null;
        if (!int.TryParse(gt[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out var so)) return null;
        return new Moc(so, gt[2], RevisionSnapshot.GiaiMa(gt.Skip(3)));
    }

    /// <summary>Ghi đè mốc (mỗi bản vẽ chỉ giữ MỘT mốc — mốc gần nhất, theo M110 §4).</summary>
    internal static void GhiMoc(Database db, Transaction tr, Moc moc)
    {
        var gt = new List<TypedValue>
        {
            new((int)DxfCode.Text, PhienBanMoc),
            new((int)DxfCode.Text, moc.So.ToString(CultureInfo.InvariantCulture)),
            new((int)DxfCode.Text, moc.NgayIso),
        };
        foreach (var dong in RevisionSnapshot.MaHoa(moc.Muc)) gt.Add(new TypedValue((int)DxfCode.Text, dong));

        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        var xrec = new Xrecord { Data = new ResultBuffer(gt.ToArray()) };
        nod.SetAt(KhoaNOD, xrec);
        tr.AddNewlyCreatedDBObject(xrec, true);
    }

    // ===== Đọc bản vẽ =====

    /// <summary>
    /// Trạng thái HIỆN TẠI của mọi đối tượng được mốc theo dõi (tim/phụ kiện/thiết bị/lỗ chờ —
    /// <see cref="RevisionSnapshot.VaiTroTheoDoi"/>). Băm hình học chứ không lưu tọa độ đầy đủ
    /// (NFR1: Xrecord ≤ 2MB trên bản vẽ 5000 đối tượng).
    /// </summary>
    internal static List<MucMoc> QuetHienTai(Database db, Transaction tr)
    {
        var ra = new List<MucMoc>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || !RevisionSnapshot.TheoDoi(xd.VaiTro)) continue;
            if (BaoHinhCua(ent) is not { } bao) continue;

            ra.Add(new MucMoc(
                ent.Handle.ToString(),
                xd.VaiTro,
                xd.HeId,
                xd.ItemId,
                xd.Size,
                RevisionSnapshot.BamHinhHoc(DiemBam(ent, bao)),
                bao));
        }
        return ra;
    }

    /// <summary>Mọi cloud + tam giác revision đang có trong model space (FR6/FR7/FR8).</summary>
    internal static List<DoiTuongRevision> QuetRevision(Database db, Transaction tr)
    {
        var ra = new List<DoiTuongRevision>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            var xd = VeXDataStore.Doc(ent);
            if (xd is null || xd.VaiTro != VaiTroVe.Revision) continue;
            // Cloud là polyline, tam giác là khối chèn — phân biệt theo KIỂU thực thể, không thêm
            // khóa XData mới (định dạng XData đã chốt ở PR1).
            ra.Add(new DoiTuongRevision(id, ent.Handle.ToString(), ent is Polyline, xd));
        }
        return ra;
    }

    /// <summary>Bao hình của một thực thể theo mô hình thuần của Core; null khi không lấy được.</summary>
    internal static BaoHinh? BaoHinhCua(Entity ent)
    {
        try
        {
            var ext = ent.GeometricExtents;
            return new BaoHinh(ext.MinPoint.X, ext.MinPoint.Y, ext.MaxPoint.X, ext.MaxPoint.Y);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            // Thực thể rỗng/suy biến (vd khối chèn không có hình) — bỏ qua, không đoán vùng.
            return null;
        }
    }

    /// <summary>
    /// Chuỗi điểm đưa vào hàm băm: polyline dùng ĐỈNH (dời một đỉnh là hash đổi), thực thể khác
    /// dùng 2 góc bao hình (khối chèn dời/đổi cỡ là bao hình đổi).
    /// </summary>
    private static IEnumerable<Diem2> DiemBam(Entity ent, BaoHinh bao)
    {
        if (ent is Polyline pl)
            return VeThucThe.DinhCua(pl).Select(d => new Diem2(d.X, d.Y));
        return [new Diem2(bao.MinX, bao.MinY), new Diem2(bao.MaxX, bao.MaxY)];
    }

    // ===== Layer con theo revision (FR6) =====

    /// <summary>
    /// Layer con của một revision: <c>&lt;revisionPolicy.layer&gt;-R{n}</c> (M110 FR6). Mỗi
    /// revision một layer con để bật/tắt hiển thị theo lần sửa mà không đụng đối tượng.
    /// </summary>
    internal static string LayerCua(string layerGoc, int so) =>
        $"{layerGoc}-R{so.ToString(CultureInfo.InvariantCulture)}";

    /// <summary>Số revision đọc ngược từ tên layer con; null = không phải layer con của bộ lệnh.</summary>
    internal static int? SoTuLayer(string layerGoc, string layer)
    {
        var tienTo = $"{layerGoc}-R";
        if (!layer.StartsWith(tienTo, StringComparison.OrdinalIgnoreCase)) return null;
        return int.TryParse(layer[tienTo.Length..], NumberStyles.Integer, CultureInfo.InvariantCulture, out var n)
            ? n
            : null;
    }
}
