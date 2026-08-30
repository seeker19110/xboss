using ClosedXML.Excel;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.4 — Excel TỔNG cho <c>XBOSS_BATCH</c> chế độ <c>BocKL</c>: cùng hợp đồng layout mẫu
/// công ty (A–K + công thức H/J/K + SUBTOTAL) như <see cref="BoqExcelWriter.Write"/>, chỉ CỘNG
/// THÊM cột cuối "Tệp"; dòng của nhiều bản vẽ cùng nhóm hệ gộp chung một khối SUBTOTAL.
/// </summary>
public class BoqExcelWriterBatchTests
{
    private static readonly CadRulePack Pack = RepoPaths.LoadRulePack();

    private static readonly BoqExcelMeta Meta = new()
    {
        TenDuAn = "BD1.6 - TT AVIO",
        GoiThau = "Hệ thống Cơ điện ACMV",
        TenBanVe = "Hàng loạt — 2 bản vẽ",
        RulePackVersion = Pack.Version,
        NguoiBoc = "Kỹ sư A",
        NgayIso = "2026-08-25",
    };

    private static TakeoffResult KetQua(double daiMm)
    {
        var may = new TakeoffCalculator(Pack.Takeoff, Pack.Version);
        return may.Compute(
            [new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = daiMm }],
            insUnits: 4);
    }

    private static IXLWorksheet GhiRoiDocLai(
        IReadOnlyList<BoqExcelWriter.BatchTakeoffEntry> banVe, out XLWorkbook wb)
    {
        var stream = new MemoryStream();
        BoqExcelWriter.WriteBatch(banVe, Meta, stream);
        stream.Position = 0;
        wb = new XLWorkbook(stream);
        return wb.Worksheet("Data-BOQ");
    }

    [Fact]
    public void Cot_Tep_cong_them_cuoi_bang_hop_dong_AK_giu_nguyen()
    {
        var banVe = new[]
        {
            new BoqExcelWriter.BatchTakeoffEntry("T05.dwg", KetQua(12_000)),
            new BoqExcelWriter.BatchTakeoffEntry("T06.dwg", KetQua(8_000)),
        };
        var ws = GhiRoiDocLai(banVe, out var wb);
        using (wb)
        {
            // Header A–K nguyên văn mẫu công ty, cột "Tệp" ở cuối (L khi không có v6)
            Assert.Equal("Mã BOQ\n(Duy nhất)", ws.Cell(6, 1).GetString());
            Assert.Equal("GỢI Ý HÀNH ĐỘNG / ĐIỀU KIỆN", ws.Cell(6, 11).GetString());
            Assert.Equal("Tệp", ws.Cell(6, 12).GetString());

            // Hàng 8-9 = 2 dòng của 2 bản vẽ, cùng nhóm HVAC — cột L ghi rõ nguồn tệp.
            Assert.Equal("T05.dwg", ws.Cell(8, 12).GetString());
            Assert.Equal("T06.dwg", ws.Cell(9, 12).GetString());
            Assert.Equal(12.0, ws.Cell(8, 7).GetDouble());
            Assert.Equal(8.0, ws.Cell(9, 7).GetDouble());

            // Gộp chung 1 khối SUBTOTAL cho cả 2 bản vẽ (bóc cả tòa nhà — không tách theo tệp).
            Assert.Equal("SUBTOTAL(9,G8:G9)", ws.Cell(7, 7).FormulaA1);
            Assert.Equal("TỔNG CỘNG", ws.Cell(10, 3).GetString());
            Assert.Equal("SUBTOTAL(9,G7:G9)", ws.Cell(10, 7).FormulaA1);

            // Công thức H/J/K nguyên văn mẫu vẫn còn đúng hàng.
            Assert.Equal("IF(OR(ISNUMBER(F8),ISNUMBER(G8)),N(F8)-N(G8),\"\")", ws.Cell(8, 8).FormulaA1);
            Assert.True(ws.Cell(8, 6).IsEmpty());
        }
    }

    [Fact]
    public void Khong_co_ban_ve_nao_thi_van_ra_tep_hop_le_khong_co_dong()
    {
        var ws = GhiRoiDocLai([], out var wb);
        using (wb)
        {
            Assert.Equal("Tệp", ws.Cell(6, 12).GetString());
            Assert.True(ws.Cell(7, 3).IsEmpty()); // không có hàng nhóm/tổng cộng nào
        }
    }

    [Fact]
    public void Canh_bao_cua_tung_tep_duoc_gan_ten_tep_de_truy_vet()
    {
        var kqXref = new TakeoffCalculator(Pack.Takeoff, Pack.Version).Compute(
            [new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 5_000 }],
            insUnits: 4, xrefSkippedCount: 3);
        var banVe = new[] { new BoqExcelWriter.BatchTakeoffEntry("T07.dwg", kqXref) };
        var ws = GhiRoiDocLai(banVe, out var wb);
        using (wb)
        {
            var noiDung = Enumerable.Range(6, 6).Select(r => ws.Cell(r, 3).GetString()).ToList();
            Assert.Contains(noiDung, s => s.Contains("xref") && s.Contains("cả lô"));
        }
    }
}
