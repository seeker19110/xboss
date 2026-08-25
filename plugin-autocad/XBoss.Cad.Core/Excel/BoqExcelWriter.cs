using System.Globalization;
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
///
/// v6 (M101 §6.3, FR6): khi kết quả có size/vùng/hệ số quy đổi thì CỘNG THÊM cột L–Q và
/// sheet phụ <c>Tong-hop-vung</c> — hợp đồng layout A–K + công thức H/J/K + SUBTOTAL giữ nguyên
/// từng ô, QS mở bằng thói quen cũ không hụt gì. Cột G luôn là KL ĐO trên bản vẽ; hao hụt/phụ
/// kiện chỉ hiện ở cột KL QUY ĐỔI riêng, KHÔNG BAO GIỜ trộn vào cột G (M101 §18).
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

    // Cột CỘNG THÊM của v6 (L–Q) — chỉ ghi khi kết quả thật sự có size/vùng/hệ số quy đổi.
    private static readonly string[] HeaderV6 =
    [
        "VÙNG",
        "SIZE",
        "NGUỒN SIZE",
        "MÃ ITEM\n(rule pack)",
        "HỆ SỐ QUY ĐỔI\n(rule pack)",
        "KL QUY ĐỔI\n(= KL đo × hệ số)",
    ];

    // Bề rộng cột A–K theo mẫu, tiếp theo là L–Q của v6.
    private static readonly double[] BeRongCot = [18, 8, 50, 14, 10, 18, 20, 22, 18, 30, 45, 16, 14, 16, 18, 22, 20];

    private const int HangHeader = 6;

    /// <summary>Cột đầu tiên của khối v6 (L = 12) — khối A–K trước đó không đổi.</summary>
    private const int CotV6 = 12;

    private const int CotVung = CotV6;          // L
    private const int CotSize = CotV6 + 1;      // M
    private const int CotNguonSize = CotV6 + 2; // N
    private const int CotMaItem = CotV6 + 3;    // O
    private const int CotHeSo = CotV6 + 4;      // P
    private const int CotKlQuyDoi = CotV6 + 5;  // Q

    /// <summary>Tên sheet phụ tổng hợp theo vùng (v6) — sheet mẫu công ty giữ nguyên tên/nội dung.</summary>
    public const string SheetVung = "Tong-hop-vung";

    /// <summary>Một bản vẽ trong lô hàng loạt (M101 §6.4, XBOSS_BATCH chế độ BocKL): kết quả bóc
    /// kèm tên tệp nguồn — dùng để đổ vào cột "Tệp" của Excel tổng.</summary>
    public sealed record BatchTakeoffEntry(string TenTep, TakeoffResult KetQua);

    public static void Write(TakeoffResult ketQua, BoqExcelMeta meta, Stream output)
    {
        // Cột v6 chỉ xuất hiện khi có dữ liệu tương ứng — rule pack chưa bật khóa nào thì tệp
        // ra y hệt bản M99 (không thêm cột trống làm QS hoang mang).
        var moRong = ketQua.Lines.Any(l => l.Size.Length > 0 || l.Vung.Length > 0 || l.HeSoQuyDoi > 0);
        var coVung = ketQua.Lines.Any(l => l.Vung.Length > 0);
        var soCot = moRong ? Header.Length + HeaderV6.Length : Header.Length;

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
        for (var i = 0; i < soCot; i++)
        {
            var cell = ws.Cell(HangHeader, i + 1);
            cell.Value = i < Header.Length ? Header[i] : HeaderV6[i - Header.Length];
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
            var hangNhom = hang;
            ws.Cell(hang, 2).Value = SoLaMa(sttNhom);
            ws.Cell(hang, 3).Value = TenNhom(nhom.Key);
            ws.Range(hang, 1, hang, soCot).Style
                .Font.SetBold()
                .Fill.SetBackgroundColor(XLColor.FromHtml("#EFEFEF"));
            hang++;

            var sttItem = 0;
            foreach (var line in nhom)
            {
                sttItem++;
                ws.Cell(hang, 1).Value = line.Item.BoqCode; // trống nếu rule pack chưa gán — QS điền
                ws.Cell(hang, 2).Value = sttItem;
                ws.Cell(hang, 3).Value = MoTaDong(line);
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

                if (moRong)
                {
                    // Cột CỘNG THÊM v6 — cột G phía trên vẫn là KL ĐO nguyên vẹn.
                    ws.Cell(hang, CotVung).Value = coVung && line.Vung.Length == 0 ? NgoaiVung : line.Vung;
                    ws.Cell(hang, CotSize).Value = line.Size;
                    ws.Cell(hang, CotNguonSize).Value = Takeoff.TakeoffSize.MoTaNguon(line.NguonSize);
                    ws.Cell(hang, CotMaItem).Value = line.Item.Id;
                    if (line.HeSoQuyDoi > 0)
                    {
                        ws.Cell(hang, CotHeSo).Value = line.MoTaQuyDoi;
                        // Công thức SỐNG: QS sửa KL đo ở G thì KL quy đổi tự đổi theo.
                        ws.Cell(hang, CotKlQuyDoi).FormulaA1 =
                            $"G{hang}*{line.HeSoQuyDoi.ToString(CultureInfo.InvariantCulture)}";
                    }
                }
                hang++;
            }

            // Tổng nhóm hệ (công thức SỐNG trên hàng nhóm): SUBTOTAL(9,…) để hàng TỔNG CỘNG
            // cuối bảng cộng thẳng cả vùng mà không đếm trùng các hàng nhóm.
            foreach (var cot in moRong ? [6, 7, 8, CotKlQuyDoi] : new[] { 6, 7, 8 }) // F, G, H (+ Q)
            {
                ws.Cell(hangNhom, cot).FormulaA1 =
                    $"SUBTOTAL(9,{CotChu(cot)}{hangNhom + 1}:{CotChu(cot)}{hang - 1})";
            }
        }

        // ----- Hàng TỔNG CỘNG toàn bảng (SUBTOTAL bỏ qua các SUBTOTAL nhóm — không đếm trùng) -----
        if (ketQua.Lines.Count > 0)
        {
            ws.Cell(hang, 3).Value = "TỔNG CỘNG";
            foreach (var cot in moRong ? [6, 7, 8, CotKlQuyDoi] : new[] { 6, 7, 8 }) // F, G, H (+ Q)
            {
                ws.Cell(hang, cot).FormulaA1 =
                    $"SUBTOTAL(9,{CotChu(cot)}{HangHeader + 1}:{CotChu(cot)}{hang - 1})";
            }
            ws.Range(hang, 1, hang, soCot).Style
                .Font.SetBold()
                .Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            hang++;
        }
        var hangCuoi = hang - 1;

        // ----- Cảnh báo dưới bảng -----
        if (moRong)
        {
            hang++;
            ws.Cell(hang, 3).Value =
                $"Cột G = KL ĐO trên bản vẽ (KHÔNG cộng hao hụt). Cột {CotChu(CotKlQuyDoi)} = KL QUY ĐỔI theo hệ số rule pack " +
                $"ghi ở cột {CotChu(CotHeSo)} — hai cột tách bạch, không trộn lẫn.";
            ws.Cell(hang, 3).Style.Font.SetItalic();
            hang++;
        }
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
            var bang = ws.Range(HangHeader, 1, hangCuoi, soCot);
            bang.Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
            bang.Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium);
        }
        ws.Range(HangHeader + 1, 6, Math.Max(hangCuoi, HangHeader + 1), 8).Style.NumberFormat.Format = "#,##0.00";
        if (moRong)
        {
            ws.Range(HangHeader + 1, CotKlQuyDoi, Math.Max(hangCuoi, HangHeader + 1), CotKlQuyDoi)
                .Style.NumberFormat.Format = "#,##0.00";
        }
        ws.SheetView.FreezeRows(HangHeader);

        if (coVung) GhiSheetVung(wb, ketQua);

        wb.SaveAs(output);
    }

    /// <summary>
    /// Excel TỔNG cho nhiều bản vẽ (M101 §6.4, <c>XBOSS_BATCH</c> chế độ <c>BocKL</c>) — hợp đồng
    /// layout mẫu công ty (cột A–K + công thức H/J/K + SUBTOTAL) GIỮ NGUYÊN như <see cref="Write"/>;
    /// chỉ CỘNG THÊM cột cuối "Tệp" ghi rõ dòng đó bóc từ bản vẽ nào. Các dòng cùng nhóm hệ của
    /// NHIỀU bản vẽ được gộp chung một khối nhóm (SUBTOTAL cộng cả lô — đúng tinh thần "bóc cả
    /// tòa nhà" của batch), không tách sheet theo từng tệp.
    /// </summary>
    public static void WriteBatch(IReadOnlyList<BatchTakeoffEntry> banVe, BoqExcelMeta meta, Stream output)
    {
        var tatCaDong = banVe
            .SelectMany(b => b.KetQua.Lines.Select(l => (TenTep: b.TenTep, Line: l)))
            .ToList();
        var moRong = tatCaDong.Any(x => x.Line.Size.Length > 0 || x.Line.Vung.Length > 0 || x.Line.HeSoQuyDoi > 0);
        var coVung = tatCaDong.Any(x => x.Line.Vung.Length > 0);
        var soCotChinh = moRong ? Header.Length + HeaderV6.Length : Header.Length;
        var cotTep = soCotChinh + 1;
        var soCot = cotTep;

        using var wb = new XLWorkbook();
        var ws = wb.AddWorksheet("Data-BOQ");

        // ----- Đầu trang (B1–B5) -----
        ws.Cell("B1").Value = $"DỰ ÁN: {meta.TenDuAn}";
        ws.Cell("B2").Value = $"BẢN VẼ: {meta.TenBanVe}";
        ws.Cell("B3").Value = $"GÓI THẦU: {meta.GoiThau}";
        ws.Cell("B4").Value = "BIỂU MẪU: QUẢN LÝ KHỐI LƯỢNG BOQ & ĐỊNH MỨC BÓC TÁCH BẢN VẼ (GỘP HÀNG LOẠT)";
        ws.Cell("B5").Value =
            $"Bóc bằng XBoss plugin — rule pack {meta.RulePackVersion} — {meta.NgayIso} — {meta.NguoiBoc} — " +
            $"{banVe.Count} bản vẽ";
        ws.Range("B1:B4").Style.Font.SetBold();
        ws.Cell("B5").Style.Font.SetItalic().Font.SetFontColor(XLColor.FromHtml("#71717A"));

        // ----- Header bảng (hàng 6) -----
        for (var i = 0; i < soCot; i++)
        {
            var cell = ws.Cell(HangHeader, i + 1);
            cell.Value = i < Header.Length ? Header[i]
                : i < soCotChinh ? HeaderV6[i - Header.Length]
                : "Tệp";
            cell.Style
                .Font.SetBold()
                .Alignment.SetWrapText(true)
                .Alignment.SetHorizontal(XLAlignmentHorizontalValues.Center)
                .Alignment.SetVertical(XLAlignmentVerticalValues.Center)
                .Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            ws.Column(i + 1).Width = i < BeRongCot.Length ? BeRongCot[i] : 26;
        }
        ws.Row(HangHeader).Height = 42;

        // ----- Dữ liệu (hàng 7+): nhóm hệ → (tệp, item) -----
        var hang = HangHeader + 1;
        var nhomThuTu = tatCaDong
            .GroupBy(x => x.Line.Item.Group)
            .ToList(); // GroupBy giữ thứ tự xuất hiện đầu tiên trên toàn lô

        var sttNhom = 0;
        foreach (var nhom in nhomThuTu)
        {
            sttNhom++;
            var hangNhom = hang;
            ws.Cell(hang, 2).Value = SoLaMa(sttNhom);
            ws.Cell(hang, 3).Value = TenNhom(nhom.Key);
            ws.Range(hang, 1, hang, soCot).Style
                .Font.SetBold()
                .Fill.SetBackgroundColor(XLColor.FromHtml("#EFEFEF"));
            hang++;

            var sttItem = 0;
            foreach (var (tenTep, line) in nhom)
            {
                sttItem++;
                ws.Cell(hang, 1).Value = line.Item.BoqCode;
                ws.Cell(hang, 2).Value = sttItem;
                ws.Cell(hang, 3).Value = MoTaDong(line);
                ws.Cell(hang, 4).Value = line.Item.Spec;
                ws.Cell(hang, 5).Value = line.Item.Unit;
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

                if (moRong)
                {
                    ws.Cell(hang, CotVung).Value = coVung && line.Vung.Length == 0 ? NgoaiVung : line.Vung;
                    ws.Cell(hang, CotSize).Value = line.Size;
                    ws.Cell(hang, CotNguonSize).Value = Takeoff.TakeoffSize.MoTaNguon(line.NguonSize);
                    ws.Cell(hang, CotMaItem).Value = line.Item.Id;
                    if (line.HeSoQuyDoi > 0)
                    {
                        ws.Cell(hang, CotHeSo).Value = line.MoTaQuyDoi;
                        ws.Cell(hang, CotKlQuyDoi).FormulaA1 =
                            $"G{hang}*{line.HeSoQuyDoi.ToString(CultureInfo.InvariantCulture)}";
                    }
                }
                ws.Cell(hang, cotTep).Value = tenTep;
                hang++;
            }

            foreach (var cot in moRong ? [6, 7, 8, CotKlQuyDoi] : new[] { 6, 7, 8 })
            {
                ws.Cell(hangNhom, cot).FormulaA1 =
                    $"SUBTOTAL(9,{CotChu(cot)}{hangNhom + 1}:{CotChu(cot)}{hang - 1})";
            }
        }

        // ----- Hàng TỔNG CỘNG toàn bảng -----
        if (tatCaDong.Count > 0)
        {
            ws.Cell(hang, 3).Value = "TỔNG CỘNG";
            foreach (var cot in moRong ? [6, 7, 8, CotKlQuyDoi] : new[] { 6, 7, 8 })
            {
                ws.Cell(hang, cot).FormulaA1 =
                    $"SUBTOTAL(9,{CotChu(cot)}{HangHeader + 1}:{CotChu(cot)}{hang - 1})";
            }
            ws.Range(hang, 1, hang, soCot).Style
                .Font.SetBold()
                .Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            hang++;
        }
        var hangCuoi = hang - 1;

        // ----- Cảnh báo dưới bảng (gộp từ mọi bản vẽ, đánh dấu tên tệp) -----
        if (moRong)
        {
            hang++;
            ws.Cell(hang, 3).Value =
                $"Cột G = KL ĐO trên bản vẽ (KHÔNG cộng hao hụt). Cột {CotChu(CotKlQuyDoi)} = KL QUY ĐỔI theo hệ số rule pack " +
                $"ghi ở cột {CotChu(CotHeSo)} — hai cột tách bạch, không trộn lẫn.";
            ws.Cell(hang, 3).Style.Font.SetItalic();
            hang++;
        }
        var tongSkipped = banVe.Sum(b => b.KetQua.SkippedMarkedCount);
        var tongXref = banVe.Sum(b => b.KetQua.XrefSkippedCount);
        var canhBaoGop = banVe.SelectMany(b => b.KetQua.Warnings.Select(w => $"[{b.TenTep}] {w.ThongDiep}")).ToList();
        if (canhBaoGop.Count > 0 || tongXref > 0 || tongSkipped > 0)
        {
            hang++;
            foreach (var w in canhBaoGop)
            {
                ws.Cell(hang, 3).Value = $"⚠ {w}";
                ws.Cell(hang, 3).Style.Font.SetFontColor(XLColor.FromHtml("#B45309"));
                hang++;
            }
            if (tongSkipped > 0)
            {
                ws.Cell(hang, 3).Value = $"Đã bỏ qua {tongSkipped} đối tượng bóc trước đó (đánh dấu XBOSS_BOCKL), tính cả lô.";
                hang++;
            }
            if (tongXref > 0)
            {
                ws.Cell(hang, 3).Value = $"Bỏ qua {tongXref} đối tượng nằm trong xref (không bóc xref), tính cả lô.";
                hang++;
            }
        }

        // ----- Định dạng chung -----
        if (hangCuoi >= HangHeader)
        {
            var bang = ws.Range(HangHeader, 1, hangCuoi, soCot);
            bang.Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
            bang.Style.Border.SetOutsideBorder(XLBorderStyleValues.Medium);
        }
        ws.Range(HangHeader + 1, 6, Math.Max(hangCuoi, HangHeader + 1), 8).Style.NumberFormat.Format = "#,##0.00";
        if (moRong)
        {
            ws.Range(HangHeader + 1, CotKlQuyDoi, Math.Max(hangCuoi, HangHeader + 1), CotKlQuyDoi)
                .Style.NumberFormat.Format = "#,##0.00";
        }
        ws.SheetView.FreezeRows(HangHeader);

        if (coVung) GhiSheetVung(wb, new TakeoffResult
        {
            RulePackVersion = meta.RulePackVersion,
            Lines = tatCaDong.Select(x => x.Line).ToList(),
            Warnings = [],
            SkippedMarkedCount = 0,
            XrefSkippedCount = 0,
        });

        wb.SaveAs(output);
    }

    /// <summary>
    /// Sheet phụ tổng hợp theo vùng (v6) — CỘNG THÊM, không đụng sheet mẫu công ty. Số liệu là
    /// công thức SỐNG (SUMIFS về Data-BOQ theo tên vùng + mã item) nên QS sửa KL đo bên kia thì
    /// tổng theo vùng tự đổi theo, không có số chết đi lệch dữ liệu gốc.
    /// </summary>
    private static void GhiSheetVung(XLWorkbook wb, TakeoffResult ketQua)
    {
        var ws = wb.AddWorksheet(SheetVung);
        string[] header = ["VÙNG", "Mã BOQ", "MÔ TẢ CÔNG TÁC / VẬT TƯ", "Đơn vị", "KL ĐO", "KL QUY ĐỔI", "Mã item"];
        double[] beRong = [22, 18, 46, 10, 16, 16, 20];
        ws.Cell(1, 1).Value = "TỔNG HỢP KHỐI LƯỢNG THEO VÙNG (bóc theo ranh giới do kỹ sư chọn)";
        ws.Cell(1, 1).Style.Font.SetBold();
        for (var i = 0; i < header.Length; i++)
        {
            ws.Cell(3, i + 1).Value = header[i];
            ws.Cell(3, i + 1).Style.Font.SetBold().Fill.SetBackgroundColor(XLColor.FromHtml("#D9E2F3"));
            ws.Column(i + 1).Width = beRong[i];
        }

        var hang = 4;
        // Mỗi (vùng × item) một dòng, giữ thứ tự vùng và thứ tự item như bảng chính.
        foreach (var vung in ketQua.Lines.Select(l => l.Vung).Distinct(StringComparer.Ordinal).ToList())
        {
            foreach (var nhom in ketQua.Lines.Where(l => l.Vung == vung).GroupBy(l => l.Item.Id))
            {
                var mau = nhom.First();
                ws.Cell(hang, 1).Value = vung.Length == 0 ? NgoaiVung : vung;
                ws.Cell(hang, 2).Value = mau.Item.BoqCode;
                ws.Cell(hang, 3).Value = mau.Item.Name;
                ws.Cell(hang, 4).Value = mau.Item.Unit;
                ws.Cell(hang, 5).FormulaA1 = SumIfsVung(7, hang);
                if (nhom.Any(l => l.HeSoQuyDoi > 0)) ws.Cell(hang, 6).FormulaA1 = SumIfsVung(CotKlQuyDoi, hang);
                ws.Cell(hang, 7).Value = mau.Item.Id;
                hang++;
            }
        }
        ws.Range(3, 1, Math.Max(hang - 1, 3), header.Length).Style.Border.SetInsideBorder(XLBorderStyleValues.Thin);
        ws.Range(4, 5, Math.Max(hang - 1, 4), 6).Style.NumberFormat.Format = "#,##0.00";
    }

    /// <summary>SUMIFS sống về Data-BOQ: cộng cột <paramref name="cot"/> theo vùng (cột L) + mã item (cột O).</summary>
    private static string SumIfsVung(int cot, int hang)
    {
        var c = CotChu(cot);
        return $"SUMIFS('Data-BOQ'!{c}:{c},'Data-BOQ'!{CotChu(CotVung)}:{CotChu(CotVung)},$A{hang}," +
               $"'Data-BOQ'!{CotChu(CotMaItem)}:{CotChu(CotMaItem)},$G{hang})";
    }

    /// <summary>Nhãn của phần tuyến không nằm trong vùng nào (không giấu mét nào đi).</summary>
    private const string NgoaiVung = "(ngoài vùng)";

    /// <summary>Mô tả công tác ở cột C — kèm size khi dòng đã tách theo size (M101 §6.3).</summary>
    private static string MoTaDong(TakeoffLine line)
    {
        if (line.Size.Length > 0) return $"{line.Item.Name} {line.Size}";
        return line.Item.GroupBySize || line.LaDanXuat
            ? $"{line.Item.Name} {Takeoff.TakeoffSize.ChuaCoSize}"
            : line.Item.Name;
    }

    private static string GhiChu(TakeoffLine line)
    {
        var cach = line.Item.MeasureKind switch
        {
            RulePack.TakeoffMeasure.Length => "đo theo tim tuyến trên bản vẽ",
            RulePack.TakeoffMeasure.Area => "đo diện tích trên bản vẽ",
            _ => "đếm block trên bản vẽ",
        };
        if (line.LaDanXuat)
        {
            cach = $"TÍNH RA từ \"{line.Item.DerivedFrom}\" theo công thức {line.Item.Formula} (không đo trực tiếp)";
        }
        var nguon = Takeoff.TakeoffSize.MoTaNguon(line.NguonSize);
        var themNguon = nguon.Length > 0 ? $" — size: {nguon}" : "";
        return $"Bóc từ {line.ObjectCount} đối tượng — {cach}{themNguon}";
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

    /// <summary>Chữ cái cột A1 cho chỉ số cột 1-based (chỉ cần A–K).</summary>
    private static char CotChu(int cot) => (char)('A' + cot - 1);

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
