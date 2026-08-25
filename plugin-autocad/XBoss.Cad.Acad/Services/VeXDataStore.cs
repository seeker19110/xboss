using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Đọc/ghi XData appname <c>XBOSS_VE</c> trên đối tượng do bộ lệnh vẽ sinh ra (M100 §11).
/// Toàn bộ luật về nội dung nằm ở Core (<see cref="VeXData"/>) — lớp này chỉ chuyển đổi
/// danh sách chuỗi ↔ <see cref="ResultBuffer"/>, đúng cách M99 làm với appname XBOSS_BOCKL.
/// KHÔNG bao giờ đụng XData của appname khác (mỗi appname là một ngăn riêng trong AutoCAD).
/// </summary>
internal static class VeXDataStore
{
    /// <summary>Đăng ký appname (bắt buộc trước lần ghi XData đầu tiên).</summary>
    internal static void DangKyApp(Database db, Transaction tr) =>
        MarkService.EnsureRegApp(db, tr, VeXData.AppName);

    /// <summary>
    /// Ghi XData của bộ lệnh vẽ. Đối tượng phải mở ForWrite.
    /// Nhận <see cref="DBObject"/> (không chỉ <see cref="Entity"/>) vì M100 PR4 còn đánh dấu cả
    /// ĐỊNH NGHĨA block (<see cref="BlockTableRecord"/>) bằng version thư viện — §6.10/AC7.
    /// </summary>
    internal static void Ghi(DBObject ent, VeXDataInfo tt)
    {
        var gt = new List<TypedValue>
        {
            new((int)DxfCode.ExtendedDataRegAppName, VeXData.AppName),
        };
        foreach (var dong in VeXData.MaHoa(tt))
            gt.Add(new TypedValue((int)DxfCode.ExtendedDataAsciiString, dong));
        ent.XData = new ResultBuffer(gt.ToArray());
    }

    /// <summary>Đọc XData của bộ lệnh vẽ; null khi đối tượng không do bộ lệnh vẽ sinh ra.</summary>
    internal static VeXDataInfo? Doc(DBObject ent)
    {
        using var xdata = ent.GetXDataForApplication(VeXData.AppName);
        if (xdata is null) return null;
        var chuoi = xdata.AsArray()
            .Where(tv => tv.TypeCode == (int)DxfCode.ExtendedDataAsciiString)
            .Select(tv => tv.Value?.ToString() ?? "")
            .ToList();
        return VeXData.GiaiMa(chuoi);
    }
}
