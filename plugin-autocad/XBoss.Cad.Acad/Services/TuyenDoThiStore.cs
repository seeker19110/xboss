using Autodesk.AutoCAD.DatabaseServices;
using XBoss.Cad.Core.Graph;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Nơi cất/đọc <b>đồ thị tuyến đã chốt</b> ở bước 4 của M115 §6 (<c>XBOSS_TUYEN_DOTHI</c>) — input
/// của <c>XBOSS_HOANTHIEN</c>.
///
/// Bản chốt nằm trong <b>Xrecord ở Named Objects Dictionary</b> của chính bản vẽ, đúng khuôn
/// <see cref="RevisionStore"/> dùng cho mốc revision: đóng/mở lại bản vẽ, đổi máy vẫn đọc được, và
/// bản chốt đi theo tệp DWG khi gửi cho người khác.
///
/// Mỗi bản vẽ giữ ĐÚNG MỘT bản chốt — bản mới nhất. Chạy lại <c>XBOSS_TUYEN_DOTHI</c> là dựng lại
/// đồ thị từ bản vẽ hiện tại rồi ghi đè: bản chốt không bao giờ cũ hơn thứ kỹ sư vừa duyệt.
///
/// Toàn bộ LUẬT mã hóa nằm ở Core (<see cref="DoThiChotCodec"/>) — lớp này chỉ chuyển đổi
/// danh sách chuỗi ↔ <see cref="ResultBuffer"/>, đúng ranh giới của <see cref="VeXDataStore"/>.
/// </summary>
internal static class TuyenDoThiStore
{
    /// <summary>Khóa mục trong Named Objects Dictionary giữ đồ thị đã chốt (M115 §6 bước 4).</summary>
    internal const string KhoaNOD = "XBOSS_TUYEN_DOTHI";

    /// <summary>Bản chốt gần nhất; null = bản vẽ chưa chốt đồ thị (hoặc bản ghi định dạng lạ).</summary>
    internal static DoThiChot? Doc(Database db, Transaction tr)
    {
        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForRead);
        if (!nod.Contains(KhoaNOD)) return null;
        if (tr.GetObject(nod.GetAt(KhoaNOD), OpenMode.ForRead) is not Xrecord xrec) return null;
        if (xrec.Data is not { } data) return null;

        return DoThiChotCodec.GiaiMa(data.AsArray().Select(tv => tv.Value?.ToString() ?? ""));
    }

    /// <summary>Ghi đè bản chốt (mỗi bản vẽ chỉ giữ MỘT bản — bản mới nhất).</summary>
    internal static void Ghi(Database db, Transaction tr, DoThiChot doThi)
    {
        var gt = DoThiChotCodec.MaHoa(doThi)
            .Select(dong => new TypedValue((int)DxfCode.Text, dong))
            .ToArray();

        var nod = (DBDictionary)tr.GetObject(db.NamedObjectsDictionaryId, OpenMode.ForWrite);
        var xrec = new Xrecord { Data = new ResultBuffer(gt) };
        nod.SetAt(KhoaNOD, xrec);
        tr.AddNewlyCreatedDBObject(xrec, true);
    }
}
