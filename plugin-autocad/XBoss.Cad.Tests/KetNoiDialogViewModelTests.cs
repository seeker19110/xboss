using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại nhóm KẾT NỐI/NỘP (<c>XBOSS_LOGIN</c>,
/// <c>XBOSS_UPLOAD</c>): giá trị mặc định lấy từ thứ máy đã nhớ, quy tắc khóa nút OK kèm lý do
/// tiếng Việt, và ca dữ liệu thiếu phải cho lý do rõ chứ không văng lỗi.
/// </summary>
public class LoginDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_lay_dia_chi_da_nho_trong_may()
    {
        var vm = new LoginDialogViewModel("https://xboss.congty.vn");

        Assert.Equal("https://xboss.congty.vn", vm.BaseUrl);
        Assert.True(vm.CoTheOk);
        Assert.Equal("https://xboss.congty.vn", vm.KetQua()!.BaseUrl);
        Assert.Contains("XBOSS_LOGIN", vm.TieuDe, StringComparison.Ordinal);
    }

    [Fact]
    public void Chua_tung_ghep_thi_o_trong_va_khoa_OK_kem_ly_do()
    {
        var vm = new LoginDialogViewModel(null);

        Assert.Equal("", vm.BaseUrl);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Equal(MucThongDiep.Loi, vm.MucDo);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa nhập địa chỉ", StringComparison.Ordinal));
    }

    [Fact]
    public void Dia_chi_http_bi_khoa_OK_vi_token_khong_di_qua_http()
    {
        var vm = new LoginDialogViewModel("http://xboss.congty.vn");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("https://", StringComparison.Ordinal));
    }

    [Fact]
    public void Localhost_van_duoc_cho_moi_truong_dev()
    {
        var vm = new LoginDialogViewModel("http://localhost:3000");

        Assert.True(vm.CoTheOk);
        Assert.Equal("http://localhost:3000", vm.KetQua()!.BaseUrl);
    }

    [Fact]
    public void Chuoi_khong_phai_dia_chi_thi_cho_ly_do_ro_chu_khong_vang_loi()
    {
        var vm = new LoginDialogViewModel("xboss congty");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không phải một địa chỉ hợp lệ", StringComparison.Ordinal));
    }

    [Fact]
    public void Bo_dau_gach_cuoi_nhu_lenh_van_lam_truoc_khi_luu()
    {
        var vm = new LoginDialogViewModel("https://xboss.congty.vn/");

        Assert.Equal("https://xboss.congty.vn", vm.KetQua()!.BaseUrl);
    }

    [Fact]
    public void Sua_dia_chi_thi_trang_thai_OK_cap_nhat_ngay()
    {
        var vm = new LoginDialogViewModel(null);
        Assert.False(vm.CoTheOk);

        vm.BaseUrl = "https://xboss.congty.vn";

        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.Tot, vm.MucDo);
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_UPLOAD</c>.</summary>
public class UploadDialogViewModelTests
{
    [Fact]
    public void Thieu_ma_ban_ve_va_rev_thi_khoa_OK_kem_hai_ly_do()
    {
        var vm = new UploadDialogViewModel("T05-ACMV.dwg", ["báo cáo chuẩn hóa"]);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Equal(2, vm.LyDoChuaHopLe.Count);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("số bản vẽ", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("rev", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Du_ma_va_rev_thi_tra_dung_bo_tham_so()
    {
        var vm = new UploadDialogViewModel("T05-ACMV.dwg", ["báo cáo chuẩn hóa"])
        {
            MaBanVe = " ACMV-SD-T05-001 ",
            Rev = "B",
        };

        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua()!;
        Assert.Equal("ACMV-SD-T05-001", kq.MaBanVe);
        Assert.Equal("B", kq.Rev);
    }

    [Fact]
    public void Sidecar_hien_o_dang_chi_doc_va_khong_chan_OK_khi_thieu()
    {
        var vm = new UploadDialogViewModel("T05-ACMV.dwg", []) { MaBanVe = "#12", Rev = "A" };

        Assert.True(vm.CoTheOk); // thiếu sidecar là CẢNH BÁO, không phải lỗi
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains("Không có sidecar", vm.MoTaSidecar, StringComparison.Ordinal);
        Assert.Contains(vm.CanhBao, c => c.Contains("vẫn tải lên được", StringComparison.Ordinal));
    }

    [Fact]
    public void Co_sidecar_thi_liet_ke_du_ten_va_khong_canh_bao()
    {
        var vm = new UploadDialogViewModel(
            "T05-ACMV.dwg", ["báo cáo chuẩn hóa", "kết quả bóc khối lượng"])
        {
            MaBanVe = "ACMV-SD-T05-001",
            Rev = "A",
        };

        Assert.Empty(vm.CanhBao);
        Assert.Equal(MucThongDiep.Tot, vm.MucDo);
        Assert.Contains("báo cáo chuẩn hóa", vm.MoTaSidecar, StringComparison.Ordinal);
        Assert.Contains("kết quả bóc khối lượng", vm.MoTaSidecar, StringComparison.Ordinal);
    }
}
