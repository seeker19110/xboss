using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M109 PR2 — hộp thoại ngắt nét giao chéo (FR7/FR10) và phần tóm tắt vùng chọn (FR1). Chạy trên
/// CI Linux: toàn bộ quyết định trên–dưới nằm ở Core, hộp thoại chỉ là lớp vẽ mỏng bind vào đây.
/// </summary>
public class NgatNetDialogViewModelTests
{
    private static readonly string[] Priority = ["HVAC", "PIPING", "FIREFIGHTING", "ELECTRICAL", "ELV"];

    private static readonly CrossingPolicySection ChinhSach = new()
    {
        Enabled = true,
        Priority = Priority,
        ClearanceMm = 50,
        JogRadiusMm = 150,
        LayerSuffix = "XING",
        MinAngleDeg = 15,
    };

    private static TuyenNgatNet Tuyen(
        string handle, string he, string item = "duct-supp", string size = "800x400",
        string edgeStyle = "double", double? beRong = 800) =>
        new(handle, he, item, size, $"M-{item}", edgeStyle, beRong);

    private static DongGiaoNgatNet Dong(
        TuyenNgatNet a, TuyenNgatNet b, bool daoTay = false, params Diem2[] diem) =>
        new(a, b, diem.Length > 0 ? diem : [new Diem2(0, 0)], Priority, daoTay);

    // ===== Trên–dưới theo priority (FR3) =====

    [Fact]
    public void He_hang_cao_hon_di_tren_khong_ke_thu_tu_doc_tu_ban_ve()
    {
        // Đọc theo thứ tự nào cũng ra cùng kết quả: HVAC đứng trước PIPING trong priority.
        var xuoi = Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING"));
        var nguoc = Dong(Tuyen("B2", "PIPING"), Tuyen("A1", "HVAC"));

        Assert.Equal("HVAC", xuoi.HeTren);
        Assert.Equal("PIPING", xuoi.HeDuoi);
        Assert.Equal("HVAC", nguoc.HeTren);
        Assert.Equal("PIPING", nguoc.HeDuoi);
        Assert.Equal("A1", xuoi.TuyenTren!.Handle);
        Assert.Equal("A1", nguoc.TuyenTren!.Handle);
    }

    [Fact]
    public void He_khong_khai_trong_priority_xep_sau_cung()
    {
        var dong = Dong(Tuyen("A1", "HE-LA"), Tuyen("B2", "ELV"));
        Assert.Equal("ELV", dong.HeTren);
        Assert.Equal("HE-LA", dong.HeDuoi);
    }

    // ===== Đảo tay thắng priority (FR7/AC5) =====

    [Fact]
    public void Dao_tay_lat_chieu_va_thang_priority()
    {
        var dong = Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING"));
        Assert.Equal("HVAC", dong.HeTren);

        dong.DaoTay = true;

        Assert.Equal("PIPING", dong.HeTren);
        Assert.Equal("HVAC", dong.HeDuoi);
        Assert.True(dong.QuyetDinh!.Value.TheoDaoTay);
        Assert.Contains("đảo tay", dong.MoTa, StringComparison.Ordinal);
    }

    [Fact]
    public void Dao_tay_doc_lai_tu_ban_ve_giu_nguyen_khi_chay_lai()
    {
        // AC5 — lần chạy sau dựng dòng với daoTay = true (đọc từ XData) thì chiều giữ nguyên.
        var dong = Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING"), daoTay: true);
        Assert.Equal("PIPING", dong.HeTren);
    }

    [Fact]
    public void Dao_tay_bao_cho_giao_dien_biet_de_ve_lai_dong()
    {
        var dong = Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING"));
        var daBao = new List<string>();
        dong.PropertyChanged += (_, e) => daBao.Add(e.PropertyName ?? "");

        dong.DaoTay = true;

        Assert.Contains(nameof(DongGiaoNgatNet.DaoTay), daBao);
        Assert.Contains(nameof(DongGiaoNgatNet.MoTa), daBao);
        Assert.Contains(nameof(DongGiaoNgatNet.HeTren), daBao);
    }

    // ===== Các ca KHÔNG ngắt nét (FR3) =====

    [Fact]
    public void Hai_tuyen_cung_he_khong_ngat_net_va_khong_dao_duoc()
    {
        var dong = Dong(
            Tuyen("A1", "PIPING", "pipe-domw", "DN100", "none", 100),
            Tuyen("B2", "PIPING", "pipe-sanr", "DN150", "none", 150));

        Assert.False(dong.CoTheDao);
        Assert.Contains("cùng hệ", dong.LyDoBoQua!, StringComparison.Ordinal);
        Assert.Contains("phụ kiện", dong.LyDoBoQua!, StringComparison.Ordinal);
        Assert.Null(dong.QuyetDinh);
        Assert.Null(dong.TuyenTren);
    }

    [Fact]
    public void Khong_doc_duoc_co_thi_khong_ngat_net_kem_ly_do_neu_dich_danh_tuyen()
    {
        var dong = Dong(
            Tuyen("A1", "HVAC", size: "cỡ lạ", beRong: null),
            Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100));

        Assert.False(dong.CoTheDao);
        Assert.Contains("A1", dong.LyDoBoQua!, StringComparison.Ordinal);
        Assert.Contains("không đoán", dong.LyDoBoQua!, StringComparison.Ordinal);
        Assert.DoesNotContain("B2", dong.LyDoBoQua!, StringComparison.Ordinal);
    }

    // ===== Đa giao (§11) =====

    [Fact]
    public void Dem_da_giao_chi_tinh_cho_co_tu_3_tuyen_tro_len()
    {
        var a = Tuyen("A1", "HVAC");
        var b = Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100);
        var c = Tuyen("C3", "ELECTRICAL", "tray-pwr", "300x100", "double", 300);

        // Ba tuyến cùng cắt nhau quanh (1000, 1000) — trong cùng một ô 1 đơn vị.
        var dong = new List<DongGiaoNgatNet>
        {
            Dong(a, b, false, new Diem2(1000.1, 1000.1)),
            Dong(a, c, false, new Diem2(1000.2, 1000.3)),
            Dong(b, c, false, new Diem2(1000.4, 1000.2)),
        };
        Assert.Equal(1, NgatNetDaGiao.Dem(dong, 1));

        // Chỉ hai tuyến giao nhau ở một chỗ thì KHÔNG phải đa giao.
        Assert.Equal(0, NgatNetDaGiao.Dem([Dong(a, b, false, new Diem2(1000.1, 1000.1))], 1));

        // Ba tuyến nhưng ba chỗ giao xa nhau ⇒ không có ô nào đủ 3 tuyến.
        var raiRac = new List<DongGiaoNgatNet>
        {
            Dong(a, b, false, new Diem2(0, 0)),
            Dong(a, c, false, new Diem2(5000, 0)),
            Dong(b, c, false, new Diem2(0, 5000)),
        };
        Assert.Equal(0, NgatNetDaGiao.Dem(raiRac, 1));
    }

    // ===== ViewModel =====

    [Fact]
    public void Danh_sach_rong_thi_khoa_OK_kem_ly_do()
    {
        var vm = new NgatNetDialogViewModel([], ChinhSach, 1);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không có cặp tuyến nào giao nhau", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Toan_bo_la_cap_cung_he_thi_khoa_OK()
    {
        var vm = new NgatNetDialogViewModel(
            [
                Dong(
                    Tuyen("A1", "PIPING", "pipe-domw", "DN100", "none", 100),
                    Tuyen("B2", "PIPING", "pipe-sanr", "DN150", "none", 150)),
            ],
            ChinhSach, 1);

        Assert.False(vm.CoTheOk);
        Assert.Equal(1, vm.SoCungHe);
        Assert.Equal(0, vm.SoNgatDuoc);
    }

    [Fact]
    public void Tom_tat_dem_dung_cap_diem_giao_va_pham_vi_mac_dinh_la_ca_ban_ve()
    {
        var vm = new NgatNetDialogViewModel(
            [
                Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100),
                    false, new Diem2(0, 0), new Diem2(500, 0)),
                Dong(Tuyen("A1", "HVAC"), Tuyen("C3", "ELV", "tray-elv", "200x100", "double", 200)),
            ],
            ChinhSach, 1);

        Assert.True(vm.CoTheOk);
        Assert.Equal(2, vm.SoNgatDuoc);
        Assert.Equal(3, vm.SoDiemGiao);
        Assert.Equal(PhamViNgatNet.ToanBanVe, vm.PhamVi);
        Assert.True(vm.ToanBanVe);
        Assert.False(vm.ChonTay);

        var kq = vm.KetQua();
        Assert.NotNull(kq);
        Assert.Equal(PhamViNgatNet.ToanBanVe, kq!.PhamVi);
        Assert.Equal(2, kq.Dong.Count);
    }

    [Fact]
    public void Doi_pham_vi_sang_chon_tay_doi_ghi_chu_va_giu_OK()
    {
        var vm = new NgatNetDialogViewModel(
            [Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100))],
            ChinhSach, 1);

        vm.ChonTay = true;

        Assert.Equal(PhamViNgatNet.ChonTay, vm.PhamVi);
        Assert.Contains("quét chọn", vm.GhiChuPhamVi, StringComparison.Ordinal);
        Assert.Equal(PhamViNgatNet.ChonTay, vm.KetQua()!.PhamVi);
    }

    [Fact]
    public void Dao_tay_mot_dong_cap_nhat_ngay_canh_bao_cua_ca_form()
    {
        var dong = Dong(Tuyen("A1", "HVAC"), Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100));
        var vm = new NgatNetDialogViewModel([dong], ChinhSach, 1);
        Assert.Equal(0, vm.SoDaoTay);

        dong.DaoTay = true;

        Assert.Equal(1, vm.SoDaoTay);
        Assert.Contains(vm.CanhBao, c => c.Contains("ĐẢO TAY", StringComparison.Ordinal));
        Assert.True(vm.CoTheOk); // đảo tay là cảnh báo, KHÔNG chặn
    }

    [Fact]
    public void Canh_bao_da_giao_va_cap_bo_qua_khong_chan_OK()
    {
        var a = Tuyen("A1", "HVAC");
        var b = Tuyen("B2", "PIPING", "pipe-domw", "DN100", "none", 100);
        var c = Tuyen("C3", "ELECTRICAL", "tray-pwr", "300x100", "double", 300);
        var vm = new NgatNetDialogViewModel(
            [
                Dong(a, b, false, new Diem2(0, 0)),
                Dong(a, c, false, new Diem2(0.1, 0.1)),
                Dong(b, c, false, new Diem2(0.2, 0.2)),
                Dong(
                    Tuyen("D4", "PIPING", "pipe-domw", "DN100", "none", 100),
                    Tuyen("E5", "PIPING", "pipe-sanr", "DN150", "none", 150)),
            ],
            ChinhSach, 1);

        Assert.True(vm.CoTheOk);
        Assert.Equal(1, vm.SoDaGiao);
        Assert.Contains(vm.CanhBao, x => x.Contains("đa giao", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(vm.CanhBao, x => x.Contains("không ngắt nét", StringComparison.OrdinalIgnoreCase));
    }

    // ===== Tóm tắt vùng chọn (FR1) =====

    [Fact]
    public void Tom_tat_vung_chon_dem_bo_qua_theo_tung_ly_do()
    {
        var tomTat = new TomTatChonNgatNet(
            SoTim: 4, SoKhongCoXData: 2, SoVaiTroKhac: 3, SoThuocXref: 1);

        Assert.Equal(4, tomTat.TongTim);
        Assert.Equal(6, tomTat.TongBoQua);
        Assert.Equal(3, tomTat.DongBoQua.Count);
        Assert.Contains(tomTat.DongBoQua, d => d.StartsWith("2 đối tượng", StringComparison.Ordinal));
        Assert.Contains(tomTat.DongBoQua, d => d.Contains("xref", StringComparison.Ordinal));
        Assert.Contains("4 tuyến", tomTat.MoTaSeXet, StringComparison.Ordinal);
    }

    [Fact]
    public void Tom_tat_vung_chon_bo_dong_co_so_khong()
    {
        var tomTat = new TomTatChonNgatNet(SoTim: 2);
        Assert.Empty(tomTat.DongBoQua);
        Assert.Equal(0, tomTat.TongBoQua);
    }

    [Fact]
    public void Moi_ly_do_bo_qua_deu_co_nhan_tieng_Viet()
    {
        foreach (var lyDo in Enum.GetValues<LyDoBoQuaNgatNet>())
            Assert.False(string.IsNullOrWhiteSpace(TomTatChonNgatNet.Nhan(lyDo)), $"{lyDo}: thiếu nhãn");
    }
}
