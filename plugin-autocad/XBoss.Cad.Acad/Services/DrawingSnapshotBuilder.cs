using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Inspection;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Dựng DrawingSnapshot thuần cho XBoss.Cad.Core từ bản vẽ thật (M99 §6.4):
/// Adapter chỉ ĐỌC dữ liệu, mọi phán xét nằm ở Core.Inspector. Chỉ quét model space
/// (paper space và nội dung xref ngoài phạm vi kiểm/chuẩn hóa — ADR-0006).
///
/// <para>MỌI thứ thuộc xref đều nằm ngoài snapshot (quy tắc dự án 2026-08-26, xem
/// <see cref="ThuocXref"/>): layer phụ thuộc xref và khối chèn xref. Báo lỗi trên chúng là báo thứ
/// kỹ sư không sửa được ở bản vẽ chủ, mà pipeline chuẩn hóa cũng bỏ qua đúng tập này — hai tầng
/// lệch phạm vi thì "xem trước chuẩn hóa" báo lỗi mãi không hết. Số lượng bỏ qua đi kèm snapshot
/// (<see cref="XrefBoQua"/>) để Inspector nói rõ phạm vi thay vì im lặng.</para>
/// </summary>
internal static class DrawingSnapshotBuilder
{
    internal static DrawingSnapshot Build(Database db, Transaction tr)
    {
        var layers = new List<LayerInfo>();
        var soLayerXref = 0;
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            if (ltr.IsDependent) { soLayerXref++; continue; }
            layers.Add(new LayerInfo
            {
                Name = ltr.Name,
                Aci = ltr.Color.ColorIndex,
                // LineWeight enum = mm × 100; giá trị âm (ByLayer/ByBlock/Default) → null.
                LineweightMm = (int)ltr.LineWeight >= 0 ? (int)ltr.LineWeight / 100.0 : null,
            });
        }

        var entities = new List<EntityInfo>();
        var soKhoiXref = 0;
        var ms = (BlockTableRecord)tr.GetObject(
            SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (ThuocXref.KhoiChen(tr, ent)) { soKhoiXref++; continue; }
            ThuThap(tr, ent, entities);
        }

        // Layer đang dùng trên TOÀN bản vẽ + block nặc danh (phép kiểm 8/9 —
        // purgePolicy.deepPurge.reportEmptyLayers/reportAnonymousBlocks). Quét mọi block
        // table record để không báo oan layer chỉ dùng ở paper space/trong block.
        var layerDangDung = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var blockNacDanh = new List<string>();
        var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
        foreach (ObjectId btrId in bt)
        {
            var btr = (BlockTableRecord)tr.GetObject(btrId, OpenMode.ForRead);
            if (btr.IsFromExternalReference || btr.IsFromOverlayReference) continue;
            if (btr.IsAnonymous && !btr.IsLayout) blockNacDanh.Add(btr.Name);
            foreach (ObjectId entId in btr)
            {
                // CỐ Ý không lọc khối chèn xref ở đây: bản thân khối chèn là đối tượng của BẢN VẼ
                // CHỦ nằm trên layer của bản vẽ chủ — bỏ nó đi thì layer đó bị báo "rỗng" và bước
                // purge xóa mất layer đang thật sự có đối tượng.
                if (tr.GetObject(entId, OpenMode.ForRead) is Entity ent) layerDangDung.Add(ent.Layer);
            }
        }

        var tags = QuetTag(db, tr);
        var revision = QuetRevision(db, tr);

        return new DrawingSnapshot
        {
            Layers = layers,
            Entities = entities,
            InsUnits = (int)db.Insunits,
            UsedLayerNames = layerDangDung,
            AnonymousBlockNames = blockNacDanh,
            Tags = tags.Count > 0 ? tags : null,
            Revision = revision.Count > 0 ? revision : null,
            XrefDaBoQua = soLayerXref + soKhoiXref > 0
                ? new XrefBoQua { SoLayer = soLayerXref, SoKhoiChen = soKhoiXref }
                : null,
        };
    }

    /// <summary>
    /// Tag của các khối do bộ lệnh vẽ M100 sinh ra — nguồn của phép kiểm 17 (M102 §6.4). CHỈ nhận
    /// khối có XData <c>XBOSS_VE</c>: khối vẽ tay không có dữ liệu hệ nên báo trùng sẽ là báo oan.
    /// Không có khối nào như vậy → danh sách rỗng, phép kiểm 17 tự tắt.
    /// </summary>
    private static List<TagInfo> QuetTag(Database db, Transaction tr)
    {
        var ra = new List<TagInfo>();
        foreach (var id in TakeoffScanner.ModelSpaceIds(db, tr))
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not BlockReference br) continue;
            if (VeXDataStore.Doc(br) is not { } xd) continue;

            // Cùng một cửa đọc thẻ TAG với XBOSS_VE_TAG (VeXDataStore.TagCua) — không viết lại vòng thứ hai.
            if (VeXDataStore.TagCua(tr, br) is not { } att) continue;
            var tag = att.TextString;
            if (string.IsNullOrWhiteSpace(tag)) continue; // khối chưa đánh tag — XBOSS_VE_TAG lo việc đó

            ra.Add(new TagInfo
            {
                Handle = br.Handle.ToString(),
                Tag = tag,
                // "Hệ" để so trùng = layer của TIM mà khối gắn vào (XData liên kết ngược); khối
                // không gắn tim nào (thiết bị đứng riêng) thì lấy chính layer của khối.
                HeLayer = LayerCuaTim(db, tr, xd.HandleTim) ?? br.Layer,
            });
        }
        return ra;
    }

    /// <summary>
    /// Cloud + tam giác revision do <c>XBOSS_VE_REV</c> sinh (M110 FR3) — nguồn của phép kiểm 19.
    /// Chỉ nhận đối tượng có XData <c>XBOSS_VE</c> vai trò <c>Revision</c>: cloud vẽ tay bằng lệnh
    /// <c>REVCLOUD</c> của AutoCAD không có dữ liệu cặp nên báo mồ côi sẽ là báo oan.
    /// </summary>
    private static List<RevisionInfo> QuetRevision(Database db, Transaction tr)
    {
        var ra = new List<RevisionInfo>();
        foreach (var r in RevisionStore.QuetRevision(db, tr))
        {
            ra.Add(new RevisionInfo
            {
                Handle = r.Handle,
                SoRevision = r.XData.SoRevision,
                LaCloud = r.LaCloud,
                HandleCapDoi = r.XData.HandleCapDoi,
            });
        }
        return ra;
    }

    /// <summary>Layer của tim theo handle lưu trong XData; null khi handle hỏng/tim đã bị xóa.</summary>
    private static string? LayerCuaTim(Database db, Transaction tr, string? handleTim)
    {
        if (string.IsNullOrWhiteSpace(handleTim)) return null;
        long so;
        try { so = Convert.ToInt64(handleTim, 16); }
        catch (Exception e) when (e is FormatException or ArgumentException or OverflowException)
        {
            return null; // XData hỏng — không đoán, chỉ bỏ qua liên kết tim
        }
        if (!db.TryGetObjectId(new Handle(so), out var id)) return null;
        return tr.GetObject(id, OpenMode.ForRead) is Entity ent ? ent.Layer : null;
    }

    private static void ThuThap(Transaction tr, Entity ent, List<EntityInfo> entities)
    {
        switch (ent)
        {
            case Polyline pl:
            {
                var ho = !pl.Closed;
                var dau = pl.GetPoint2dAt(0);
                var cuoi = pl.GetPoint2dAt(pl.NumberOfVertices - 1);
                entities.Add(new EntityInfo
                {
                    Handle = pl.Handle.ToString(),
                    Layer = pl.Layer,
                    Kind = EntityKind.Curve,
                    IsPolyline = true,
                    IsClosed = pl.Closed,
                    MaxAbsZ = Math.Abs(pl.Elevation),
                    RawLength = pl.Length,
                    EndGapDistance = ho ? dau.GetDistanceTo(cuoi) : null,
                    Start = (dau.X, dau.Y),
                    End = (cuoi.X, cuoi.Y),
                });
                break;
            }
            case Line l:
                entities.Add(new EntityInfo
                {
                    Handle = l.Handle.ToString(),
                    Layer = l.Layer,
                    Kind = EntityKind.Curve,
                    MaxAbsZ = Math.Max(Math.Abs(l.StartPoint.Z), Math.Abs(l.EndPoint.Z)),
                    RawLength = l.Length,
                    Start = (l.StartPoint.X, l.StartPoint.Y),
                    End = (l.EndPoint.X, l.EndPoint.Y),
                });
                break;
            case Curve cv: // Arc/Circle/Ellipse/Spline/Polyline2d/3d…
            {
                double dai = 0;
                try { dai = cv.GetDistanceAtParameter(cv.EndParam); }
                catch (Autodesk.AutoCAD.Runtime.Exception) { /* Ray/Xline vô hạn — bỏ qua chiều dài */ }
                entities.Add(new EntityInfo
                {
                    Handle = cv.Handle.ToString(),
                    Layer = cv.Layer,
                    Kind = EntityKind.Curve,
                    IsPolyline = cv is Polyline2d or Polyline3d,
                    IsClosed = cv.Closed,
                    MaxAbsZ = Math.Max(Math.Abs(cv.StartPoint.Z), Math.Abs(cv.EndPoint.Z)),
                    RawLength = dai,
                    EndGapDistance = cv.Closed ? null : cv.StartPoint.DistanceTo(cv.EndPoint),
                });
                break;
            }
            case Hatch h:
            {
                double dienTich = 0;
                try { dienTich = h.Area; }
                catch (Autodesk.AutoCAD.Runtime.Exception) { /* hatch hỏng biên — diện tích 0 */ }
                entities.Add(new EntityInfo
                {
                    Handle = h.Handle.ToString(),
                    Layer = h.Layer,
                    Kind = EntityKind.Hatch,
                    MaxAbsZ = Math.Abs(h.Elevation),
                });
                _ = dienTich; // diện tích chỉ dùng bên TakeoffScanner — snapshot kiểm không cần
                break;
            }
            case DBText t:
                entities.Add(new EntityInfo
                {
                    Handle = t.Handle.ToString(),
                    Layer = t.Layer,
                    Kind = EntityKind.Text,
                    MaxAbsZ = Math.Abs(t.Position.Z),
                    TextContent = t.TextString,
                    TextStyleFontName = TenFont(tr, t.TextStyleId),
                });
                break;
            case MText m:
                entities.Add(new EntityInfo
                {
                    Handle = m.Handle.ToString(),
                    Layer = m.Layer,
                    Kind = EntityKind.Text,
                    MaxAbsZ = Math.Abs(m.Location.Z),
                    TextContent = m.Contents,
                    TextStyleFontName = TenFont(tr, m.TextStyleId),
                });
                break;
            case Dimension dim:
            {
                var overrideText = dim.DimensionText;
                var coOverride = !string.IsNullOrEmpty(overrideText) && overrideText != "<>";
                entities.Add(new EntityInfo
                {
                    Handle = dim.Handle.ToString(),
                    Layer = dim.Layer,
                    Kind = EntityKind.Dimension,
                    MaxAbsZ = Math.Abs(dim.TextPosition.Z),
                    TextContent = coOverride ? overrideText : null,
                    TextStyleFontName = TenFont(tr, dim.DimensionStyle),
                    HasDimOverride = coOverride,
                });
                break;
            }
            case BlockReference br:
            {
                entities.Add(new EntityInfo
                {
                    Handle = br.Handle.ToString(),
                    Layer = br.Layer,
                    Kind = EntityKind.BlockRef,
                    MaxAbsZ = Math.Abs(br.Position.Z),
                });
                // Thuộc tính block cũng là text cần kiểm font (FR3).
                foreach (ObjectId attId in br.AttributeCollection)
                {
                    if (tr.GetObject(attId, OpenMode.ForRead) is not AttributeReference ar) continue;
                    entities.Add(new EntityInfo
                    {
                        Handle = ar.Handle.ToString(),
                        Layer = ar.Layer,
                        Kind = EntityKind.Text,
                        MaxAbsZ = Math.Abs(ar.Position.Z),
                        TextContent = ar.TextString,
                        TextStyleFontName = TenFont(tr, ar.TextStyleId),
                    });
                }
                break;
            }
            default:
                entities.Add(new EntityInfo
                {
                    Handle = ent.Handle.ToString(),
                    Layer = ent.Layer,
                    Kind = EntityKind.Other,
                });
                break;
        }
    }

    private static string? TenFont(Transaction tr, ObjectId styleId)
    {
        if (styleId.IsNull) return null;
        return tr.GetObject(styleId, OpenMode.ForRead) switch
        {
            TextStyleTableRecord ts => string.IsNullOrEmpty(ts.Font.TypeFace) ? ts.FileName : ts.Font.TypeFace,
            DimStyleTableRecord ds => TenFont(tr, ds.Dimtxsty),
            _ => null,
        };
    }
}
