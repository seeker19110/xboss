using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_CHUANHOA</c>: diff xem trước hiện CHỈ ĐỌC,
/// bản vẽ đã đạt chuẩn thì khóa OK kèm lý do (thay vì cho chạy một lệnh không sửa gì).
/// </summary>
public class ChuanHoaDialogViewModelTests
{
    [Fact]
    public void Co_lech_chuan_thi_bam_OK_duoc_va_canh_bao_ban_ve_se_bi_sua()
    {
        var vm = new ChuanHoaDialogViewModel("v9", ["Layer sai chuẩn: 12", "Text sai font: 3"]);

        Assert.True(vm.CoTheOk);
        Assert.NotNull(vm.KetQua());
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains("2 nhóm lệch chuẩn", vm.TomTat, StringComparison.Ordinal);
        Assert.Contains(vm.CanhBao, c => c.Contains("UNDO", StringComparison.Ordinal));
        Assert.Contains("v9", vm.MoTa, StringComparison.Ordinal);
    }

    [Fact]
    public void Ban_ve_da_dat_chuan_thi_khoa_OK_kem_ly_do()
    {
        var vm = new ChuanHoaDialogViewModel("v9", []);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không có gì để chuẩn hóa", StringComparison.Ordinal));
    }

    [Fact]
    public void Danh_sach_xem_truoc_giu_nguyen_thu_tu_lenh_dua_vao()
    {
        IReadOnlyList<string> dong = ["A: 1", "B: 2", "C: 3"];
        var vm = new ChuanHoaDialogViewModel("v9", dong);

        Assert.Equal(dong, vm.DongXemTruoc);
    }
}

/// <summary>M106 PR3 · AC9 — ViewModel hộp thoại <c>XBOSS_BATCH</c> (chọn chế độ).</summary>
public class BatchDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_la_che_do_chi_kiem_an_toan_nhat()
    {
        var vm = new BatchDialogViewModel("v9");

        Assert.Equal(CheDoBatch.KiemTra, vm.CheDo);
        Assert.True(vm.LaKiemTra);
        Assert.True(vm.CoTheOk);
        Assert.Equal(CheDoBatch.KiemTra, vm.KetQua()!.CheDo);
        Assert.Contains("không sửa", vm.MoTaCheDo, StringComparison.Ordinal);
    }

    [Fact]
    public void Doi_che_do_thi_ba_co_radio_va_mo_ta_deu_cap_nhat()
    {
        var vm = new BatchDialogViewModel("v9") { LaChuanHoa = true };

        Assert.Equal(CheDoBatch.ChuanHoa, vm.CheDo);
        Assert.False(vm.LaKiemTra);
        Assert.False(vm.LaBocKL);
        Assert.Contains("GIỮ NGUYÊN", vm.MoTaCheDo, StringComparison.Ordinal);

        vm.LaBocKL = true;

        Assert.Equal(CheDoBatch.BocKL, vm.CheDo);
        Assert.False(vm.LaChuanHoa);
        Assert.Contains("Excel tổng", vm.MoTaCheDo, StringComparison.Ordinal);
    }

    [Fact]
    public void Bo_chon_mot_radio_khong_lam_mat_lua_chon_hien_tai()
    {
        // WPF gán IsChecked = false cho radio bị bỏ chọn — không được coi đó là "chọn cái khác".
        var vm = new BatchDialogViewModel("v9") { LaChuanHoa = true };

        vm.LaChuanHoa = false;

        Assert.Equal(CheDoBatch.ChuanHoa, vm.CheDo);
    }
}
