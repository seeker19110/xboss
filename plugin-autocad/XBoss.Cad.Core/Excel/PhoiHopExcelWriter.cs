using ClosedXML.Excel;
using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Ui.ViewModels;

namespace XBoss.Cad.Core.Excel;

/// <summary>Thông tin đầu trang của báo cáo phối hợp (M116 PR3 §6 bước 5 / AC5).</summary>
public sealed record PhoiHopExcelMeta
{
    public required string TenBanVe { get; init; }
    public required string RulePackVersion { get; init; }
    public required string NguoiLap { get; init; }
    /// <summary>Ngày lập dạng ISO yyyy-MM-dd (caller đóng dấu — Core không tự lấy giờ hệ thống).</summary>
    public required string NgayIso { get; init; }
}

/// <summary>
/// Bảng xung đột phối hợp ra Excel (M116 §6 bước 5 / §9 / AC5) — tệp RỜI cạnh DWG, KHÔNG dùng chung
/// mẫu với <see cref="BoqExcelWriter"/> (mẫu BOQ là hợp đồng layout dashboard công ty, trộn hai
/// thứ vào một mẫu là làm vỡ mẫu BOQ, đúng lý do <see cref="LoChoExcelWriter"/> cũng tách riêng).
///
/// Cột ĐÚNG những gì brief M116 PR3 yêu cầu: STT / lớp kiểm / hệ A / hệ B / vị trí / mức / đề xuất
/// xử lý / trạng thái. Nhãn lớp kiểm và mức dùng lại <see cref="DongXungDot.NhanLop"/>/
/// <see cref="DongXungDot.NhanMuc"/> — cùng chữ với hộp thoại <c>XBOSS_PHOIHOP</c>, không dịch lần
/// hai theo kiểu khác. Trạng thái ghi MÃ (<c>chua_xu_ly</c>/<c>chap_nhan</c>/<c>bo_qua</c>) đúng
/// khóa XData marker (<see cref="MaTrangThaiXungDot"/>) để đối chiếu máy-đọc-được với sidecar JSON,
/// kèm lý do khi bỏ qua.
/// </summary>
public static class PhoiHopExcelWriter
{
    public const string TenSheet = "Phoi-hop";

    private const int HangHeader = 5;

    private static readonly string[] Header =
    [
        "STT", "LỚP KIỂM", "HỆ A", "HỆ B", "VỊ TRÍ", "MỨC", "ĐỀ XUẤT XỬ LÝ", "TRẠNG THÁI",
    ];

    private static readonly double[] BeRongCot = [6, 22, 14, 14, 20, 12, 60, 30];

    public static void Write(IReadOnlyList<DongXungDot> dong, PhoiHopExcelMeta meta, Stream output)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet(TenSheet);

        // ----- Đầu trang -----
        ws.Cell("B1").Value = $"BẢN VẼ: {meta.TenBanVe}";
        ws.Cell("B2").Value = "BÁO CÁO PHỐI HỢP XUNG ĐỘT 2D LIÊN HỆ (XBOSS_PHOIHOP_BAOCAO)";
        ws.Cell("B3").Value =
            $"Lập bằng XBoss plugin — rule pack {meta.RulePackVersion} — {meta.NgayIso} — {meta.NguoiLap}. " +
            "Plugin KHÔNG tự sửa tuyến — đây là danh sách đề xuất, kỹ sư quyết.";
        ws.Range("B1:B2").Style.Font.SetBold();
        ws.Cell("B3").Style.Font.SetItalic().Font.SetFontColor(XLColor.FromHtml("#71717A"));

        // ----- Header -----
        for (var i = 0; i < Header.Length; i++)
        {
            var cell = ws.Cell(HangHeader, i + 1);
            cell.Value = Header[i];
            cell.Style
                .Font.SetBold()
                .Alignment.SetWrapText(true)
                .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                .Alignment.SetVertical(XLAlignmentVerticalValues.Center)
                .Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            ws.Column(i + 1).Width = BeRongCot[i];
        }
        ws.Row(HangHeader).Height = 20;

        // ----- Dữ liệu -----
        var hang = HangHeader + 1;
        var stt = 0;
        foreach (var d in dong.OrderBy(d => d.XungDot.Lop).ThenBy(d => d.Id, StringComparer.Ordinal))
        {
            stt++;
            var xd = d.XungDot;
            ws.Cell(hang, 1).Value = stt;
            ws.Cell(hang, 2).Value = DongXungDot.NhanLop(xd.Lop);
            ws.Cell(hang, 3).Value = xd.HeLienQuan.Count > 0 ? xd.HeLienQuan[0] : "";
            ws.Cell(hang, 4).Value = xd.HeLienQuan.Count > 1
                ? string.Join(", ", xd.HeLienQuan.Skip(1))
                : "";
            ws.Cell(hang, 5).Value = ViTri(xd);
            ws.Cell(hang, 6).Value = DongXungDot.NhanMuc(xd.Muc);
            ws.Cell(hang, 7).Value = xd.DeXuat.Count == 0
                ? "Rule pack không khai luật nào cho ca này — kỹ sư quyết."
                : string.Join("\n", xd.DeXuat.Select(x => x.MoTa));
            ws.Cell(hang, 8).Value = TrangThai(d);
            ws.Cell(hang, 7).Style.Alignment.SetWrapText(true);
            ws.Cell(hang, 8).Style.Alignment.SetWrapText(true);
            hang++;
        }

        var hangCuoi = hang - 1;
        if (hangCuoi > HangHeader)
        {
            var bang = ws.Range(HangHeader, 1, hangCuoi, Header.Length);
            bang.Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
            bang.Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium);
        }
        else
        {
            ws.Cell(hang, 1).Value = "Không phát hiện xung đột nào trong bản vẽ.";
        }
        ws.SheetView.FreezeRows(HangHeader);

        wb.SaveAs(output);
    }

    private static string ViTri(XungDot xd)
    {
        var toa = $"({So(xd.ViTri.X)}, {So(xd.ViTri.Y)})";
        return xd.HanhLangId.Length > 0 ? $"Hành lang \"{xd.HanhLangId}\" · {toa}" : toa;
    }

    /// <summary>Mã trạng thái đúng khóa XData marker (<see cref="MaTrangThaiXungDot"/>) — kèm lý do khi bỏ qua.</summary>
    private static string TrangThai(DongXungDot d)
    {
        var ma = MaTrangThaiXungDot.Ma(d.TrangThai);
        return d.TrangThai == TrangThaiXungDot.BoQua && d.LyDo.Length > 0 ? $"{ma} ({d.LyDo})" : ma;
    }

    private static string So(double v) =>
        v.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture);
}
