using System.Globalization;
using ClosedXML.Excel;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Excel;

/// <summary>Thông tin đầu trang của bảng lỗ chờ (M100 §6.8).</summary>
public sealed record LoChoExcelMeta
{
    public required string TenDuAn { get; init; }
    public required string TenBanVe { get; init; }
    public required string RulePackVersion { get; init; }
    public required string NguoiLap { get; init; }
    /// <summary>Ngày lập dạng ISO yyyy-MM-dd (caller đóng dấu — Core không tự lấy giờ hệ thống).</summary>
    public required string NgayIso { get; init; }
}

/// <summary>
/// Bảng lỗ chờ (builder's work) ra Excel — M100 §6.8/FR9d: bảng ĐƠN GIẢN gửi bên kết cấu/xây dựng
/// (STT, hệ, vị trí theo trục gần nhất, cao độ nhập tay, size ống, size lỗ chờ, kết cấu).
///
/// KHÔNG dùng chung tệp/mẫu với <see cref="BoqExcelWriter"/>: mẫu BOQ là hợp đồng layout với
/// dashboard công ty (M99 §13.2), bảng lỗ chờ là tệp rời gửi đơn vị khác — trộn hai thứ vào một
/// mẫu là đường chắc chắn làm vỡ mẫu BOQ. Cột lấy từ <see cref="SleeveSchedule.TieuDe"/> để Table
/// trong bản vẽ và tệp Excel không bao giờ lệch nhau.
/// </summary>
public static class LoChoExcelWriter
{
    /// <summary>Tên sheet — đặt cố định để bên kết cấu tham chiếu được.</summary>
    public const string TenSheet = "Bang-lo-cho";

    private const int HangHeader = 6;

    private static readonly double[] BeRongCot = [6, 14, 22, 14, 14, 14, 12, 12];

    public static void Write(IReadOnlyList<DongLoCho> dong, LoChoExcelMeta meta, Stream output)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet(TenSheet);

        var soCot = SleeveSchedule.TieuDe.Count;

        // ----- Đầu trang -----
        ws.Cell("B1").Value = $"DỰ ÁN: {meta.TenDuAn}";
        ws.Cell("B2").Value = $"BẢN VẼ: {meta.TenBanVe}";
        ws.Cell("B3").Value = "BẢNG LỖ CHỜ / SLEEVE (BUILDER'S WORK) — gửi bên kết cấu & xây dựng";
        ws.Cell("B4").Value =
            $"Lập bằng XBoss plugin — rule pack {meta.RulePackVersion} — {meta.NgayIso} — {meta.NguoiLap}. " +
            "Cao độ là giá trị NHẬP TAY, kiểm tra lại tại hiện trường.";
        ws.Range("B1:B3").Style.Font.SetBold();
        ws.Cell("B4").Style.Font.SetItalic().Font.SetFontColor(XLColor.FromHtml("#71717A"));

        // ----- Header -----
        for (var i = 0; i < soCot; i++)
        {
            var cell = ws.Cell(HangHeader, i + 1);
            cell.Value = SleeveSchedule.TieuDe[i];
            cell.Style
                .Font.SetBold()
                .Alignment.SetWrapText(true)
                .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                .Alignment.SetVertical(XLAlignmentVerticalValues.Center)
                .Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            ws.Column(i + 1).Width = BeRongCot[i];
        }

        // ----- Dữ liệu -----
        var hang = HangHeader + 1;
        foreach (var d in dong)
        {
            var o = SleeveSchedule.O(d);
            for (var i = 0; i < soCot; i++)
            {
                var cell = ws.Cell(hang, i + 1);
                // STT/cao độ ghi dạng SỐ để bên kết cấu lọc/sắp xếp được; còn lại là chữ.
                if (i is 0 or 3 && o[i].Length > 0 &&
                    double.TryParse(o[i], NumberStyles.Float, CultureInfo.InvariantCulture, out var so))
                {
                    cell.Value = so;
                }
                else
                {
                    cell.Value = o[i];
                }
            }
            hang++;
        }

        var hangCuoi = hang - 1;
        if (hangCuoi >= HangHeader)
        {
            var bang = ws.Range(HangHeader, 1, hangCuoi, soCot);
            bang.Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
            bang.Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium);
        }
        ws.SheetView.FreezeRows(HangHeader);

        wb.SaveAs(output);
    }
}
