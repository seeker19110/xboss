using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR7 — nội dung bảng thống kê sinh trong bản vẽ (§6.9, FR9f): thiết bị từ attribute,
/// khối lượng từ trạng thái bóc XBOSS_BOCKL.
/// </summary>
public class ThongKeTableTests
{
    private static readonly CadRulePack Pack = RepoPaths.LoadRulePack();

    [Fact]
    public void Bang_thiet_bi_xep_theo_he_roi_tag_va_danh_stt()
    {
        var bang = ThongKeTable.ThietBi(
        [
            new ThietBiThongKe("FCU-05-02", "FC-40", "400x200", "HVAC", "FCU"),
            new ThietBiThongKe("FCU-05-01", "FC-40", "400x200", "HVAC", "FCU"),
            new ThietBiThongKe("SPK-05-01", "", "DN15", "FIREFIGHTING", "SPK"),
        ]);

        Assert.Equal(LoaiBangThongKe.ThietBi, bang.Loai);
        Assert.Equal(["STT", "TAG", "MODEL", "SIZE", "HỆ", "BLOCK"], bang.Cot);
        Assert.Equal(3, bang.Dong.Count);
        Assert.Equal("SPK-05-01", bang.Dong[0][1]); // FIREFIGHTING đứng trước HVAC theo mã hệ
        Assert.Equal("FCU-05-01", bang.Dong[1][1]);
        Assert.Equal("FCU-05-02", bang.Dong[2][1]);
        Assert.Equal(["1", "2", "3"], bang.Dong.Select(d => d[0]));
        Assert.Equal(5, bang.SoHang); // 3 dòng + tiêu đề bảng + tên cột
    }

    [Fact]
    public void Thiet_bi_chua_co_tag_van_vao_bang_kem_ghi_chu()
    {
        var bang = ThongKeTable.ThietBi([new ThietBiThongKe("", "", "", "HVAC", "FCU")]);

        Assert.Equal("(chưa đánh tag)", bang.Dong[0][1]);
    }

    [Fact]
    public void Bang_khoi_luong_lay_dung_so_lieu_da_boc()
    {
        var may = new TakeoffCalculator(Pack.Takeoff, Pack.Version);
        var kq = may.Compute(
        [
            new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 10_000 },
            new MeasuredObject { Handle = "F1", Layer = "0", Kind = MeasuredKind.Block, BlockName = "FCU" },
        ], insUnits: 4);

        var bang = ThongKeTable.KhoiLuong(kq);

        Assert.Equal(LoaiBangThongKe.KhoiLuong, bang.Loai);
        Assert.Contains(Pack.Version, bang.TieuDe);
        Assert.Equal(2, bang.Dong.Count);
        Assert.All(bang.Dong, d => Assert.Equal("HVAC", d[1]));
        var ongGio = bang.Dong.Single(d => d[4] == "m");
        Assert.Equal("10.00", ongGio[5]); // 10.000 mm = 10.00 m
        var fcu = bang.Dong.Single(d => d[4] == "Bộ");
        Assert.Equal("1.00", fcu[5]);
    }

    [Fact]
    public void Ma_loai_bang_di_ve_khong_mat_nghia()
    {
        Assert.Equal(LoaiBangThongKe.ThietBi, ThongKeTable.TuMa(ThongKeTable.Ma(LoaiBangThongKe.ThietBi)));
        Assert.Equal(LoaiBangThongKe.KhoiLuong, ThongKeTable.TuMa(ThongKeTable.Ma(LoaiBangThongKe.KhoiLuong)));
        Assert.Null(ThongKeTable.TuMa("bang-la"));
        Assert.Null(ThongKeTable.TuMa(null));
    }
}
