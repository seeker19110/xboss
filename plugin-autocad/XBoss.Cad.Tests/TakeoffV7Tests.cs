using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR5 — rule pack v7 khai 2 item ĐẾM cho giá đỡ/lỗ chờ (AC12, §6.8). Hai điều phải đúng
/// cùng lúc: (1) bản vẽ có block giá đỡ/sleeve thì <c>XBOSS_BOCKL</c> ĐẾM ĐƯỢC (trước v7 hụt hẳn
/// hạng mục này); (2) bản vẽ KHÔNG có block nào khớp thì v7 ra kết quả y hệt v6 — phát hành
/// version mới không được làm đổi số của các bản vẽ cũ.
/// </summary>
public class TakeoffV7Tests
{
    private static readonly CadRulePack V6 =
        RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v6.json")));

    private static CadRulePack V7 => RepoPaths.LoadRulePack();

    private static MeasuredObject Block(string handle, string ten, string layer = "0") => new()
    {
        Handle = handle, Layer = layer, Kind = MeasuredKind.Block, BlockName = ten,
    };

    private static MeasuredObject Tuyen(string handle, string layer, double daiMm) => new()
    {
        Handle = handle, Layer = layer, Kind = MeasuredKind.Curve, RawLength = daiMm,
    };

    private static TakeoffResult Boc(CadRulePack pack, params MeasuredObject[] doiTuong) =>
        new TakeoffCalculator(pack.Takeoff, pack.Version).Compute(doiTuong, 4);

    [Fact]
    public void V7_dem_duoc_gia_do_va_lo_cho_theo_ten_block_thu_vien()
    {
        var kq = Boc(
            V7,
            Block("G1", "XB-SUP-DUCT", "M-DUCT-SUPP"),
            Block("G2", "XB-SUP-DUCT", "M-DUCT-SUPP"),
            Block("G3", "XB-SUP-PIPE", "M-CHW-PIPE"),
            Block("S1", "XB-SLEEVE-W", "P-PIPE-SANR"));

        var giaDo = kq.Lines.Single(l => l.Item.Id == "support-hanger");
        Assert.Equal(3, giaDo.Quantity);
        Assert.Equal(3, giaDo.ObjectCount);
        Assert.Equal(1, kq.Lines.Single(l => l.Item.Id == "sleeve-opening").Quantity);
        // Giá đỡ nằm TRÊN layer tuyến — không được kéo theo mét ống nào vào dòng đếm.
        Assert.DoesNotContain(kq.Lines, l => l.Item.Id == "duct-supp");
    }

    [Fact]
    public void AC12_muoi_met_ong_gio_sau_XBOSS_VE_GIADO_dem_ra_dung_6()
    {
        // Nối tiếp AC12: SupportSpacing đặt 6 giá đỡ (5 khoảng × 2000 ≤ 2400) → bóc phải ra 6.
        var doiTuong = Enumerable.Range(1, 6)
            .Select(i => Block($"G{i}", "XB-SUP-DUCT", "M-DUCT-SUPP"))
            .Append(Tuyen("T1", "M-DUCT-SUPP", 10_000))
            .ToArray();

        var kq = Boc(V7, doiTuong);
        Assert.Equal(6, kq.Lines.Single(l => l.Item.Id == "support-hanger").Quantity);
        Assert.Equal(10.0, kq.Lines.Single(l => l.Item.Id == "duct-supp").Quantity);
    }

    [Fact]
    public void V7_giu_nguyen_ket_qua_v6_tren_ban_ve_khong_co_gia_do_sleeve()
    {
        MeasuredObject[] doiTuong =
        [
            Tuyen("T1", "M-DUCT-SUPP", 12_345.6),
            Tuyen("T2", "M-CHW-PIPE", 7_654.4),
            Block("F1", "FCU-12"),
            Block("E1", "XB-DUCT-ELBOW", "M-DUCT-SUPP"),
            Block("G1", "XB-GRL-SUP", "M-DUCT-SUPP"), // miệng gió cấp: KHÔNG được nhận là giá đỡ
        ];

        var kq6 = Boc(V6, doiTuong);
        var kq7 = Boc(V7, doiTuong);

        Assert.Equal(
            kq6.Lines.Select(l => (l.Item.Id, l.ObjectCount, l.Quantity)).ToArray(),
            kq7.Lines.Select(l => (l.Item.Id, l.ObjectCount, l.Quantity)).ToArray());
        Assert.Equal(
            kq6.Warnings.Select(w => w.ThongDiep).ToArray(),
            kq7.Warnings.Select(w => w.ThongDiep).ToArray());
    }

    [Fact]
    public void V7_khong_lam_doi_hanh_vi_cac_item_cu()
    {
        // Thứ tự first-match: item cũ vẫn giành trước, và không đối tượng nào khớp 2 item
        // (cảnh báo "khớp nhiều item" phải im lặng).
        var kq = Boc(V7, Block("S1", "SPK-01", "F-SPRN-PIPE"), Block("F1", "FCU-12"));
        Assert.Equal(1, kq.Lines.Single(l => l.Item.Id == "spk-head").Quantity);
        Assert.Equal(1, kq.Lines.Single(l => l.Item.Id == "fcu-unit").Quantity);
        Assert.DoesNotContain(kq.Warnings, w => w.ThongDiep.Contains("khớp nhiều item"));
    }

    [Fact]
    public void Plugin_cu_van_nap_duoc_v6_sau_khi_phat_hanh_v7()
    {
        // Append-only: phát hành v7 KHÔNG được đụng tệp cũ (M100 §17 rollback = quay lại version cũ).
        Assert.Equal("v6", V6.Version);
        Assert.Equal(12, V6.Takeoff.Items.Count);
        Assert.Equal(14, V7.Takeoff.Items.Count);
    }
}
