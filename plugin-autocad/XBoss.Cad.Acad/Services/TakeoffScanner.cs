using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Takeoff;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Drawing` (System.Drawing.Region
// trùng tên với thực thể Region của AutoCAD) — xem MarkService.cs.
using AcadRegion = Autodesk.AutoCAD.DatabaseServices.Region;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Quét đối tượng cho XBOSS_BOCKL (M99 §6.5): đo hình học bằng chính API AutoCAD
/// (nguồn sự thật là bản vẽ), Core chỉ nhận số đo thô. Bỏ qua block xref (đếm để báo),
/// đọc XData để đánh dấu AlreadyMarked (chống bóc trùng — FR14).
/// </summary>
internal static class TakeoffScanner
{
    /// <summary>Quét các ObjectId đã chọn (hoặc toàn model space).</summary>
    internal static (List<MeasuredObject> DoiTuong, int XrefSkipped) Scan(
        Transaction tr, IEnumerable<ObjectId> ids, string xdataAppName)
    {
        var ketQua = new List<MeasuredObject>();
        var xrefSkipped = 0;

        foreach (var id in ids)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
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
                    ketQua.Add(new MeasuredObject
                    {
                        Handle = cv.Handle.ToString(),
                        Layer = cv.Layer,
                        Kind = MeasuredKind.Curve,
                        RawLength = dai,
                        RawArea = dienTich,
                        IsClosed = cv.Closed,
                        AlreadyMarked = daBoc,
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
                    });
                    break;
            }
        }
        return (ketQua, xrefSkipped);
    }

    /// <summary>Toàn bộ ObjectId trong model space.</summary>
    internal static IEnumerable<ObjectId> ModelSpaceIds(Database db, Transaction tr)
    {
        var ms = (BlockTableRecord)tr.GetObject(
            SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms) yield return id;
    }
}
