using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 PR3 — hộp thoại <c>XBOSS_VE_HANHLANG</c> (FR1/FR2/FR4). Chạy trên CI Linux: toàn bộ quy
/// tắc khóa OK, quy ước "tick hết = mọi hệ" và các cảnh báo nằm ở Core, XAML chỉ bind vào đây.
/// </summary>
public class HanhLangDialogViewModelTests
{
    private static readonly RoutingPolicySection ChinhSach = new()
    {
        Enabled = true,
        CorridorLayer = "M-CORRIDOR",
        SnapRadiusMm = 4000,
        Tiers =
        [
            new RoutingTierSection { Id = "tier1", Name = "Sát đáy dầm", Systems = ["HVAC"], OffsetFromBeamMm = 30 },
            new RoutingTierSection { Id = "tier3", Name = "Ống nước", Systems = ["PIPING"], OffsetFromBeamMm = 240 },
        ],
        LaneGapMm = new LaneGapSection { Default = 100, ElecToHot = 150 },
    };

    private static readonly DrawSystem[] CacHe =
    [
        new() { Id = "HVAC", Name = "Điều hòa thông gió" },
        new() { Id = "PIPING", Name = "Cấp thoát nước" },
    ];

    private static HanhLangDialogViewModel Vm(
        CheDoHanhLang cheDo = CheDoHanhLang.VeMoi,
        TomTatChonHanhLang? tomTat = null,
        double? beRong = 600,
        double? cotDayDam = 3200,
        double? cotTran = 2800,
        IReadOnlyList<string>? heChoPhep = null,
        IReadOnlyList<LanChiem>? lanDaCap = null) =>
        new(cheDo, tomTat ?? new TomTatChonHanhLang(SoNhanMoi: 1), ChinhSach, CacHe,
            beRong, cotDayDam, cotTran, heChoPhep, lanDaCap);

    // ===== Kiểm hợp lệ (FR2) =====

    [Fact]
    public void Du_thuoc_tinh_thi_bam_OK_duoc_va_tra_dung_ket_qua()
    {
        var vm = Vm();
        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua();
        Assert.NotNull(kq);
        Assert.Equal(600, kq!.BeRongMm);
        Assert.Equal(3200, kq.CotDayDamMm);
        Assert.Equal(2800, kq.CotTranMm);
        Assert.Empty(kq.HeChoPhep); // tick hết = mọi hệ
        Assert.Equal(400, vm.ChieuCaoThongThuyMm);
    }

    [Fact]
    public void Be_rong_khong_duong_hoac_khong_phai_so_thi_khoa_OK()
    {
        var vm = Vm(beRong: null);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());

        vm.BeRong = "0";
        Assert.False(vm.CoTheOk);

        vm.BeRong = "sáu trăm";
        Assert.False(vm.CoTheOk);

        vm.BeRong = "600";
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Thieu_cao_do_thi_khoa_OK_kem_ly_do_tieng_Viet()
    {
        var vm = Vm(cotDayDam: null, cotTran: null);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("đáy dầm"));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("trần"));
        Assert.Null(vm.ChieuCaoThongThuyMm);
    }

    [Fact]
    public void Bo_tick_het_moi_he_thi_khoa_OK()
    {
        var vm = Vm();
        foreach (var h in vm.CacHe) h.Chon = false;
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("tick ít nhất một hệ"));
    }

    // ===== Quy ước "rỗng = mọi hệ" (FR2/FR3) =====

    [Fact]
    public void Chi_tick_mot_phan_thi_ket_qua_liet_ke_dung_he_do()
    {
        var vm = Vm();
        vm.CacHe.Single(h => h.Id == "PIPING").Chon = false;
        Assert.Equal(["HVAC"], vm.KetQua()!.HeChoPhep);
    }

    [Fact]
    public void He_cho_phep_moi_san_thi_chi_tick_dung_nhung_he_do()
    {
        var vm = Vm(heChoPhep: ["HVAC"]);
        Assert.True(vm.CacHe.Single(h => h.Id == "HVAC").Chon);
        Assert.False(vm.CacHe.Single(h => h.Id == "PIPING").Chon);
    }

    [Fact]
    public void Tick_lai_du_moi_he_thi_ket_qua_ve_rong()
    {
        var vm = Vm(heChoPhep: ["HVAC"]);
        vm.CacHe.Single(h => h.Id == "PIPING").Chon = true;
        Assert.Empty(vm.KetQua()!.HeChoPhep);
    }

    // ===== Cảnh báo không chặn =====

    [Fact]
    public void Day_dam_khong_cao_hon_tran_thi_canh_bao_nhung_van_chay_duoc()
    {
        var vm = Vm(cotDayDam: 2800, cotTran: 3200);
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("không cao hơn cao độ trần"));
    }

    [Fact]
    public void Khoang_tran_thap_hon_tang_sau_nhat_cua_rule_pack_thi_canh_bao()
    {
        var vm = Vm(cotDayDam: 3000, cotTran: 2900); // 100mm < offsetFromBeamMm 240 của tier3
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("tầng thấp nhất"));
    }

    [Fact]
    public void Be_rong_moi_nho_hon_lan_da_cap_thi_canh_bao_neu_dung_he()
    {
        var lan = new LanChiem[] { new("HVAC", "tier1", 100, 700, 3170) };
        var vm = Vm(cheDo: CheDoHanhLang.Sua, beRong: 600, lanDaCap: lan);

        Assert.True(vm.CoTheOk);
        Assert.True(vm.CoChiemCho);
        Assert.Contains(vm.CanhBao, c => c.Contains("HVAC"));
        Assert.Contains(vm.CanhBao, c => c.Contains("NHỎ HƠN mép làn đã cấp"));
        Assert.Single(vm.DongChiemCho);
    }

    // ===== Vùng chọn rỗng (FR1/FR4) =====

    [Fact]
    public void Che_do_nhan_ma_vung_chon_rong_thi_khoa_OK()
    {
        var vm = Vm(cheDo: CheDoHanhLang.Nhan, tomTat: new TomTatChonHanhLang(SoKhongPhaiPolyline: 3));
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không có polyline nào nhận được"));
    }

    [Fact]
    public void Che_do_sua_ma_khong_co_hanh_lang_nao_thi_khoa_OK()
    {
        var vm = Vm(cheDo: CheDoHanhLang.Sua, tomTat: new TomTatChonHanhLang(SoKhongPhaiHanhLang: 2));
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không có hành lang XBoss nào"));
    }

    [Fact]
    public void Che_do_ve_moi_khong_can_vung_chon()
    {
        var vm = Vm(cheDo: CheDoHanhLang.VeMoi, tomTat: new TomTatChonHanhLang());
        Assert.True(vm.CoTheOk);
        Assert.Contains("bấm điểm", vm.MoTaSeXuLy);
    }

    // ===== Tóm tắt vùng chọn =====

    [Fact]
    public void Tom_tat_dem_dung_va_moi_ly_do_bo_qua_mot_dong()
    {
        var tt = new TomTatChonHanhLang(
            SoNhanMoi: 2, SoDaLaHanhLang: 1,
            SoKhongPhaiPolyline: 3, SoCoDoanCung: 1, SoThuocXref: 4, SoDoiTuongXBoss: 2);

        Assert.Equal(3, tt.TongXuLy);
        Assert.Equal(10, tt.TongBoQua);
        Assert.Equal(4, tt.DongBoQua.Count);
        Assert.Contains(tt.DongBoQua, d => d.Contains("đoạn CUNG"));
        Assert.Contains("2 polyline nhận mới", tt.MoTaSeXuLy);
    }

    [Fact]
    public void Vung_chon_rong_thi_mo_ta_noi_ro_khong_co_gi()
    {
        Assert.Equal("Không có đối tượng nào dùng được trong vùng chọn.", new TomTatChonHanhLang().MoTaSeXuLy);
    }
}
