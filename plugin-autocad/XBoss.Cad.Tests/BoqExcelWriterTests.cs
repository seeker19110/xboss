using ClosedXML.Excel;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Round-trip ClosedXML (M99 §15/FR15): ghi tệp theo mẫu công ty rồi ĐỌC LẠI,
/// đối chiếu tên sheet `Data-BOQ`, header A–K nguyên văn, dữ liệu cột G,
/// công thức H/J/K sống đúng mẫu `attachments/MAU-KHOI-LUONG-BOQ.xlsx`.
/// </summary>
public class BoqExcelWriterTests
{
    private static readonly CadRulePack Pack = RepoPaths.LoadRulePackV2();

    private static readonly BoqExcelMeta Meta = new()
    {
        TenDuAn = "BD1.6 - TT AVIO",
        GoiThau = "Hệ thống Cơ điện ACMV",
        TenBanVe = "MB-TANG-05.dwg",
        RulePackVersion = Pack.Version,
        NguoiBoc = "Kỹ sư A",
        NgayIso = "2026-08-24",
    };

    private static TakeoffResult KetQuaMau()
    {
        var may = new TakeoffCalculator(Pack.Takeoff, Pack.Version);
        return may.Compute(
        [
            new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 12_345.6 },
            new MeasuredObject { Handle = "D2", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 7_654.4 },
            new MeasuredObject { Handle = "P1", Layer = "P-PIPE-DOMW", Kind = MeasuredKind.Curve, RawLength = 5_000 },
            new MeasuredObject { Handle = "F1", Layer = "0", Kind = MeasuredKind.Block, BlockName = "FCU-12" },
        ], insUnits: 4, xrefSkippedCount: 2);
    }

    private static IXLWorksheet GhiRoiDocLai(TakeoffResult kq, out XLWorkbook wb)
    {
        var stream = new MemoryStream();
        BoqExcelWriter.Write(kq, Meta, stream);
        stream.Position = 0;
        wb = new XLWorkbook(stream);
        return wb.Worksheet("Data-BOQ");
    }

    [Fact]
    public void AC11_layout_dung_mau_cong_ty()
    {
        var ws = GhiRoiDocLai(KetQuaMau(), out var wb);
        using (wb)
        {
            // Đầu trang
            Assert.Equal("DỰ ÁN: BD1.6 - TT AVIO", ws.Cell("B1").GetString());
            Assert.Equal("BẢN VẼ: MB-TANG-05.dwg", ws.Cell("B2").GetString());
            Assert.Contains("rule pack v2", ws.Cell("B5").GetString());
            Assert.Contains("Kỹ sư A", ws.Cell("B5").GetString());

            // Header hàng 6 nguyên văn mẫu
            Assert.Equal("Mã BOQ\n(Duy nhất)", ws.Cell(6, 1).GetString());
            Assert.Equal("STT", ws.Cell(6, 2).GetString());
            Assert.Equal("KHỐI LƯỢNG ĐỊNH MỨC\n(Bản vẽ thi công)", ws.Cell(6, 7).GetString());
            Assert.Equal("GỢI Ý HÀNH ĐỘNG / ĐIỀU KIỆN", ws.Cell(6, 11).GetString());

            // Hàng 7: nhóm HVAC (STT La Mã); hàng 8: item đầu (ống gió cấp)
            Assert.Equal("I", ws.Cell(7, 2).GetString());
            Assert.Contains("HVAC", ws.Cell(7, 3).GetString());
            Assert.Equal("Ống gió cấp", ws.Cell(8, 3).GetString());
            Assert.Equal("m", ws.Cell(8, 5).GetString());
            // 12345.6 + 7654.4 = 20000mm → 20.00m
            Assert.Equal(20.0, ws.Cell(8, 7).GetDouble());
            // Cột F trống cho QS
            Assert.True(ws.Cell(8, 6).IsEmpty());
            Assert.Contains("Bóc từ 2 đối tượng", ws.Cell(8, 9).GetString());
        }
    }

    [Fact]
    public void AC11_cong_thuc_HJK_song_dung_nguyen_van_mau()
    {
        var ws = GhiRoiDocLai(KetQuaMau(), out var wb);
        using (wb)
        {
            Assert.Equal("IF(OR(ISNUMBER(F8),ISNUMBER(G8)),N(F8)-N(G8),\"\")", ws.Cell(8, 8).FormulaA1);
            Assert.Contains("⚠️ Chưa bóc tách định mức", ws.Cell(8, 10).FormulaA1);
            Assert.Contains("✅ OK - Cho phép đặt hàng", ws.Cell(8, 10).FormulaA1);
            Assert.Contains("❌ CHẶN ĐẶT HÀNG - CẦN BẢO VỆ KL", ws.Cell(8, 10).FormulaA1);
            Assert.Contains("Được đặt hàng tối đa \"&G8&\" \"&E8", ws.Cell(8, 11).FormulaA1);
            Assert.Contains("QS giải trình & duyệt sửa BOQ", ws.Cell(8, 11).FormulaA1);
        }
    }

    [Fact]
    public void Nhom_he_theo_thu_tu_rule_pack_va_du_cac_dong()
    {
        var kq = KetQuaMau();
        var ws = GhiRoiDocLai(kq, out var wb);
        using (wb)
        {
            // 3 dòng kết quả: duct-supp + fcu-unit (HVAC), pipe-domw (PIPING) → 2 nhóm.
            Assert.Equal(3, kq.Lines.Count);
            var noiDungCotC = Enumerable.Range(7, 12)
                .Select(r => ws.Cell(r, 3).GetString())
                .Where(s => s.Length > 0)
                .ToList();
            Assert.Contains(noiDungCotC, s => s.Contains("HVAC"));
            Assert.Contains("Thiết bị FCU", noiDungCotC);
            Assert.Contains(noiDungCotC, s => s.Contains("PIPING"));
            Assert.Contains("Ống cấp nước sinh hoạt", noiDungCotC);
            // Ghi chú xref bị bỏ qua có mặt dưới bảng
            Assert.Contains(noiDungCotC, s => s.Contains("xref"));
        }
    }

    [Fact]
    public void So_la_ma_cho_stt_nhom()
    {
        Assert.Equal("I", BoqExcelWriter.SoLaMa(1));
        Assert.Equal("IV", BoqExcelWriter.SoLaMa(4));
        Assert.Equal("IX", BoqExcelWriter.SoLaMa(9));
        Assert.Equal("XII", BoqExcelWriter.SoLaMa(12));
    }
}
