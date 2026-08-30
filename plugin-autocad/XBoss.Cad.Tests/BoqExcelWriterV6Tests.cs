using ClosedXML.Excel;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.3/FR6 — Excel bóc tách v6: cột "Vùng"/"Size"/"KL quy đổi" là CỘNG THÊM (L–Q),
/// hợp đồng mẫu công ty A–K + công thức H/J/K + SUBTOTAL không đổi một ô nào; sheet phụ
/// `Tong-hop-vung` cộng theo vùng bằng công thức sống. Round-trip ClosedXML như M99 §15.
/// </summary>
public class BoqExcelWriterV6Tests
{
    private static readonly BoqExcelMeta Meta = new()
    {
        TenDuAn = "BD1.6 - TT AVIO",
        GoiThau = "Hệ thống Cơ điện ACMV",
        TenBanVe = "MB-TANG-05.dwg",
        RulePackVersion = "v6",
        NguoiBoc = "Kỹ sư A",
        NgayIso = "2026-08-25",
    };

    private static TakeoffSection Bo(params TakeoffItem[] items) => new()
    {
        DrawingUnitAssumption = "mm",
        MarkColorAci = 92,
        XdataAppName = "XBOSS_BOCKL",
        Rounding = new TakeoffRounding { Length = 2, Area = 2, Count = 0 },
        Items = items,
    };

    private static readonly TakeoffItem OngTheoSize = new()
    {
        Id = "duct-supp", Group = "HVAC", Name = "Ống gió cấp", Spec = "Tôn tráng kẽm", Unit = "m",
        Measure = "length", LayerMatchAny = ["M-DUCT-SUPP"], Factor = 0.001, BoqCode = "HVAC-01",
        GroupBySize = true, WastagePct = 5,
    };

    private static MeasuredObject Tuyen(string handle, double daiMm, string size, string vung) => new()
    {
        Handle = handle, Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = daiMm,
        SizeXData = size, Vung = vung,
    };

    private static TakeoffResult KetQuaVung() =>
        new TakeoffCalculator(Bo(OngTheoSize), "v6").Compute(
        [
            Tuyen("A", 10_000, "300x200", "Tầng 5"),
            Tuyen("B", 6_000, "400x300", "Tầng 5"),
            Tuyen("C", 4_000, "300x200", "Tầng 6"),
        ], insUnits: 4);

    private static IXLWorkbook GhiRoiDocLai(TakeoffResult kq)
    {
        var stream = new MemoryStream();
        BoqExcelWriter.Write(kq, Meta, stream);
        stream.Position = 0;
        return new XLWorkbook(stream);
    }

    [Fact]
    public void Ket_qua_khong_co_size_vung_he_so_thi_KHONG_them_cot_nao()
    {
        var pack = RepoPaths.LoadRulePack();
        var kq = new TakeoffCalculator(pack.Takeoff, pack.Version).Compute(
            [new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 20_000 }],
            insUnits: 4);

        using var wb = GhiRoiDocLai(kq);
        var ws = wb.Worksheet("Data-BOQ");

        Assert.Single(wb.Worksheets);                       // không sinh sheet phụ
        Assert.True(ws.Cell(6, 12).IsEmpty());              // không có header cột L
        Assert.Equal("Ống gió cấp", ws.Cell(8, 3).GetString()); // mô tả không kèm size
    }

    [Fact]
    public void Cot_v6_cong_them_L_den_Q_va_hop_dong_A_K_giu_nguyen()
    {
        using var wb = GhiRoiDocLai(KetQuaVung());
        var ws = wb.Worksheet("Data-BOQ");

        // Header A–K nguyên văn mẫu công ty
        Assert.Equal("Mã BOQ\n(Duy nhất)", ws.Cell(6, 1).GetString());
        Assert.Equal("KHỐI LƯỢNG ĐỊNH MỨC\n(Bản vẽ thi công)", ws.Cell(6, 7).GetString());
        Assert.Equal("GỢI Ý HÀNH ĐỘNG / ĐIỀU KIỆN", ws.Cell(6, 11).GetString());
        // Cột cộng thêm
        Assert.Equal("VÙNG", ws.Cell(6, 12).GetString());
        Assert.Equal("SIZE", ws.Cell(6, 13).GetString());
        Assert.Equal("NGUỒN SIZE", ws.Cell(6, 14).GetString());
        Assert.Equal("MÃ ITEM\n(rule pack)", ws.Cell(6, 15).GetString());
        Assert.Equal("HỆ SỐ QUY ĐỔI\n(rule pack)", ws.Cell(6, 16).GetString());
        Assert.Equal("KL QUY ĐỔI\n(= KL đo × hệ số)", ws.Cell(6, 17).GetString());

        // Hàng 8 = dòng item đầu (Tầng 5 / 300x200): 10.00 m
        Assert.Equal("Ống gió cấp 300x200", ws.Cell(8, 3).GetString());
        Assert.Equal(10.0, ws.Cell(8, 7).GetDouble());
        Assert.Equal("Tầng 5", ws.Cell(8, 12).GetString());
        Assert.Equal("300x200", ws.Cell(8, 13).GetString());
        Assert.Equal("XData", ws.Cell(8, 14).GetString());
        Assert.Equal("duct-supp", ws.Cell(8, 15).GetString());
        Assert.Equal("hao hụt 5%", ws.Cell(8, 16).GetString());
        // Công thức A–K của mẫu vẫn nguyên văn trên đúng hàng đó
        Assert.Equal("IF(OR(ISNUMBER(F8),ISNUMBER(G8)),N(F8)-N(G8),\"\")", ws.Cell(8, 8).FormulaA1);
        Assert.True(ws.Cell(8, 6).IsEmpty()); // cột F vẫn để trống cho QS
    }

    [Fact]
    public void KL_do_va_KL_quy_doi_o_hai_cot_khac_nhau_bang_cong_thuc_song()
    {
        using var wb = GhiRoiDocLai(KetQuaVung());
        var ws = wb.Worksheet("Data-BOQ");

        // Cột G = KL ĐO (không cộng hao hụt); cột Q = KL QUY ĐỔI = G × hệ số, công thức sống.
        Assert.Equal(10.0, ws.Cell(8, 7).GetDouble());
        Assert.Equal("G8*1.05", ws.Cell(8, 17).FormulaA1);
        // Tổng nhóm hệ + TỔNG CỘNG cộng thêm cột Q, F/G/H giữ nguyên như mẫu.
        Assert.Equal("SUBTOTAL(9,G8:G10)", ws.Cell(7, 7).FormulaA1);
        Assert.Equal("SUBTOTAL(9,Q8:Q10)", ws.Cell(7, 17).FormulaA1);
        Assert.Equal("TỔNG CỘNG", ws.Cell(11, 3).GetString());
        Assert.Equal("SUBTOTAL(9,G7:G10)", ws.Cell(11, 7).FormulaA1);
        Assert.Equal("SUBTOTAL(9,Q7:Q10)", ws.Cell(11, 17).FormulaA1);
    }

    [Fact]
    public void Sheet_phu_tong_hop_vung_cong_bang_SUMIFS_song()
    {
        using var wb = GhiRoiDocLai(KetQuaVung());

        Assert.Equal(2, wb.Worksheets.Count);
        var ws = wb.Worksheet(BoqExcelWriter.SheetVung);
        Assert.Equal("VÙNG", ws.Cell(3, 1).GetString());
        Assert.Equal("Tầng 5", ws.Cell(4, 1).GetString());
        Assert.Equal("Ống gió cấp", ws.Cell(4, 3).GetString());
        Assert.Equal("duct-supp", ws.Cell(4, 7).GetString());
        Assert.Equal("SUMIFS('Data-BOQ'!G:G,'Data-BOQ'!L:L,$A4,'Data-BOQ'!O:O,$G4)", ws.Cell(4, 5).FormulaA1);
        Assert.Equal("SUMIFS('Data-BOQ'!Q:Q,'Data-BOQ'!L:L,$A4,'Data-BOQ'!O:O,$G4)", ws.Cell(4, 6).FormulaA1);
        Assert.Equal("Tầng 6", ws.Cell(5, 1).GetString());
    }

    [Fact]
    public void Sidecar_JSON_ghi_kem_size_vung_nguon_size_va_KL_quy_doi()
    {
        var json = TakeoffJsonReport.TuKetQua(KetQuaVung(), Meta).ToJson();

        Assert.Contains("\"size\": \"300x200\"", json);
        Assert.Contains("\"vung\": \"Tầng 5\"", json);
        Assert.Contains("\"nguonSize\": \"XData\"", json);
        Assert.Contains("\"khoiLuong\": 10", json);
        Assert.Contains("\"klQuyDoi\": 10.5", json);
        Assert.Contains("\"moTaQuyDoi\": \"hao hụt 5%\"", json);
    }

    [Fact]
    public void Dong_cach_nhiet_ghi_ro_la_tinh_ra_chu_khong_do_truc_tiep()
    {
        var cachNhiet = new TakeoffItem
        {
            Id = "duct-insu", Group = "HVAC", Name = "Cách nhiệt ống gió", Spec = "Bảo ôn", Unit = "m2",
            Measure = "area", LayerMatchAny = [], Factor = 1, BoqCode = "",
            DerivedFrom = "duct-supp", Formula = "perimeter*length",
        };
        var kq = new TakeoffCalculator(Bo(OngTheoSize, cachNhiet), "v6")
            .Compute([Tuyen("A", 10_000, "300x200", "")], insUnits: 4);

        using var wb = GhiRoiDocLai(kq);
        var ws = wb.Worksheet("Data-BOQ");

        Assert.Equal("Cách nhiệt ống gió 300x200", ws.Cell(9, 3).GetString());
        Assert.Equal(10.0, ws.Cell(9, 7).GetDouble());
        Assert.Contains("TÍNH RA từ \"duct-supp\"", ws.Cell(9, 9).GetString());
    }
}
