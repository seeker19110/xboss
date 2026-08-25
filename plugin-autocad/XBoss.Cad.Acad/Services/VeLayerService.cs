using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;

// Bí danh vì `UseWindowsForms` kéo theo implicit using `System.Drawing` (xem MarkService.cs).
using AcadColor = Autodesk.AutoCAD.Colors.Color;
using AcadTransparency = Autodesk.AutoCAD.Colors.Transparency;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Layer cho bộ lệnh vẽ (M100 FR9): tạo layer đích đúng màu/lineweight, và khóa + làm mờ layer
/// nền của <c>XBOSS_VE_NEN</c> — có hoàn nguyên.
///
/// Trạng thái trước khi làm nền được cất trong **Xrecord ở Named Objects Dictionary** của chính
/// bản vẽ (không phải biến RAM): đóng bản vẽ mở lại vẫn hoàn nguyên đúng, và mỗi bản vẽ một
/// trạng thái riêng. KHÔNG đụng đối tượng nền — chỉ thuộc tính khóa/độ mờ của bảng layer.
/// </summary>
internal static class VeLayerService
{
    /// <summary>Khóa mục trong Named Objects Dictionary giữ trạng thái layer trước khi làm nền.</summary>
    internal const string KhoaNOD = "XBOSS_VE_NEN";

    /// <summary>Phiên bản định dạng bản ghi trạng thái (đọc trước, khác thì từ chối hoàn nguyên mù).</summary>
    private const string PhienBanTrangThai = "1";

    internal sealed record LayerCu(string Ten, bool Khoa, byte Alpha);

    internal sealed record TrangThaiNen(string HeId, string ClayerCu, IReadOnlyList<LayerCu> Layer);

    // ===== Trạng thái nền trong NOD =====

    internal static TrangThaiNen? DocTrangThai(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
        if (!nod.Contains(KhoaNOD)) return null;
        if (tr.GetObject(nod.GetAt(KhoaNOD), OpenMode.ForRead) is not Xrecord xrec) return null;
        var data = xrec.Data;
        if (data is null) return null;

        var gt = data.AsArray().Select(tv => tv.Value?.ToString() ?? "").ToList();
        if (gt.Count < 3 || gt[0] != PhienBanTrangThai) return null;

        var layer = new List<LayerCu>();
        for (var i = 3; i + 2 < gt.Count; i += 3)
        {
            // Đọc hỏng thì coi như layer vốn KHÔNG mờ (255) — thà bỏ sót độ mờ còn hơn
            // hoàn nguyên thành trong suốt hoàn toàn.
            var alpha = byte.TryParse(gt[i + 2], out var a) ? a : (byte)255;
            layer.Add(new LayerCu(gt[i], gt[i + 1] == "1", alpha));
        }
        return new TrangThaiNen(gt[1], gt[2], layer);
    }

    internal static void GhiTrangThai(Database db, Transaction tr, TrangThaiNen tt)
    {
        var gt = new List<TypedValue>
        {
            new((int)DxfCode.Text, PhienBanTrangThai),
            new((int)DxfCode.Text, tt.HeId),
            new((int)DxfCode.Text, tt.ClayerCu),
        };
        foreach (var l in tt.Layer)
        {
            gt.Add(new TypedValue((int)DxfCode.Text, l.Ten));
            gt.Add(new TypedValue((int)DxfCode.Text, l.Khoa ? "1" : "0"));
            gt.Add(new TypedValue((int)DxfCode.Text, l.Alpha.ToString()));
        }

        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        var xrec = new Xrecord { Data = new ResultBuffer(gt.ToArray()) };
        nod.SetAt(KhoaNOD, xrec);
        tr.AddNewlyCreatedDBObject(xrec, true);
    }

    internal static void XoaTrangThai(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        if (nod.Contains(KhoaNOD)) nod.Remove(KhoaNOD);
    }

    // ===== Khóa + làm mờ nền =====

    /// <summary>
    /// Khóa và làm mờ MỌI layer hiện có; trả trạng thái cũ để cất vào NOD. Layer đích của hệ
    /// được mở khóa lại ngay sau đó bằng <see cref="DamBaoLayer"/> — vẫn nằm trong bản ghi trạng
    /// thái nên hoàn nguyên trả đúng khóa/độ mờ ban đầu của chúng.
    /// </summary>
    internal static List<LayerCu> KhoaVaLamMo(Database db, Transaction tr, int doMoPhanTram)
    {
        var alpha = (byte)Math.Clamp(Math.Round(255.0 * (100 - doMoPhanTram) / 100.0), 0, 255);
        var cu = new List<LayerCu>();
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (ObjectId id in lt)
        {
            var ltr = (LayerTableRecord)tr.GetObject(id, OpenMode.ForRead);
            cu.Add(new LayerCu(ltr.Name, ltr.IsLocked, ltr.Transparency.Alpha));
            ltr.UpgradeOpen();
            ltr.IsLocked = true;
            ltr.Transparency = new AcadTransparency(alpha);
        }
        return cu;
    }

    /// <summary>Trả layer về đúng trạng thái khóa/độ mờ đã lưu (layer đã bị xóa thì bỏ qua).</summary>
    internal static int HoanNguyen(Database db, Transaction tr, TrangThaiNen tt)
    {
        var soTra = 0;
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        foreach (var l in tt.Layer)
        {
            if (!lt.Has(l.Ten)) continue;
            var ltr = (LayerTableRecord)tr.GetObject(lt[l.Ten], OpenMode.ForWrite);
            ltr.IsLocked = l.Khoa;
            ltr.Transparency = new AcadTransparency(l.Alpha);
            soTra++;
        }
        // Trả layer hiện hành; layer đóng băng KHÔNG được đặt làm hiện hành (AutoCAD từ chối).
        if (lt.Has(tt.ClayerCu) &&
            tr.GetObject(lt[tt.ClayerCu], OpenMode.ForRead) is LayerTableRecord cu && !cu.IsFrozen)
        {
            db.Clayer = cu.ObjectId;
        }
        return soTra;
    }

    // ===== Layer đích =====

    /// <summary>
    /// Bảo đảm layer tồn tại, mở khóa, không bị mờ, đang bật và không đóng băng — trả ObjectId.
    /// Layer mới: đặt màu ACI + lineweight theo bảng CTB của rule pack. Layer đã có: KHÔNG đổi
    /// màu/lineweight (không đụng quy ước sẵn có của bản vẽ), chỉ mở khóa để vẽ được.
    /// </summary>
    internal static ObjectId DamBaoLayer(
        Database db, Transaction tr, string ten, int aci, LineweightMapSection bangNet, out bool vuaTao)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (lt.Has(ten))
        {
            vuaTao = false;
            var co = (LayerTableRecord)tr.GetObject(lt[ten], OpenMode.ForWrite);
            if (co.IsLocked) co.IsLocked = false;
            if (co.IsOff) co.IsOff = false;
            // Bỏ đóng băng để nét vẽ ra nhìn thấy được (AutoCAD chỉ cấm ĐÓNG BĂNG layer hiện
            // hành, không cấm bỏ đóng băng).
            if (co.IsFrozen) co.IsFrozen = false;
            if (co.Transparency.Alpha != 255) co.Transparency = new AcadTransparency(255);
            return co.ObjectId;
        }

        vuaTao = true;
        var moi = new LayerTableRecord
        {
            Name = ten,
            Color = AcadColor.FromColorIndex(ColorMethod.ByAci, (short)aci),
        };
        if (VeLayerStyle.LineweightMm(bangNet, aci) is { } mm)
            moi.LineWeight = (LineWeight)(int)Math.Round(mm * 100); // như bước 7 của XBOSS_CHUANHOA
        lt.UpgradeOpen();
        var id = lt.Add(moi);
        tr.AddNewlyCreatedDBObject(moi, true);
        return id;
    }

    /// <summary>
    /// Mở khóa + bật + bỏ đóng băng một layer ĐANG CÓ, để sửa được đối tượng nằm trên nó
    /// (<c>XBOSS_VE_DOI</c> phải sửa tim/nét biên/nhãn trên layer NGUỒN, mà sau <c>XBOSS_VE_NEN</c>
    /// thì mọi layer đều đang khóa). Khác <see cref="DamBaoLayer"/> ở chỗ KHÔNG tạo layer mới:
    /// tuyến không có nét biên thì không được đẻ ra layer <c>…EDGE</c> rỗng; và KHÔNG đụng độ mờ —
    /// làm mờ là trạng thái nền do <c>XBOSS_VE_NEN</c> quản, không phải việc của lệnh đổi tuyến.
    /// </summary>
    internal static void MoKhoaNeuCo(Database db, Transaction tr, string ten)
    {
        var lt = (LayerTable)tr.GetObject(db.LayerTableId, OpenMode.ForRead);
        if (!lt.Has(ten)) return;
        var ltr = (LayerTableRecord)tr.GetObject(lt[ten], OpenMode.ForWrite);
        if (ltr.IsLocked) ltr.IsLocked = false;
        if (ltr.IsOff) ltr.IsOff = false;
        if (ltr.IsFrozen) ltr.IsFrozen = false;
    }

    /// <summary>Layer đã có đối tượng trong model space chưa (M100 §18: cảnh báo layer đích có nội dung cũ).</summary>
    internal static bool CoThucThe(Database db, Transaction tr, string tenLayer)
    {
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Entity ent) continue;
            if (string.Equals(ent.Layer, tenLayer, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }
}
