using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 FR9 — cấp tầng/làn ở Core (<see cref="CapPhatLanTang"/>): cấp tuần tự, khe hở
/// <c>laneGapMm.elecToHot</c>, hết làn thì NÓI hết làn (AC7), gỡ chiếm chỗ trước khi dựng lại
/// (FR13). Phần đối chiếu với tầng TS nằm ở <see cref="RoutingDoiChungTests"/>.
/// </summary>
public class CapPhatLanTangTests
{
    private static readonly string[] HeDien = ["ELECTRICAL", "ELV"];

    private static RoutingPolicySection ChinhSach() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.RoutingPolicy!;

    private static HanhLangCapLan HanhLang(double beRong, IReadOnlyList<LanChiem>? so = null) =>
        new("HL-1", beRong, 3100, 2600, so);

    [Fact]
    public void Lan_dau_tien_cua_mot_tang_bat_dau_o_khe_ho_mac_dinh()
    {
        var cs = ChinhSach();

        var kq = CapPhatLanTang.Cap(cs, HanhLang(2400), [new YeuCauLan("HVAC", 600, 300)], HeDien);

        var lan = Assert.Single(kq.LanMoi);
        Assert.Equal("tier1", lan.TierId);
        Assert.Equal(cs.LaneGapMm.Default, lan.LanTuMm);
        Assert.Equal(cs.LaneGapMm.Default + 600, lan.LanDenMm);
        Assert.Equal(3100 - 30 - 300, lan.CaoDoMm); // đáy dầm − offsetFromBeamMm − chiều cao
        Assert.Empty(kq.KhongCap);
    }

    [Fact]
    public void He_chay_sau_doc_lanDaCap_cua_he_chay_truoc_va_nhan_lan_khac()
    {
        var cs = ChinhSach();
        var daCap = new List<LanChiem> { new("HVAC", "tier1", 100, 700, 2770) };

        var kq = CapPhatLanTang.Cap(
            cs, HanhLang(2400, daCap), [new YeuCauLan("HVAC", 400, 250)], HeDien);

        var lan = Assert.Single(kq.LanMoi);
        Assert.Equal(700 + cs.LaneGapMm.Default, lan.LanTuMm);
        Assert.Equal(2, kq.SoSauKhiCap.Count); // sổ giữ cả làn cũ lẫn làn mới (FR3)
    }

    [Fact]
    public void Lan_ke_he_dien_dung_khe_ho_elecToHot()
    {
        var cs = ChinhSach();

        var kq = CapPhatLanTang.Cap(
            cs,
            HanhLang(2400),
            [new YeuCauLan("ELECTRICAL", 300, 100), new YeuCauLan("ELV", 200, 80)],
            HeDien);

        Assert.Equal(2, kq.LanMoi.Count);
        var khe = kq.LanMoi[1].LanTuMm - kq.LanMoi[0].LanDenMm;
        Assert.Equal(cs.LaneGapMm.ElecToHot, khe);
        Assert.True(khe > cs.LaneGapMm.Default, "khe hở hệ điện phải rộng hơn khe mặc định");
    }

    [Fact]
    public void Tang_sat_tran_lay_cao_do_tu_tran_va_dat_giua_hanh_lang()
    {
        var cs = ChinhSach();

        var kq = CapPhatLanTang.Cap(cs, HanhLang(2000), [new YeuCauLan("FIREFIGHTING", 100, 100)], HeDien);

        var lan = Assert.Single(kq.LanMoi);
        Assert.Equal("sprinkler", lan.TierId);
        Assert.Equal(2600 + 80, lan.CaoDoMm);
        Assert.Equal(1000, lan.LanTuMm);
    }

    [Fact]
    public void Het_lan_thi_bao_het_lan_kem_he_dang_chiem_chu_khong_ep_chong_lan()
    {
        var cs = ChinhSach();
        var daCap = new List<LanChiem> { new("HVAC", "tier1", 100, 500, 2770) };

        var kq = CapPhatLanTang.Cap(
            cs, HanhLang(600, daCap), [new YeuCauLan("HVAC", 400, 200)], HeDien);

        Assert.Empty(kq.LanMoi);
        var loi = Assert.Single(kq.KhongCap);
        Assert.Equal("HL-1", loi.HanhLangId);
        Assert.Contains("hết làn", loi.LyDo);
        Assert.Contains("HVAC", loi.LyDo); // nêu đúng hệ đang chiếm (AC7)
        Assert.Equal(daCap, kq.SoSauKhiCap); // sổ KHÔNG bẩn khi không cấp được (NFR3)
    }

    [Fact]
    public void He_khong_nam_o_tier_nao_thi_khong_cap_va_khong_doan_bua()
    {
        var cs = ChinhSach();

        var kq = CapPhatLanTang.Cap(cs, HanhLang(2400), [new YeuCauLan("KHONG-CO", 100)], HeDien);

        Assert.Empty(kq.LanMoi);
        Assert.Contains("tier", Assert.Single(kq.KhongCap).LyDo);
    }

    [Fact]
    public void Go_chiem_cho_cua_mot_he_roi_cap_lai_ra_dung_lan_cu()
    {
        var cs = ChinhSach();
        var so = new List<LanChiem>
        {
            new("HVAC", "tier1", 100, 700, 2770),
            new("ELECTRICAL", "tier2", 100, 400, 2860),
        };

        var conLai = CapPhatLanTang.GoChiemCho(so, "ELECTRICAL");
        var kq = CapPhatLanTang.Cap(
            cs, HanhLang(2400, conLai), [new YeuCauLan("ELECTRICAL", 300, 100)], HeDien);

        Assert.Single(conLai);
        Assert.Equal(so[1], Assert.Single(kq.LanMoi)); // chạy lại không rò rỉ làn (FR13/AC9)
    }
}
