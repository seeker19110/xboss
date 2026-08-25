using Autodesk.AutoCAD.Colors;
using Autodesk.AutoCAD.DatabaseServices;

// `UseWindowsForms` (cần cho hộp thoại chọn tệp của Autodesk.AutoCAD.Windows) kéo theo implicit
// using `System.Drawing`, làm tên `Color` nhập nhằng với `Autodesk.AutoCAD.Colors.Color`.
// Đặt bí danh rõ ràng thay vì tắt implicit using — chỉ tệp này dùng tới kiểu màu của AutoCAD.
using AcadColor = Autodesk.AutoCAD.Colors.Color;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Đánh dấu vùng đã bóc (M99 FR14/FR16): tô màu markColorAci + ghi XData
/// [itemId, rulePackVersion, ngày ISO, màu-trước-khi-bóc]. Trạng thái sống trong DWG.
/// XBOSS_BOCKL_XOA trả lại ĐÚNG màu cũ (kể cả color override riêng) nhờ chuỗi mã màu lưu kèm.
/// </summary>
internal static class MarkService
{
    internal static void EnsureRegApp(Database db, Transaction tr, string appName)
    {
        var rat = (RegAppTable)tr.GetObject(db.RegAppTableId, OpenMode.ForRead);
        if (rat.Has(appName)) return;
        rat.UpgradeOpen();
        var ratr = new RegAppTableRecord { Name = appName };
        rat.Add(ratr);
        tr.AddNewlyCreatedDBObject(ratr, true);
    }

    /// <summary>
    /// Đánh dấu 1 thực thể. Thực thể phải mở ForWrite. Chuỗi thứ 5 (tên vùng, M101 §6.3) là
    /// PHẦN THÊM: bản vẽ đánh dấu bằng plugin cũ chỉ có 4 chuỗi vẫn đọc được bình thường.
    /// </summary>
    internal static void Mark(
        Entity ent, string appName, string itemId, string rulePackVersion, string ngayIso, int aci, string vung = "")
    {
        var mauCu = EncodeColor(ent.Color);
        ent.XData = new ResultBuffer(
            new TypedValue((int)DxfCode.ExtendedDataRegAppName, appName),
            new TypedValue((int)DxfCode.ExtendedDataAsciiString, itemId),
            new TypedValue((int)DxfCode.ExtendedDataAsciiString, rulePackVersion),
            new TypedValue((int)DxfCode.ExtendedDataAsciiString, ngayIso),
            new TypedValue((int)DxfCode.ExtendedDataAsciiString, mauCu),
            new TypedValue((int)DxfCode.ExtendedDataAsciiString, vung));
        ent.Color = AcadColor.FromColorIndex(ColorMethod.ByAci, (short)aci);
    }

    /// <summary>Đọc đánh dấu; null nếu thực thể chưa bóc. Vùng rỗng với bản vẽ bóc trước M101.</summary>
    internal static (string ItemId, string Version, string NgayIso, string MauCu, string Vung)? ReadMark(
        Entity ent, string appName)
    {
        using var xdata = ent.GetXDataForApplication(appName);
        if (xdata is null) return null;
        var chuoi = xdata.AsArray()
            .Where(tv => tv.TypeCode == (int)DxfCode.ExtendedDataAsciiString)
            .Select(tv => tv.Value?.ToString() ?? "")
            .ToArray();
        if (chuoi.Length < 4) return null;
        return (chuoi[0], chuoi[1], chuoi[2], chuoi[3], chuoi.Length > 4 ? chuoi[4] : "");
    }

    /// <summary>Gỡ đánh dấu: trả đúng màu cũ + xoá XData của app. Thực thể phải mở ForWrite.</summary>
    internal static bool Unmark(Entity ent, string appName)
    {
        var mark = ReadMark(ent, appName);
        if (mark is null) return false;
        ent.Color = DecodeColor(mark.Value.MauCu);
        // ResultBuffer chỉ còn tên app = xoá toàn bộ XData của app đó (quy ước AutoCAD).
        ent.XData = new ResultBuffer(new TypedValue((int)DxfCode.ExtendedDataRegAppName, appName));
        return true;
    }

    /// <summary>Mã hóa màu hiện tại thành chuỗi ổn định để lưu trong XData.</summary>
    internal static string EncodeColor(AcadColor mau)
    {
        if (mau.IsByLayer) return "bylayer";
        if (mau.IsByBlock) return "byblock";
        if (mau.ColorMethod == ColorMethod.ByAci) return $"aci:{mau.ColorIndex}";
        return $"rgb:{mau.ColorValue.R},{mau.ColorValue.G},{mau.ColorValue.B}";
    }

    internal static AcadColor DecodeColor(string maMau)
    {
        if (maMau == "bylayer") return AcadColor.FromColorIndex(ColorMethod.ByLayer, 256);
        if (maMau == "byblock") return AcadColor.FromColorIndex(ColorMethod.ByBlock, 0);
        if (maMau.StartsWith("aci:", StringComparison.Ordinal) &&
            short.TryParse(maMau.AsSpan(4), out var aci))
        {
            return AcadColor.FromColorIndex(ColorMethod.ByAci, aci);
        }
        if (maMau.StartsWith("rgb:", StringComparison.Ordinal))
        {
            var phan = maMau[4..].Split(',');
            if (phan.Length == 3 && byte.TryParse(phan[0], out var r) &&
                byte.TryParse(phan[1], out var g) && byte.TryParse(phan[2], out var b))
            {
                return AcadColor.FromRgb(r, g, b);
            }
        }
        // Chuỗi lạ (XData bị sửa tay) — an toàn nhất là ByLayer.
        return AcadColor.FromColorIndex(ColorMethod.ByLayer, 256);
    }
}
