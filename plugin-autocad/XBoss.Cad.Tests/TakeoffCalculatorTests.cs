using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

public class TakeoffCalculatorTests
{
    private static readonly CadRulePack Pack = RepoPaths.LoadRulePack();
    private static readonly TakeoffCalculator May = new(Pack.Takeoff, Pack.Version);

    private static MeasuredObject Ong(string handle, double daiMm, string layer = "M-DUCT-SUPP", bool daBoc = false) =>
        new() { Handle = handle, Layer = layer, Kind = MeasuredKind.Curve, RawLength = daiMm, AlreadyMarked = daBoc };

    [Fact]
    public void AC10_tong_chieu_dai_nhan_factor_lam_tron_o_tong()
    {
        // 3 đoạn ống gió cấp: 1234.567 + 2345.678 + 895.5 = 4475.745mm → 4.475745m → 4.48 (làm tròn 2)
        var kq = May.Compute([Ong("A", 1234.567), Ong("B", 2345.678), Ong("C", 895.5)], insUnits: 4);
        var line = Assert.Single(kq.Lines);
        Assert.Equal("duct-supp", line.Item.Id);
        Assert.Equal(3, line.ObjectCount);
        Assert.Equal(4.48, line.Quantity);
        Assert.Equal(["A", "B", "C"], line.Handles);
        Assert.Equal(0, kq.SkippedMarkedCount);
    }

    [Fact]
    public void Lam_tron_chi_o_tong_khong_lam_tron_tung_doi_tuong()
    {
        // 3 đoạn 1004mm: nếu làm tròn từng đoạn (1.00m) tổng = 3.00; đúng phải là 3012mm → 3.01m.
        var kq = May.Compute([Ong("A", 1004), Ong("B", 1004), Ong("C", 1004)], insUnits: 4);
        Assert.Equal(3.01, Assert.Single(kq.Lines).Quantity);
    }

    [Fact]
    public void AC10_chay_lai_bo_qua_doi_tuong_da_danh_dau()
    {
        var kq = May.Compute([Ong("A", 1000, daBoc: true), Ong("B", 2000, daBoc: true), Ong("C", 3000, daBoc: true)], 4);
        Assert.Empty(kq.Lines);
        Assert.Equal(3, kq.SkippedMarkedCount);
    }

    [Fact]
    public void AC13_quy_doi_don_vi_ban_ve_met()
    {
        // Bản vẽ INSUNITS=6 (m): đoạn 4.475745 (m) phải ra đúng như bản vẽ mm 4475.745mm.
        var kq = May.Compute([Ong("A", 4.475745)], insUnits: 6);
        Assert.Equal(4.48, Assert.Single(kq.Lines).Quantity);
        var canhBao = Assert.Single(kq.Warnings, w => w.Kind == TakeoffWarningKind.DrawingUnit);
        Assert.Contains("INSUNITS=6", canhBao.ThongDiep);
    }

    [Fact]
    public void Dem_block_theo_ten_goc_moi_layer()
    {
        var fcu1 = new MeasuredObject { Handle = "F1", Layer = "BAT_KY", Kind = MeasuredKind.Block, BlockName = "FCU-01" };
        var fcu2 = new MeasuredObject { Handle = "F2", Layer = "KHAC", Kind = MeasuredKind.Block, BlockName = "FCU-02" };
        var bom = new MeasuredObject { Handle = "B1", Layer = "KHAC", Kind = MeasuredKind.Block, BlockName = "PUMP-01" };
        var kq = May.Compute([fcu1, fcu2, bom], 4);
        var line = Assert.Single(kq.Lines);
        Assert.Equal("fcu-unit", line.Item.Id);
        Assert.Equal(2, line.ObjectCount);
        Assert.Equal(2, line.Quantity); // count làm tròn 0 chữ số
    }

    [Fact]
    public void Duong_tren_layer_khong_khop_item_nao_thi_bo_qua()
    {
        var kq = May.Compute([Ong("A", 5000, layer: "ZZZ_LAYER_LA")], 4);
        Assert.Empty(kq.Lines);
    }

    [Fact]
    public void Xref_skipped_count_di_vao_ket_qua()
    {
        var kq = May.Compute([Ong("A", 1000)], 4, xrefSkippedCount: 7);
        Assert.Equal(7, kq.XrefSkippedCount);
    }

    [Fact]
    public void Cac_he_khac_nhau_ra_dong_rieng_theo_thu_tu_rule_pack()
    {
        var kq = May.Compute(
        [
            Ong("P1", 1000, "P-PIPE-DOMW"),
            Ong("D1", 2000, "M-DUCT-SUPP"),
            Ong("S1", 3000, "F-SPRN-PIPE"),
        ], 4);
        // Thứ tự dòng = thứ tự items trong rule pack: duct-supp trước pipe-domw trước sprn-pipe.
        Assert.Equal(["duct-supp", "pipe-domw", "sprn-pipe"], kq.Lines.Select(l => l.Item.Id).ToArray());
    }

    [Fact]
    public void AC9_polyline_ho_tren_layer_dien_tich_khong_do_va_canh_bao()
    {
        // Rule pack v2 chưa có item area — dựng section takeoff cục bộ để kiểm hành vi area.
        var takeoff = new TakeoffSection
        {
            DrawingUnitAssumption = "mm",
            MarkColorAci = 92,
            XdataAppName = "XBOSS_BOCKL",
            Rounding = new TakeoffRounding { Length = 2, Area = 2, Count = 0 },
            Items =
            [
                new TakeoffItem
                {
                    Id = "bao-on", Group = "HVAC", Name = "Bảo ôn", Spec = "", Unit = "m2",
                    Measure = "area", LayerMatchAny = ["M-INSU-AREA"], Factor = 1e-6, BoqCode = "",
                },
            ],
        };
        var may = new TakeoffCalculator(takeoff, "test");
        var kin = new MeasuredObject { Handle = "K", Layer = "M-INSU-AREA", Kind = MeasuredKind.Curve, IsClosed = true, RawArea = 2_500_000 };
        var ho = new MeasuredObject { Handle = "H", Layer = "M-INSU-AREA", Kind = MeasuredKind.Curve, IsClosed = false, RawLength = 999 };
        var kq = may.Compute([kin, ho], 4);
        var line = Assert.Single(kq.Lines);
        Assert.Equal(1, line.ObjectCount);
        Assert.Equal(2.5, line.Quantity); // 2.5e6 mm² → 2.5 m²
        var canhBao = Assert.Single(kq.Warnings, w => w.Kind == TakeoffWarningKind.OpenPolylineSkipped);
        Assert.Equal(["H"], canhBao.Handles);
    }

    [Fact]
    public void FR16_ComputeAssigned_gop_theo_itemId_da_luu_trong_xdata()
    {
        var kq = May.ComputeAssigned(
        [
            (Ong("A", 12_000), "duct-supp"),
            (Ong("B", 8_000), "duct-supp"),
            (Ong("C", 5_000, "P-PIPE-DOMW"), "pipe-domw"),
            (Ong("D", 999), "item-da-xoa-khoi-rule-pack"),
        ], insUnits: 4);
        Assert.Equal(2, kq.Lines.Count);
        Assert.Equal(20.0, kq.Lines[0].Quantity);
        Assert.Equal(5.0, kq.Lines[1].Quantity);
        var canhBao = Assert.Single(kq.Warnings);
        Assert.Equal(["D"], canhBao.Handles);
        Assert.Contains("không còn trong rule pack", canhBao.ThongDiep);
    }

    [Fact]
    public void Khop_nhieu_item_chi_tinh_item_dau_va_canh_bao()
    {
        var takeoff = new TakeoffSection
        {
            DrawingUnitAssumption = "mm",
            MarkColorAci = 92,
            XdataAppName = "XBOSS_BOCKL",
            Rounding = new TakeoffRounding { Length = 2, Area = 2, Count = 0 },
            Items =
            [
                new TakeoffItem { Id = "a", Group = "G", Name = "A", Spec = "", Unit = "m", Measure = "length", LayerMatchAny = ["ONG"], Factor = 0.001, BoqCode = "" },
                new TakeoffItem { Id = "b", Group = "G", Name = "B", Spec = "", Unit = "m", Measure = "length", LayerMatchAny = ["ONG-CHINH"], Factor = 0.001, BoqCode = "" },
            ],
        };
        var may = new TakeoffCalculator(takeoff, "test");
        var obj = new MeasuredObject { Handle = "X", Layer = "ONG-CHINH", Kind = MeasuredKind.Curve, RawLength = 1000 };
        var kq = may.Compute([obj], 4);
        var line = Assert.Single(kq.Lines);
        Assert.Equal("a", line.Item.Id);
        var canhBao = Assert.Single(kq.Warnings, w => w.Kind == TakeoffWarningKind.MultipleItemMatch);
        Assert.Contains("a + b", canhBao.ThongDiep);
    }
}
