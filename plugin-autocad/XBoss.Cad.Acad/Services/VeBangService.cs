using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.Geometry;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Bảng (đối tượng <c>Table</c> của AutoCAD) do bộ lệnh vẽ sinh ra — dùng chung cho bảng lỗ chờ
/// (<c>XBOSS_VE_LOCHO</c> §6.8) và bảng thống kê (<c>XBOSS_VE_THONGKE</c> §6.9).
///
/// Nội dung bảng do Core dựng (<see cref="SleeveSchedule"/>/<see cref="ThongKeTable"/>); lớp này
/// chỉ đổ chuỗi vào đối tượng Table và đánh dấu XData để lần chạy sau CẬP NHẬT ĐÚNG BẢNG CŨ tại
/// chỗ, không sinh bảng đôi (FR9f).
/// </summary>
internal static class VeBangService
{
    /// <summary>Mã loại bảng lỗ chờ trong XData (bảng thống kê dùng mã của <see cref="ThongKeTable"/>).</summary>
    internal const string MaBangLoCho = "locho";

    /// <summary>Bề rộng cột = số ký tự dài nhất × hệ số này × chiều cao chữ (đủ thoáng, không tràn).</summary>
    private const double HeSoBeRongCot = 0.85;

    /// <summary>Bề rộng cột tối thiểu tính theo chiều cao chữ.</summary>
    private const double BeRongCotToiThieu = 4.0;

    /// <summary>
    /// Tạo bảng mới tại <paramref name="viTri"/> (góc trên-trái), đổ nội dung và ghi XData đánh dấu.
    /// </summary>
    internal static Table Tao(
        Database db,
        Transaction tr,
        BlockTableRecord noiChua,
        Point3d viTri,
        string layer,
        string tieuDe,
        IReadOnlyList<string> cot,
        IReadOnlyList<IReadOnlyList<string>> dong,
        double caoChu,
        VeXDataInfo xdata)
    {
        var bang = new Table { TableStyle = db.Tablestyle, Position = viTri };
        VeThucThe.Them(tr, noiChua, bang, layer);
        DoNoiDung(bang, tieuDe, cot, dong, caoChu);
        VeXDataStore.Ghi(bang, xdata);
        return bang;
    }

    /// <summary>
    /// Đổ lại toàn bộ nội dung vào một bảng (mới hoặc bảng cũ do plugin sinh). Bảng phải mở ForWrite.
    /// Hàng 0 = tiêu đề, hàng 1 = tên cột, từ hàng 2 = dữ liệu.
    /// </summary>
    internal static void DoNoiDung(
        Table bang,
        string tieuDe,
        IReadOnlyList<string> cot,
        IReadOnlyList<IReadOnlyList<string>> dong,
        double caoChu)
    {
        var soCot = Math.Max(1, cot.Count);
        var soHang = dong.Count + 2;
        bang.SetSize(soHang, soCot);
        bang.SetRowHeight(caoChu * 2);
        bang.SetColumnWidth(caoChu * 10);

        bang.Cells[0, 0].TextString = tieuDe;
        bang.Cells[0, 0].TextHeight = caoChu * 1.25;

        for (var c = 0; c < soCot; c++)
        {
            bang.Cells[1, c].TextString = c < cot.Count ? cot[c] : "";
            bang.Cells[1, c].TextHeight = caoChu;
        }

        for (var r = 0; r < dong.Count; r++)
        {
            for (var c = 0; c < soCot; c++)
            {
                bang.Cells[r + 2, c].TextString = c < dong[r].Count ? dong[r][c] : "";
                bang.Cells[r + 2, c].TextHeight = caoChu;
            }
        }

        // Bề rộng từng cột theo nội dung dài nhất của chính cột đó.
        for (var c = 0; c < soCot; c++)
        {
            var dai = c < cot.Count ? cot[c].Length : 0;
            foreach (var d in dong) dai = Math.Max(dai, c < d.Count ? d[c].Length : 0);
            bang.Columns[c].Width = Math.Max(dai * HeSoBeRongCot, BeRongCotToiThieu) * caoChu;
        }

        bang.GenerateLayout();
    }

    /// <summary>
    /// Bảng cũ CÙNG LOẠI do plugin sinh trong model space (theo XData <c>XBOSS_VE</c>); null khi
    /// chưa có. Trả ObjectId để lệnh gọi tự mở ForWrite trong transaction của nó.
    /// </summary>
    internal static ObjectId? TimBangCu(Database db, Transaction tr, string maLoaiBang)
    {
        var ms = (BlockTableRecord)tr.GetObject(SymbolUtilityServices.GetBlockModelSpaceId(db), OpenMode.ForRead);
        foreach (ObjectId id in ms)
        {
            if (tr.GetObject(id, OpenMode.ForRead) is not Table bang) continue;
            var xd = VeXDataStore.Doc(bang);
            if (xd is null || xd.VaiTro != VaiTroVe.BangThongKe) continue;
            if (string.Equals(xd.LoaiBang, maLoaiBang, StringComparison.Ordinal)) return bang.ObjectId;
        }
        return null;
    }
}
