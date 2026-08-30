using Xunit;
using XBoss.Cad.Core.Ui.ViewModels;

namespace XBoss.Cad.Tests;

/// <summary>
/// M108 PR4 — hộp thoại <c>XBOSS_VE_DEXUAT_LO</c>. Thuần .NET (khung M106) nên test được toàn bộ
/// hành vi trên CI Linux, không cần AutoCAD.
/// </summary>
public sealed class DeXuatLoDialogTests
{
    private static UngVienLoItem Nap(string ten, int soChen = 1) => new(ten, "M-DUCT-SUPP", soChen, null);

    private static UngVienLoItem Loai(string ten, string lyDo) => new(ten, "", 0, lyDo);

    [Fact]
    public void Chi_gui_block_nap_duoc_va_dem_dung_so_bo_qua()
    {
        var vm = new DeXuatLoDialogViewModel(
            [Nap("FCU-01"), Loai("*U12", "Block ẩn danh."), Nap("AHU-02")],
            tranMoiLo: 500);

        Assert.Equal(2, vm.SoSeGui);
        Assert.Equal(1, vm.SoBoQua);
        Assert.Equal(["FCU-01", "AHU-02"], vm.SeGui.Select(u => u.TenBlock));
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Loc_chi_block_dang_dung_bo_dinh_nghia_chua_chen_o_dau()
    {
        var vm = new DeXuatLoDialogViewModel([Nap("DA-CHEN", 3), Nap("CHUA-CHEN", 0)], 500);
        Assert.Equal(2, vm.SoSeGui);

        vm.ChiBlockDangDung = true;
        Assert.Equal(["DA-CHEN"], vm.SeGui.Select(u => u.TenBlock));
        Assert.Equal(1, vm.SoBoQua);
    }

    [Fact]
    public void Khong_con_block_nao_thi_khoa_OK_kem_ly_do_doc_duoc()
    {
        var vm = new DeXuatLoDialogViewModel([Loai("*U1", "Block ẩn danh.")], 500);
        Assert.False(vm.CoTheOk);
        Assert.NotEmpty(vm.LyDoChuaHopLe);
        Assert.Contains("nạp được", vm.ThongDiep);

        var rong = new DeXuatLoDialogViewModel([], 500);
        Assert.False(rong.CoTheOk);
        Assert.Contains("không có định nghĩa block nào", rong.ThongDiep);
    }

    [Fact]
    public void Loc_het_sach_thi_khoa_OK_chu_khong_gui_lo_rong()
    {
        var vm = new DeXuatLoDialogViewModel([Nap("CHUA-CHEN", 0)], 500) { ChiBlockDangDung = true };
        Assert.Equal(0, vm.SoSeGui);
        Assert.False(vm.CoTheOk);
    }

    [Fact]
    public void Vuot_tran_thi_cat_bot_nhung_PHAI_noi_ra_khong_im_lang()
    {
        var vm = new DeXuatLoDialogViewModel(
            [.. Enumerable.Range(1, 7).Select(i => Nap($"B{i}"))],
            tranMoiLo: 5);

        Assert.Equal(5, vm.SoSeGui);
        Assert.True(vm.CoTheOk, "vẫn gửi được — chỉ là gửi phần đầu");
        // Cảnh báo phải nêu ĐỦ SỐ: có bao nhiêu, gửi bao nhiêu, còn lại bao nhiêu.
        var canhBao = Assert.Single(vm.CanhBao);
        Assert.Contains("7", canhBao);
        Assert.Contains("5", canhBao);
        Assert.Contains("2", canhBao);
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
    }

    [Fact]
    public void Doi_bo_loc_thi_moi_con_so_suy_ra_deu_cap_nhat_theo()
    {
        var vm = new DeXuatLoDialogViewModel([Nap("A", 2), Nap("B", 0)], 500);
        var daBao = new List<string>();
        vm.PropertyChanged += (_, e) => daBao.Add(e.PropertyName ?? "");

        vm.ChiBlockDangDung = true;

        Assert.Contains(nameof(vm.SoSeGui), daBao);
        Assert.Contains(nameof(vm.TomTat), daBao);
        Assert.Contains("2", vm.TomTat); // tệp có 2 định nghĩa
    }
}
