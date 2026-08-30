using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §6 bước 2 / FR1 — phần logic THUẦN của hộp thoại <c>XBOSS_TUYEN_GAN</c>: lọc tuyến còn
/// thiếu thuộc tính, suy hệ từ layer qua <c>layerMap</c>, và bộ điều kiện khóa nút OK.
/// Dùng rule pack ĐANG PHÁT HÀNH (không dựng pack giả) để test và plugin không lệch nhau.
/// </summary>
public class TuyenGanViewModelTests
{
    private static DrawToolsPack Pack() => DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));

    private static TuyenTrongVungChon Tuyen(
        string handle, string layer, string? he = null, string? size = null, double? caoDo = null) =>
        new(handle, layer, he, size, caoDo);

    // ===== Lọc tuyến còn thiếu thuộc tính =====

    [Fact]
    public void Tuyen_thieu_thuoc_tinh_liet_ke_dung_ba_thuoc_tinh_bat_buoc()
    {
        Assert.Equal(["hệ", "cỡ", "cao độ"], Tuyen("A", "M-DUCT-SUPP").ThuocTinhThieu);
        Assert.Equal(["cỡ", "cao độ"], Tuyen("A", "M-DUCT-SUPP", "HVAC").ThuocTinhThieu);
        Assert.Equal(["cao độ"], Tuyen("A", "M-DUCT-SUPP", "HVAC", "300x200").ThuocTinhThieu);
        Assert.Empty(Tuyen("A", "M-DUCT-SUPP", "HVAC", "300x200", 3000).ThuocTinhThieu);
    }

    [Fact]
    public void Danh_sach_trong_hop_thoai_chi_giu_tuyen_con_thieu()
    {
        var vm = new TuyenGanDialogViewModel(Pack(),
        [
            Tuyen("DU", "M-DUCT-SUPP", "HVAC", "300x200", 3000),
            Tuyen("THIEU-CO", "M-DUCT-SUPP", "HVAC", caoDo: 3000),
            Tuyen("THIEU-HET", "M-DUCT-SUPP"),
        ]);

        Assert.Equal(["THIEU-CO", "THIEU-HET"], vm.CacTuyenThieu.Select(m => m.Tuyen.Handle));
        Assert.Contains("2/3", vm.TomTat);
        // Cỡ trống vẫn hiện trong nhãn để kỹ sư biết thiếu gì, không lặng lẽ giấu đi.
        Assert.Contains("thiếu: cỡ", vm.CacTuyenThieu[0].Nhan);
    }

    [Fact]
    public void Khong_tuyen_nao_thieu_thi_danh_sach_rong_va_van_gan_duoc()
    {
        var vm = new TuyenGanDialogViewModel(Pack(),
            [Tuyen("A", "M-DUCT-SUPP", "HVAC", "300x200", 3000)]);
        Assert.Empty(vm.CacTuyenThieu);
        Assert.Contains("không tuyến nào thiếu", vm.TomTat);
    }

    // ===== Suy hệ từ layer (FR1) =====

    [Fact]
    public void Layer_khop_layerMap_thi_dien_san_he()
    {
        var pack = Pack();
        var vm = new TuyenGanDialogViewModel(pack, [Tuyen("A", "M-DUCT-SUPP"), Tuyen("B", "M-DUCT-RETN")]);

        Assert.Equal("HVAC", vm.HeSuyTuLayer);
        Assert.Equal("HVAC", vm.He?.Id);
        Assert.Contains("HVAC", vm.MoTaSuyHe);
    }

    [Fact]
    public void Layer_khong_khop_thi_khong_suy_he()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "0"), Tuyen("B", "LAYER-LA")]);
        Assert.Null(vm.HeSuyTuLayer);
        Assert.Contains("Không layer nào", vm.MoTaSuyHe);
    }

    [Fact]
    public void Hai_nhom_hoa_nhau_thi_khong_suy_he_thay_ky_su()
    {
        // 1 tuyến HVAC + 1 tuyến PCCC ⇒ hòa 1–1: thà để kỹ sư chọn còn hơn điền sẵn ngẫu nhiên.
        var pack = Pack();
        var he = TuyenGanDialogViewModel.SuyHeTuLayer(pack,
            [Tuyen("A", "M-DUCT-SUPP"), Tuyen("B", "M-FIRE-SPRK")]);
        Assert.Null(he);
    }

    [Fact]
    public void He_do_phien_nho_thang_hon_he_suy_tu_layer()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")], heId: "PIPING");
        Assert.Equal("HVAC", vm.HeSuyTuLayer); // gợi ý vẫn hiện...
        Assert.Equal("PIPING", vm.He?.Id);      // ...nhưng lựa chọn của phiên thắng
    }

    // ===== Khóa nút OK =====

    [Fact]
    public void Vung_chon_rong_thi_khoa_ok()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), []);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không có tuyến nào"));
    }

    [Fact]
    public void Thieu_cao_do_thi_khoa_ok_va_neu_ly_do()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")]);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("cao độ"));

        vm.CaoDo = "3000";
        Assert.True(vm.CoTheOk);
        Assert.Equal(3000, vm.KetQua()!.CaoDoMm);
    }

    [Fact]
    public void Cao_do_khong_phai_so_thi_khoa_ok()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")]) { CaoDo = "ba nghìn" };
        Assert.Null(vm.CaoDoMm);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không phải số"));
    }

    // ===== Danh mục kiểu nối + cỡ =====

    [Fact]
    public void Kieu_noi_lay_dung_khoa_jointRules_cua_loai_tuyen_dang_chon()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")]) { CaoDo = "3000" };
        var mongDoi = vm.Tuyen!.JointRules?.Hardware.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList();

        Assert.NotNull(mongDoi);
        Assert.NotEmpty(mongDoi!);
        Assert.Equal(mongDoi, vm.CacKieuNoi);
        Assert.Contains(vm.KieuNoi, mongDoi!); // mở sẵn ở mục đầu danh mục
        Assert.Equal(vm.KieuNoi, vm.KetQua()!.KieuNoi);
    }

    [Fact]
    public void Doi_he_thi_lam_moi_loai_tuyen_co_va_kieu_noi()
    {
        var pack = Pack();
        var vm = new TuyenGanDialogViewModel(pack, [Tuyen("A", "M-DUCT-SUPP")]) { CaoDo = "3000" };
        var kieuNoiHvac = vm.KieuNoi;

        vm.He = pack.DrawTools.Systems.First(s => s.Id == "PIPING");
        Assert.Equal(vm.CacLoaiTuyen.FirstOrDefault(), vm.Tuyen);
        Assert.Contains(vm.Size, vm.CacSize);
        Assert.NotEqual(kieuNoiHvac, vm.KieuNoi); // hai hệ khai kiểu nối khác nhau
    }

    [Fact]
    public void Co_ngoai_danh_muc_thi_canh_bao_custom_nhung_van_gan_duoc()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")])
        {
            CaoDo = "3000",
            Size = "1234x999",
        };
        Assert.True(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
        Assert.True(vm.KetQua()!.SizeTuNhap);
        Assert.Contains(vm.CanhBao, c => c.Contains("ngoài danh mục"));
    }

    [Fact]
    public void Tuyen_da_co_thuoc_tinh_thi_canh_bao_ghi_de()
    {
        var vm = new TuyenGanDialogViewModel(Pack(),
            [Tuyen("A", "M-DUCT-SUPP", "HVAC", "300x200", 3000)]);
        Assert.Contains(vm.CanhBao, c => c.Contains("GHI ĐÈ"));
    }

    // ===== Vật liệu / cách nhiệt: không bắt buộc =====

    [Fact]
    public void Vat_lieu_va_cach_nhiet_de_trong_thi_ket_qua_la_null()
    {
        var vm = new TuyenGanDialogViewModel(Pack(), [Tuyen("A", "M-DUCT-SUPP")]) { CaoDo = "3000" };
        Assert.True(vm.CoTheOk);
        Assert.Null(vm.KetQua()!.VatLieu);
        Assert.Null(vm.KetQua()!.CachNhiet);

        vm.VatLieu = " tôn tráng kẽm ";
        vm.CachNhiet = "PE 25mm";
        Assert.Equal("tôn tráng kẽm", vm.KetQua()!.VatLieu);
        Assert.Equal("PE 25mm", vm.KetQua()!.CachNhiet);
    }
}
