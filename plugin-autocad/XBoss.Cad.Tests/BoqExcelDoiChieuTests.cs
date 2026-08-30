using ClosedXML.Excel;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.3 PR4 — sheet phụ <c>Doi-chieu</c>: KL BOQ hợp đồng (máy chủ) cạnh KL bóc, chênh lệch %
/// bằng CÔNG THỨC SỐNG. Chỉ CỘNG THÊM: <c>Data-BOQ</c> (mẫu công ty) và <c>Tong-hop-vung</c> (PR3)
/// không đổi một ô nào. Round-trip ClosedXML như M99 §15.
/// </summary>
public class BoqExcelDoiChieuTests
{
    private static readonly BoqExcelMeta Meta = new()
    {
        TenDuAn = "BD1.6 - TT AVIO",
        GoiThau = "Hệ thống Cơ điện ACMV",
        TenBanVe = "MB-TANG-05.dwg",
        RulePackVersion = "v7",
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

    private static TakeoffItem OngGio(bool theoSize = false) => new()
    {
        Id = "duct-supp", Group = "HVAC", Name = "Ống gió cấp", Spec = "Tôn tráng kẽm", Unit = "m",
        Measure = "length", LayerMatchAny = ["M-DUCT-SUPP"], Factor = 0.001, BoqCode = "HVAC-01",
        GroupBySize = theoSize,
    };

    /// <summary>Bóc "trơn" (không bật khóa v6 nào) → Data-BOQ chỉ có cột A–K.</summary>
    private static TakeoffResult KetQuaTron() =>
        new TakeoffCalculator(Bo(OngGio()), "v7").Compute(
        [
            new MeasuredObject
            {
                Handle = "A", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 20_000,
            },
        ], insUnits: 4);

    /// <summary>Bóc theo size (v6) → Data-BOQ có thêm cột "Mã item" (O).</summary>
    private static TakeoffResult KetQuaTheoSize() =>
        new TakeoffCalculator(Bo(OngGio(theoSize: true)), "v7").Compute(
        [
            new MeasuredObject
            {
                Handle = "A", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 10_000,
                SizeXData = "300x200",
            },
            new MeasuredObject
            {
                Handle = "B", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 6_000,
                SizeXData = "400x300",
            },
        ], insUnits: 4);

    private static BoqSnapshot Snapshot(double? klHopDong = 120.5) => new()
    {
        ProjectId = 7,
        RulePackVersion = "v7",
        ChupLuc = "2026-08-25T02:00:00.000Z",
        Dong =
        [
            new BoqSnapshotDong
            {
                TakeoffItemId = "duct-supp", BoqCode = "HVAC-01",
                Ten = "Ống gió cấp tôn tráng kẽm", DonVi = "m", QtyContract = klHopDong,
            },
            new BoqSnapshotDong
            {
                TakeoffItemId = "chw-pipe", BoqCode = "HVAC-09", Ten = null, DonVi = null,
                QtyContract = null,
            },
        ],
    };

    private static XLWorkbook GhiRoiDocLai(TakeoffResult kq, BoqSnapshot? doiChieu)
    {
        var stream = new MemoryStream();
        BoqExcelWriter.Write(kq, Meta, stream, doiChieu);
        stream.Position = 0;
        return new XLWorkbook(stream);
    }

    [Fact]
    public void Khong_kem_doi_chieu_thi_tep_ra_y_het_truoc_PR4()
    {
        using var wb = GhiRoiDocLai(KetQuaTron(), null);
        Assert.Single(wb.Worksheets);
        Assert.False(wb.Worksheets.Contains(BoqExcelWriter.SheetDoiChieu));
    }

    [Fact]
    public void Snapshot_rong_thi_khong_sinh_sheet_trong()
    {
        var rong = new BoqSnapshot { ProjectId = 7, RulePackVersion = "v7", ChupLuc = "x", Dong = [] };
        using var wb = GhiRoiDocLai(KetQuaTron(), rong);
        Assert.False(wb.Worksheets.Contains(BoqExcelWriter.SheetDoiChieu));
    }

    [Fact]
    public void Sheet_doi_chieu_du_cot_va_chenh_lech_la_cong_thuc_song()
    {
        using var wb = GhiRoiDocLai(KetQuaTron(), Snapshot());
        var ws = wb.Worksheet(BoqExcelWriter.SheetDoiChieu);

        Assert.Equal("Mã BOQ", ws.Cell(4, 1).GetString());
        Assert.Contains("KL BOQ HỢP ĐỒNG", ws.Cell(4, 5).GetString());
        Assert.Contains("KL BÓC", ws.Cell(4, 6).GetString());

        // Dòng 1: có KL hợp đồng thật.
        Assert.Equal("HVAC-01", ws.Cell(5, 1).GetString());
        Assert.Equal("duct-supp", ws.Cell(5, 2).GetString());
        Assert.Equal(120.5, ws.Cell(5, 5).GetDouble());
        // KL bóc là SUMIF SỐNG về Data-BOQ (không phải số chết) — bóc trơn nên khóa là mã BOQ cột A.
        Assert.Contains("SUMIF('Data-BOQ'!A:A,$A5,'Data-BOQ'!G:G)", ws.Cell(5, 6).FormulaA1);
        Assert.Contains("E5-F5", ws.Cell(5, 7).FormulaA1);
        Assert.Contains("G5/E5", ws.Cell(5, 8).FormulaA1);

        // Dòng 2: chưa khớp dòng BOQ nào → ô KL hợp đồng TRỐNG (không phải 0) + nói rõ lý do.
        Assert.True(ws.Cell(6, 5).IsEmpty());
        Assert.Contains("chưa có dòng BOQ", ws.Cell(6, 3).GetString());

        // Nguồn số liệu ghi rõ để QS truy được: dự án + thời điểm chụp.
        Assert.Contains("#7", ws.Cell(2, 1).GetString());
        Assert.Contains("2026-08-25T02:00:00.000Z", ws.Cell(2, 1).GetString());
    }

    [Fact]
    public void Co_cot_ma_item_thi_cong_gop_theo_ma_item_de_gom_du_moi_dong_tach_size()
    {
        using var wb = GhiRoiDocLai(KetQuaTheoSize(), Snapshot());
        var ws = wb.Worksheet(BoqExcelWriter.SheetDoiChieu);
        // Cột O = "Mã item" của khối v6 — chính xác hơn khóa mã BOQ vì không phụ thuộc cột A.
        Assert.Contains("SUMIF('Data-BOQ'!O:O,$B5,'Data-BOQ'!G:G)", ws.Cell(5, 6).FormulaA1);
    }

    [Fact]
    public void Doi_KL_BOQ_tren_may_chu_thi_lan_xuat_sau_doi_theo_AC_e()
    {
        using var truoc = GhiRoiDocLai(KetQuaTron(), Snapshot(120.5));
        Assert.Equal(120.5, truoc.Worksheet(BoqExcelWriter.SheetDoiChieu).Cell(5, 5).GetDouble());

        using var sau = GhiRoiDocLai(KetQuaTron(), Snapshot(200));
        Assert.Equal(200, sau.Worksheet(BoqExcelWriter.SheetDoiChieu).Cell(5, 5).GetDouble());
    }

    [Fact]
    public void Hop_dong_mau_cong_ty_Data_BOQ_khong_doi_mot_o_nao_khi_them_sheet_doi_chieu()
    {
        using var khong = GhiRoiDocLai(KetQuaTron(), null);
        using var co = GhiRoiDocLai(KetQuaTron(), Snapshot());

        var a = khong.Worksheet("Data-BOQ");
        var b = co.Worksheet("Data-BOQ");
        for (var hang = 1; hang <= 12; hang++)
        {
            for (var cot = 1; cot <= 17; cot++)
            {
                var oA = a.Cell(hang, cot);
                var oB = b.Cell(hang, cot);
                Assert.Equal(oA.FormulaA1, oB.FormulaA1);
                // Chỉ so GIÁ TRỊ ở ô KHÔNG có công thức: ClosedXML tính lại cả workbook khi đọc
                // giá trị ô công thức và báo "cycle" trên chính mẫu công ty M99 (tái hiện được cả
                // khi KHÔNG có sheet Doi-chieu — quirk sẵn có của thư viện, không phải lỗi PR này).
                if (!oA.HasFormula) Assert.Equal(oA.GetString(), oB.GetString());
            }
        }
    }

    [Fact]
    public void Sheet_Tong_hop_vung_cua_PR3_van_nguyen_ven_khi_co_them_doi_chieu()
    {
        var theoVung = new TakeoffCalculator(Bo(OngGio(theoSize: true)), "v7").Compute(
        [
            new MeasuredObject
            {
                Handle = "A", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 10_000,
                SizeXData = "300x200", Vung = "Tầng 5",
            },
        ], insUnits: 4);

        using var wb = GhiRoiDocLai(theoVung, Snapshot());
        Assert.True(wb.Worksheets.Contains(BoqExcelWriter.SheetVung));
        Assert.True(wb.Worksheets.Contains(BoqExcelWriter.SheetDoiChieu));
        var vung = wb.Worksheet(BoqExcelWriter.SheetVung);
        Assert.Equal("VÙNG", vung.Cell(3, 1).GetString());
        Assert.Equal("Tầng 5", vung.Cell(4, 1).GetString());
        Assert.Contains("SUMIFS('Data-BOQ'!", vung.Cell(4, 5).FormulaA1);
    }
}
