using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại nhóm BÓC &amp; NỘP (<c>XBOSS_BOCKL</c>,
/// <c>XBOSS_BOCKL_XOA</c>, <c>XBOSS_BOCKL_XUAT</c>).
/// </summary>
public class BocKlDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_toan_bo_va_khong_chia_vung_dung_thoi_quen_cu()
    {
        var vm = new BocKlDialogViewModel("v9");

        Assert.Equal(PhamViBoc.ToanBo, vm.PhamVi);
        Assert.False(vm.ChiaVung);
        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua()!;
        Assert.Equal(PhamViBoc.ToanBo, kq.PhamVi);
        Assert.False(kq.ChiaVung);
    }

    [Fact]
    public void Chon_vung_va_chia_vung_thi_mo_ta_viec_tiep_theo_noi_du_hai_buoc()
    {
        var vm = new BocKlDialogViewModel("v9") { LaChonVung = true, ChiaVung = true };

        Assert.Equal(PhamViBoc.ChonVung, vm.PhamVi);
        Assert.Contains("quét chọn", vm.MoTaViecTiepTheo, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("ranh giới", vm.MoTaViecTiepTheo, StringComparison.OrdinalIgnoreCase);
        var kq = vm.KetQua()!;
        Assert.Equal(PhamViBoc.ChonVung, kq.PhamVi);
        Assert.True(kq.ChiaVung);
    }

    [Fact]
    public void Khong_chia_vung_thi_noi_ro_ket_qua_gop_chung()
    {
        var vm = new BocKlDialogViewModel("v9");

        Assert.Contains("gộp chung", vm.MoTaViecTiepTheo, StringComparison.Ordinal);
    }
}

/// <summary>M106 PR3 · AC9 — ViewModel hộp thoại <c>XBOSS_BOCKL_XOA</c>.</summary>
public class BocKlXoaDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_go_dau_toan_bo_va_luon_bam_OK_duoc()
    {
        var vm = new BocKlXoaDialogViewModel();

        Assert.Equal(PhamViBoc.ToanBo, vm.PhamVi);
        Assert.True(vm.CoTheOk);
        Assert.Equal(PhamViBoc.ToanBo, vm.KetQua()!.PhamVi);
        Assert.Contains("TOÀN BỘ", vm.MoTaViecTiepTheo, StringComparison.Ordinal);
    }

    [Fact]
    public void Doi_sang_chon_vung_thi_ket_qua_va_mo_ta_doi_theo()
    {
        var vm = new BocKlXoaDialogViewModel { LaChonVung = true };

        Assert.Equal(PhamViBoc.ChonVung, vm.KetQua()!.PhamVi);
        Assert.Contains("quét chọn", vm.MoTaViecTiepTheo, StringComparison.OrdinalIgnoreCase);
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_BOCKL_XUAT</c>.</summary>
public class BocKlXuatDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_lay_ten_du_an_va_goi_thau_da_nho()
    {
        var vm = new BocKlXuatDialogViewModel("TT AVIO", "MEP-ACMV", daGhepThietBi: true);

        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua()!;
        Assert.Equal("TT AVIO", kq.TenDuAn);
        Assert.Equal("MEP-ACMV", kq.GoiThau);
        Assert.False(kq.DoiChieuBoq); // mặc định KHÔNG kéo BOQ — hành vi y hệt trước M101 PR4
    }

    [Fact]
    public void Chua_nho_gi_thi_khoa_OK_kem_du_hai_ly_do()
    {
        var vm = new BocKlXuatDialogViewModel(null, null, daGhepThietBi: false);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Equal(2, vm.LyDoChuaHopLe.Count);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("tên dự án", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("gói thầu", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Doi_chieu_BOQ_khi_chua_ghep_thiet_bi_chi_canh_bao_chu_khong_khoa_OK()
    {
        var vm = new BocKlXuatDialogViewModel("TT AVIO", "MEP-ACMV", daGhepThietBi: false)
        {
            DoiChieuBoq = true,
        };

        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("bảng bóc vẫn xuất", StringComparison.Ordinal));
        Assert.Contains("XBOSS_LOGIN", vm.MoTaDoiChieu, StringComparison.Ordinal);
    }

    [Fact]
    public void Doi_chieu_BOQ_khi_da_ghep_thiet_bi_thi_khong_canh_bao()
    {
        var vm = new BocKlXuatDialogViewModel("TT AVIO", "MEP-ACMV", daGhepThietBi: true)
        {
            DoiChieuBoq = true,
        };

        Assert.True(vm.CoTheOk);
        Assert.Empty(vm.CanhBao);
        Assert.True(vm.KetQua()!.DoiChieuBoq);
    }
}
