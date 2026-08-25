using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using XBoss.Cad.Core.Zoning;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Drawing` (System.Drawing.Region
// trùng tên với thực thể Region của AutoCAD) — xem MarkService.cs.
using AcadRegion = Autodesk.AutoCAD.DatabaseServices.Region;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Quét đối tượng cho XBOSS_BOCKL (M99 §6.5): đo hình học bằng chính API AutoCAD
/// (nguồn sự thật là bản vẽ), Core chỉ nhận số đo thô. Bỏ qua block xref (đếm để báo),
/// đọc XData để đánh dấu AlreadyMarked (chống bóc trùng — FR14).
///
/// M101 §6.3 bổ sung 3 dữ liệu ĐẦU VÀO (mọi tính toán vẫn ở Core): size từ XData XBOSS_VE của
/// bộ lệnh vẽ, nhãn text quanh tuyến (để Core tự đối chiếu <c>sizePatterns</c>), và phần chiều dài
/// theo từng vùng do <c>VungClipper</c> cắt.
/// </summary>
internal static class TakeoffScanner
{
    /// <summary>Bối cảnh bóc nâng cao (v6) — null/rỗng = bóc y hệt M99.</summary>
    internal sealed record BoiCanhBoc(
        IReadOnlyList<RanhGioiVung> Vung,
        IReadOnlyList<(string NoiDung, Point3d Diem)> Nhan,
        double NguongNhanVe,
        IReadOnlySet<string>? HandleRanhGioi = null);

    /// <summary>
    /// Dựng bối cảnh bóc nâng cao (v6, M101 §6.3) từ vùng đã chọn: ngưỡng nhãn quy đổi theo
    /// đơn vị bản vẽ + quét nhãn text (chỉ khi rule pack có item bật <c>sizeFromNearbyText</c>).
    /// Dùng chung <c>XBOSS_BOCKL_XUAT</c> và <c>XBOSS_BATCH</c> chế độ <c>BocKL</c> (M101 §6.4) —
    /// một đường dựng bối cảnh duy nhất, hai lệnh không thể lệch nhau.
    /// </summary>
    internal static BoiCanhBoc XayBoiCanh(
        Database db, Transaction tr, CadRulePack pack, VungChonService.KetQuaChonVung chonVung)
    {
        var nguongMm = TakeoffZoning.NguongNhanLonNhatMm(pack.Takeoff);
        if (nguongMm <= 0)
            return new BoiCanhBoc(chonVung.Vung, [], 0, chonVung.HandleRanhGioi);
        var (toMm, _, _) = DrawingUnits.TuInsUnits((int)db.Insunits);
        return new BoiCanhBoc(chonVung.Vung, QuetNhan(db, tr), nguongMm / toMm, chonVung.HandleRanhGioi);
    }

    /// <summary>Quét các ObjectId đã chọn (hoặc toàn model space).</summary>
    internal static (List<MeasuredObject> DoiTuong, int XrefSkipped) Scan(
        Transaction tr, IEnumerable<ObjectId> ids, string xdataAppName, BoiCanhBoc? boiCanh = null)
    {
        var ketQua = new List<MeasuredObject>();
        var xrefSkipped = 0;
        var vung = boiCanh?.Vung ?? [];

        foreach (var id in ids)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            // Chính đường ranh giới vùng không phải khối lượng — loại trước khi khớp quy tắc.
            if (boiCanh?.HandleRanhGioi?.Contains(ent.Handle.ToString()) == true) continue;
            var daBoc = ent.GetXDataForApplication(xdataAppName) is not null;

            switch (ent)
            {
                case BlockReference br:
                {
                    var btr = (BlockTableRecord)tr.GetObject(br.DynamicBlockTableRecord, OpenMode.ForRead);
                    if (btr.IsFromExternalReference || btr.IsFromOverlayReference)
                    {
                        xrefSkipped++;
                        continue;
                    }
                    ketQua.Add(new MeasuredObject
                    {
                        Handle = br.Handle.ToString(),
                        Layer = br.Layer,
                        Kind = MeasuredKind.Block,
                        BlockName = btr.Name,
                        AlreadyMarked = daBoc,
                        Vung = vung.Count > 0 ? VungClipper.VungChuaDiem(Diem(br.Position), vung) : "",
                    });
                    break;
                }
                case Curve cv:
                {
                    double dai = 0;
                    try { dai = cv.GetDistanceAtParameter(cv.EndParam); }
                    catch (Autodesk.AutoCAD.Runtime.Exception) { continue; } // Ray/Xline vô hạn — không đo
                    double dienTich = 0;
                    if (cv.Closed)
                    {
                        try { dienTich = cv.Area; }
                        catch (Autodesk.AutoCAD.Runtime.Exception) { /* tự cắt — diện tích 0 */ }
                    }
                    var phanVung = ChiaVung(cv, vung);
                    ketQua.Add(new MeasuredObject
                    {
                        Handle = cv.Handle.ToString(),
                        Layer = cv.Layer,
                        Kind = MeasuredKind.Curve,
                        RawLength = dai,
                        RawArea = dienTich,
                        IsClosed = cv.Closed,
                        AlreadyMarked = daBoc,
                        SizeXData = SizeTuXDataVe(cv),
                        NhanGan = NhanQuanhTuyen(cv, boiCanh),
                        // Tuyến không tách được (spline/ellipse…): xếp theo vùng chứa điểm đầu.
                        Vung = phanVung.Count == 0 && vung.Count > 0
                            ? VungClipper.VungChuaDiem(Diem(cv.StartPoint), vung)
                            : "",
                        PhanVung = phanVung,
                    });
                    break;
                }
                case Hatch h:
                {
                    double dienTich = 0;
                    try { dienTich = h.Area; }
                    catch (Autodesk.AutoCAD.Runtime.Exception) { /* biên hỏng — diện tích 0 */ }
                    ketQua.Add(new MeasuredObject
                    {
                        Handle = h.Handle.ToString(),
                        Layer = h.Layer,
                        Kind = MeasuredKind.Hatch,
                        RawArea = dienTich,
                        IsClosed = true,
                        AlreadyMarked = daBoc,
                        Vung = VungCuaBao(h, vung),
                    });
                    break;
                }
                case AcadRegion rg:
                    ketQua.Add(new MeasuredObject
                    {
                        Handle = rg.Handle.ToString(),
                        Layer = rg.Layer,
                        Kind = MeasuredKind.Hatch,
                        RawArea = rg.Area,
                        IsClosed = true,
                        AlreadyMarked = daBoc,
                        Vung = VungCuaBao(rg, vung),
                    });
                    break;
            }
        }
        return (ketQua, xrefSkipped);
    }

    /// <summary>
    /// Các đối tượng ĐÃ đánh dấu bóc kèm itemId đã gán — dựng lại kết quả bóc từ XData đang sống
    /// trong DWG (M99 FR16). Dùng chung cho <c>XBOSS_BOCKL_XUAT</c> và bảng khối lượng của
    /// <c>XBOSS_VE_THONGKE</c> (M100 §6.9) — một đường đọc duy nhất, hai lệnh không thể lệch nhau.
    /// </summary>
    internal static List<(MeasuredObject DoiTuong, string ItemId)> DocDaGan(
        Database db, Transaction tr, string xdataAppName)
    {
        var (doiTuong, _) = Scan(tr, ModelSpaceIds(db, tr).ToList(), xdataAppName);
        var theoHandle = doiTuong.Where(o => o.AlreadyMarked).ToDictionary(o => o.Handle);

        var ra = new List<(MeasuredObject, string)>();
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (MarkService.ReadMark(ent, xdataAppName) is not { } mark) continue;
            if (theoHandle.TryGetValue(ent.Handle.ToString(), out var obj)) ra.Add((obj, mark.ItemId));
        }
        return ra;
    }

    /// <summary>Nhãn text (DBText/MText) trong model space kèm điểm đặt — nguồn phụ cho size.</summary>
    internal static List<(string NoiDung, Point3d Diem)> QuetNhan(Database db, Transaction tr)
    {
        var ra = new List<(string, Point3d)>();
        foreach (var id in ModelSpaceIds(db, tr))
        {
            switch (tr.GetObject(id, OpenMode.ForRead))
            {
                case DBText t when !string.IsNullOrWhiteSpace(t.TextString):
                    ra.Add((t.TextString, t.Position));
                    break;
                case MText m when !string.IsNullOrWhiteSpace(m.Contents):
                    ra.Add((m.Contents, m.Location));
                    break;
            }
        }
        return ra;
    }

    /// <summary>Size do bộ lệnh vẽ M100 ghi trên TIM tuyến (appname XBOSS_VE, chỉ ĐỌC).</summary>
    private static string? SizeTuXDataVe(Entity ent)
    {
        var tt = VeXDataStore.Doc(ent);
        return tt is { VaiTro: VaiTroVe.Tim } && tt.Size.Length > 0 ? tt.Size : null;
    }

    /// <summary>Nhãn nằm trong ngưỡng quanh tuyến, kèm khoảng cách thật tới tuyến (đơn vị bản vẽ).</summary>
    private static IReadOnlyList<NhanGan> NhanQuanhTuyen(Curve cv, BoiCanhBoc? boiCanh)
    {
        if (boiCanh is null || boiCanh.Nhan.Count == 0 || boiCanh.NguongNhanVe <= 0) return [];
        var ra = new List<NhanGan>();
        foreach (var (noiDung, diem) in boiCanh.Nhan)
        {
            double kc;
            try { kc = cv.GetClosestPointTo(diem, false).DistanceTo(diem); }
            catch (Autodesk.AutoCAD.Runtime.Exception) { continue; }
            if (kc <= boiCanh.NguongNhanVe) ra.Add(new NhanGan(noiDung, kc));
        }
        return ra;
    }

    /// <summary>Chiều dài theo từng vùng; rỗng khi không bóc theo vùng hoặc không đọc được hình học.</summary>
    private static IReadOnlyList<PhanVungDoiTuong> ChiaVung(Curve cv, IReadOnlyList<RanhGioiVung> vung)
    {
        if (vung.Count == 0) return [];
        var doan = DoanTuyenCua(cv);
        return doan is null ? [] : TakeoffZoning.ChiaTuyen(doan, vung);
    }

    /// <summary>Vùng chứa tâm hình bao của đối tượng đo diện tích (hatch/region không cắt được).</summary>
    private static string VungCuaBao(Entity ent, IReadOnlyList<RanhGioiVung> vung)
    {
        if (vung.Count == 0) return "";
        try
        {
            var bao = ent.GeometricExtents;
            var tam = new Diem2((bao.MinPoint.X + bao.MaxPoint.X) / 2, (bao.MinPoint.Y + bao.MaxPoint.Y) / 2);
            return VungClipper.VungChuaDiem(tam, vung);
        }
        catch (Autodesk.AutoCAD.Runtime.Exception)
        {
            return ""; // không lấy được hình bao — xếp ngoài vùng, không đoán
        }
    }

    /// <summary>
    /// Hình học tuyến dạng đỉnh + bulge cho Core. Chỉ nhận các kiểu đọc được CHÍNH XÁC
    /// (polyline/line/arc) — kiểu khác trả null để không "tuyến tính hóa" sai rồi tính nhầm mét.
    /// </summary>
    internal static IReadOnlyList<DoanTuyen>? DoanTuyenCua(Curve cv)
    {
        switch (cv)
        {
            case Polyline pl:
            {
                var so = pl.NumberOfVertices;
                if (so < 2) return null;
                var ra = new List<DoanTuyen>(so);
                for (var i = 0; i < so - 1; i++)
                    ra.Add(new DoanTuyen(Diem(pl.GetPoint2dAt(i)), Diem(pl.GetPoint2dAt(i + 1)), pl.GetBulgeAt(i)));
                if (pl.Closed)
                    ra.Add(new DoanTuyen(Diem(pl.GetPoint2dAt(so - 1)), Diem(pl.GetPoint2dAt(0)), pl.GetBulgeAt(so - 1)));
                return ra;
            }
            case Line ln:
                return [new DoanTuyen(Diem(ln.StartPoint), Diem(ln.EndPoint))];
            // Arc của AutoCAD luôn đi NGƯỢC chiều kim từ StartAngle → EndAngle nên bulge dương.
            case Arc arc:
                return [new DoanTuyen(Diem(arc.StartPoint), Diem(arc.EndPoint), Math.Tan(arc.TotalAngle / 4))];
            default:
                return null;
        }
    }

    private static Diem2 Diem(Point3d p) => new(p.X, p.Y);

    private static Diem2 Diem(Point2d p) => new(p.X, p.Y);

    /// <summary>Toàn bộ ObjectId trong model space.</summary>
    internal static IEnumerable<ObjectId> ModelSpaceIds(Database db, Transaction tr)
    {
        var ms = (BlockTableRecord)tr.GetObject(
            SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms) yield return id;
    }
}
