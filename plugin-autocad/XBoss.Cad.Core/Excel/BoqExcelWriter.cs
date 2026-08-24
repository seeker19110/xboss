using ClosedXML.Excel;
using XBoss.Cad.Core.Takeoff;

namespace XBoss.Cad.Core.Excel;

/// <summary>Thông tin đầu trang của tệp Excel bóc tách (M99 §13.2).</summary>
public sealed record BoqExcelMeta
{
    public required string TenDuAn { get; init; }
    public required string GoiThau { get; init; }
    public required string TenBanVe { get; init; }
    public required string RulePackVersion { get; init; }
    public required string NguoiBoc { get; init; }
    /// <summary>Ngày bóc dạng ISO yyyy-MM-dd (caller đóng dấu — Core không tự lấy giờ hệ thống).</summary>
    public required string NgayIso { get; init; }
}

/// <summary>
/// Ghi kết quả bóc tách ra Excel ĐÚNG MẪU CÔNG TY (M99 §13.2, FR15) — bám
/// `attachments/MAU-KHOI-LUONG-BOQ.xlsx` sheet `02_MAU_BOQ_TRONG`:
/// sheet tên `Data-BOQ` (đúng tên mà dashboard công ty tham chiếu), header A–K
/// nguyên văn ở hàng 6, dữ liệu từ hàng 7 (hàng nhóm hệ + hàng item), công thức
/// H/J/K nguyên văn mẫu từng hàng, cột F để trống cho QS điền KL BOQ hợp đồng.
/// Không macro (.xlsx thuần — M99 §12).
/// </summary>
public static class BoqExcelWriter
{
    // Header A–K nguyên văn mẫu công ty (02_MAU_BOQ_TRONG hàng 6).
    private static readonly string[] Header =
    [
        "Mã BOQ\n(Duy nhất)",
        "STT",
        "MÔ TẢ CÔNG TÁC / VẬT TƯ",
        "Mã/ Quy cách",
        "Đơn vị",
        "KHỐI LƯỢNG BOQ\n(Dự toán HĐ)",
        "KHỐI LƯỢNG ĐỊNH MỨC\n(Bản vẽ thi công)",
        "CHÊNH LỆCH ĐỊNH MỨC\n(= BOQ - Định mức)",
        "GHI CHÚ KỸ THUẬT",
        "KIỂM SOÁT ĐẶT HÀNG\n(QS DUYỆT)",
        "GỢI Ý HÀNH ĐỘNG / ĐIỀU KIỆN",
    ];

    // Bề rộng cột A–K theo mẫu.
    private static readonly double[] BeRongCot = [18, 8, 50, 14, 10, 18, 20, 22, 18, 30, 45];

    private const int HangHeader = 6;

    public static void Write(TakeoffResult ketQua, BoqExcelMeta meta, Stream output)
    {
        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Data-BOQ");

        // ----- Đầu trang (B1–B5) -----
        ws.Cell("B1").Value = $"DỰ ÁN: {meta.TenDuAn}";
        ws.Cell("B2").Value = $"BẢN VẼ: {meta.TenBanVe}";
        ws.Cell("B3").Value = $"GÓI THẦU: {meta.GoiThau}";
        ws.Cell("B4").Value = "BIỂU MẪU: QUẢN LÝ KHỐI LƯỢNG BOQ & ĐỊNH MỨC BÓC TÁCH BẢN VẼ";
        ws.Cell("B5").Value =
            $"Bóc bằng XBoss plugin — rule pack {meta.RulePackVersion} — {meta.NgayIso} — {meta.NguoiBoc}";
        ws.Range("B1:B4").Style.Font.SetBold();
        ws.Cell("B5").Style.Font.SetItalic().Font.SetFontColor(XLColor.FromHtml("#71717A"));

        // ----- Header bảng (hàng 6) -----
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
        ws.Row(HangHeader).Height = 42;

        // ----- Dữ liệu (hàng 7+): nhóm hệ → item -----
        var hang = HangHeader + 1;
        var nhomThuTu = ketQua.Lines
            .GroupBy(l => l.Item.Group)
            .ToList(); // GroupBy giữ thứ tự xuất hiện — Lines đã theo thứ tự items rule pack

        var sttNhom = 0;
        foreach (var nhom in nhomThuTu)
        {
            sttNhom++;
            ws.Cell(hang, 2).Value = SoLaMa(sttNhom);
            ws.Cell(hang, 3).Value = TenNhom(nhom.Key);
            ws.Range(hang, 1, hang, Header.Length).Style
                .Font.SetBold()
                .Fill.SetBackgroundColor(XLColor.FromHtml("#EFEFEF"));
            hang++;

            var sttItem = 0;
            foreach (var line in nhom)
            {
                sttItem++;
                ws.Cell(hang, 1).Value = line.Item.BoqCode; // trống nếu rule pack chưa gán — QS điền
                ws.Cell(hang, 2).Value = sttItem;
                ws.Cell(hang, 3).Value = line.Item.Name;
                ws.Cell(hang, 4).Value = line.Item.Spec;
                ws.Cell(hang, 5).Value = line.Item.Unit;
                // Cột F (KL BOQ hợp đồng) ĐỂ TRỐNG — QS điền; cột G = khối lượng bóc từ bản vẽ.
                ws.Cell(hang, 7).Value = line.Quantity;
                ws.Cell(hang, 8).FormulaA1 = $"IF(OR(ISNUMBER(F{hang}),ISNUMBER(G{hang})),N(F{hang})-N(G{hang}),\"\")";
                ws.Cell(hang, 9).Value = GhiChu(line);
                ws.Cell(hang, 10).FormulaA1 =
                    $"IF(OR(ISNUMBER(F{hang}),ISNUMBER(G{hang})),IF(ISBLANK(G{hang}),\"⚠️ Chưa bóc tách định mức\"," +
                    $"IF(H{hang}>=0,\"✅ OK - Cho phép đặt hàng\",\"❌ CHẶN ĐẶT HÀNG - CẦN BẢO VỆ KL\")),\"\")";
                ws.Cell(hang, 11).FormulaA1 =
                    $"IF(OR(ISNUMBER(F{hang}),ISNUMBER(G{hang})),IF(ISBLANK(G{hang}),\"Kỹ sư/Thầu phụ cần bóc tách KL bản vẽ\"," +
                    $"IF(H{hang}>=0,\"Được đặt hàng tối đa \"&G{hang}&\" \"&E{hang}," +
                    $"\"Vượt dự toán \"&ABS(H{hang})&\" \"&E{hang}&\" (QS giải trình & duyệt sửa BOQ)\")),\"\")";
                hang++;
            }
        }
        var hangCuoi = hang - 1;

        // ----- Cảnh báo dưới bảng -----
        if (ketQua.Warnings.Count > 0 || ketQua.XrefSkippedCount > 0 || ketQua.SkippedMarkedCount > 0)
        {
            hang++;
            foreach (var w in ketQua.Warnings)
            {
                ws.Cell(hang, 3).Value = $"⚠ {w.ThongDiep}";
                ws.Cell(hang, 3).Style.Font.SetFontColor(XLColor.FromHtml("#B45309"));
                hang++;
            }
            if (ketQua.SkippedMarkedCount > 0)
            {
                ws.Cell(hang, 3).Value = $"Đã bỏ qua {ketQua.SkippedMarkedCount} đối tượng bóc trước đó (đánh dấu XBOSS_BOCKL).";
                hang++;
            }
            if (ketQua.XrefSkippedCount > 0)
            {
                ws.Cell(hang, 3).Value = $"Bỏ qua {ketQua.XrefSkippedCount} đối tượng nằm trong xref (không bóc xref).";
                hang++;
            }
        }

        // ----- Định dạng chung -----
        if (hangCuoi >= HangHeader)
        {
            var bang = ws.Range(HangHeader, 1, hangCuoi, Header.Length);
            bang.Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
            bang.Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium);
        }
        ws.Range(HangHeader + 1, 6, Math.Max(hangCuoi, HangHeader + 1), 8).Style.NumberFormat.Format = "#,##0.00";
        ws.SheetView.FreezeRows(HangHeader);

        wb.SaveAs(output);
    }

    private static string GhiChu(TakeoffLine line)
    {
        var cach = line.Item.MeasureKind switch
        {
            RulePack.TakeoffMeasure.Length => "đo theo tim tuyến trên bản vẽ",
            RulePack.TakeoffMeasure.Area => "đo diện tích trên bản vẽ",
            _ => "đếm block trên bản vẽ",
        };
        return $"Bóc từ {line.ObjectCount} đối tượng — {cach}";
    }

    /// <summary>Tên nhóm hệ tiếng Việt cho hàng nhóm (group id trong rule pack là mã ổn định).</summary>
    private static string TenNhom(string groupId) => groupId switch
    {
        "HVAC" => "HỆ ĐIỀU HÒA KHÔNG KHÍ & THÔNG GIÓ (HVAC)",
        "PIPING" => "HỆ CẤP THOÁT NƯỚC (PIPING)",
        "FIREFIGHTING" => "HỆ PHÒNG CHÁY CHỮA CHÁY (PCCC)",
        "ELECTRICAL" => "HỆ ĐIỆN (ELECTRICAL)",
        "ELV" => "HỆ ĐIỆN NHẸ (ELV)",
        _ => groupId,
    };

    internal static string SoLaMa(int n)
    {
        // Đủ dùng cho số nhóm hệ (< 40).
        var giaTri = new[] { 10, 9, 5, 4, 1 };
        var kyHieu = new[] { "X", "IX", "V", "IV", "I" };
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < giaTri.Length && n > 0; i++)
        {
            while (n >= giaTri[i])
            {
                sb.Append(kyHieu[i]);
                n -= giaTri[i];
            }
        }
        return sb.ToString();
    }
}
