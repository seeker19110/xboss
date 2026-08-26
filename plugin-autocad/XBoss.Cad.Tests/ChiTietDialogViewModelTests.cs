using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại nhóm CHI TIẾT CHẾ TẠO (<c>XBOSS_VE_GIADO</c>,
/// <c>XBOSS_VE_LOCHO</c>, <c>XBOSS_VE_TAG</c>).
/// </summary>
public class GiaDoDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static BlockDef Block(string id) => new()
    {
        Id = id,
        BlockName = $"XB_{id.ToUpperInvariant()}",
        Kind = "support",
    };

    private static GiaDoDialogViewModel Vm(bool coKhaiPhuKienNang, IReadOnlyList<HeCoBlock>? cacHe = null)
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        return new GiaDoDialogViewModel(
            "lib-v3", "v9",
            cacHe ?? [new HeCoBlock(hvac, [Block("duct-supp-hanger")], [])],
            coKhaiPhuKienNang,
            coKhaiPhuKienNang ? ["valve", "damper"] : []);
    }

    [Fact]
    public void Mac_dinh_la_cach_chia_KHONGVUOT_dung_luat_treo_do()
    {
        var vm = Vm(coKhaiPhuKienNang: true);

        Assert.Equal(CheDoChiaGiaDo.KhongVuot, vm.CheDo);
        Assert.True(vm.LaKhongVuot);
        Assert.True(vm.CoTheOk);
        Assert.Contains("an toàn tuyệt đối", vm.MoTaCheDo, StringComparison.Ordinal);
    }

    [Fact]
    public void Rule_pack_v7_tro_len_thi_khong_hoi_phu_kien_nang_va_ket_qua_luon_false()
    {
        var vm = Vm(coKhaiPhuKienNang: true);

        Assert.False(vm.CanHoiTaiPhuKien);
        Assert.False(vm.KetQua()!.TaiMoiPhuKien);
        Assert.Contains("valve, damper", vm.MoTaPhuKienNang, StringComparison.Ordinal);
    }

    [Fact]
    public void Rule_pack_cu_thi_van_hoi_phu_kien_nang_va_mac_dinh_la_Co()
    {
        var vm = Vm(coKhaiPhuKienNang: false);

        Assert.True(vm.CanHoiTaiPhuKien);
        Assert.True(vm.TaiMoiPhuKien);
        Assert.True(vm.KetQua()!.TaiMoiPhuKien);
        Assert.Contains("heavyFittingIds", vm.MoTaPhuKienNang, StringComparison.Ordinal);

        vm.TaiMoiPhuKien = false;
        Assert.False(vm.KetQua()!.TaiMoiPhuKien);
    }

    [Fact]
    public void Doi_sang_GANNHAT_thi_mo_ta_doi_theo()
    {
        var vm = Vm(coKhaiPhuKienNang: true);
        vm.LaGanNhat = true;

        Assert.Equal(CheDoChiaGiaDo.GanNhat, vm.KetQua()!.CheDo);
        Assert.Contains("ít giá đỡ hơn", vm.MoTaCheDo, StringComparison.Ordinal);
    }

    [Fact]
    public void Khoang_cach_gia_do_hien_chi_doc_va_khong_co_o_nhap()
    {
        var vm = Vm(coKhaiPhuKienNang: true);

        Assert.Contains("supportSpacingMm", vm.MoTaKhoangCach, StringComparison.Ordinal);
        Assert.Contains("không tự bịa", vm.MoTaKhoangCach, StringComparison.Ordinal);
    }

    [Fact]
    public void Thu_vien_khong_co_block_gia_do_nao_thi_khoa_OK_kem_ly_do()
    {
        var vm = Vm(coKhaiPhuKienNang: true, cacHe: []);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("kind=support", StringComparison.Ordinal));
    }

    [Fact]
    public void Doi_he_thi_block_dat_lai_theo_he_moi()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var piping = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");
        var vm = Vm(true, [
            new HeCoBlock(hvac, [Block("duct-hanger")], []),
            new HeCoBlock(piping, [Block("pipe-clamp")], []),
        ]);

        vm.He = vm.CacHe[1];

        Assert.Equal("pipe-clamp", vm.Block!.Id);
        Assert.Equal("PIPING", vm.KetQua()!.He.Id);
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_LOCHO</c>.</summary>
public class LoChoDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_la_che_do_chen_sleeve()
    {
        var vm = new LoChoDialogViewModel(0);

        Assert.Equal(CheDoLoCho.Chen, vm.CheDo);
        Assert.True(vm.CoTheOk);
        Assert.Equal(CheDoLoCho.Chen, vm.KetQua()!.CheDo);
        Assert.Contains("sleeveClearanceMm", vm.MoTaCheDo, StringComparison.Ordinal);
    }

    [Fact]
    public void Xuat_bang_khi_chua_co_lo_cho_nao_thi_khoa_OK_kem_ly_do()
    {
        var vm = new LoChoDialogViewModel(0) { LaXuatBang = true };

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa có lỗ chờ nào", StringComparison.Ordinal));
    }

    [Fact]
    public void Da_co_lo_cho_thi_xuat_bang_duoc_va_hien_dung_so_luong()
    {
        var vm = new LoChoDialogViewModel(7) { LaXuatBang = true };

        Assert.True(vm.CoTheOk);
        Assert.Equal(CheDoLoCho.XuatBang, vm.KetQua()!.CheDo);
        Assert.Contains("7 lỗ chờ", vm.MoTaCheDo, StringComparison.Ordinal);
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_TAG</c>.</summary>
public class TagDialogViewModelTests
{
    [Fact]
    public void Mac_dinh_la_QUET_va_khong_hoi_tang()
    {
        var vm = new TagDialogViewModel("{floor}-{loai}-{so}", 12, null);

        Assert.Equal(CheDoTag.Quet, vm.CheDo);
        Assert.False(vm.CanTang);
        Assert.True(vm.CoTheOk);
        Assert.Contains("{floor}-{loai}-{so}", vm.MoTa, StringComparison.Ordinal);
    }

    [Fact]
    public void Danh_lai_ma_chua_co_tang_thi_khoa_OK_kem_ly_do()
    {
        var vm = new TagDialogViewModel("{floor}-{so}", 12, null) { LaDanhLai = true };

        Assert.True(vm.CanTang);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa nhập tầng", StringComparison.Ordinal));

        vm.Tang = "T05";

        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua()!;
        Assert.Equal(CheDoTag.DanhLai, kq.CheDo);
        Assert.Equal(PhamViTag.ToanBo, kq.PhamVi);
        Assert.Equal("T05", kq.Tang);
    }

    [Fact]
    public void Tang_da_nho_trong_ban_ve_lam_mac_dinh()
    {
        var vm = new TagDialogViewModel("{floor}-{so}", 12, "T05") { LaDanhLai = true };

        Assert.Equal("T05", vm.Tang);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Chon_vung_thi_ket_qua_mang_dung_pham_vi()
    {
        var vm = new TagDialogViewModel("{floor}-{so}", 12, "T05")
        {
            LaDanhLai = true,
            LaChonVung = true,
        };

        Assert.Equal(PhamViTag.ChonVung, vm.KetQua()!.PhamVi);
    }

    [Fact]
    public void Ban_ve_chua_co_khoi_nao_mang_the_TAG_thi_quet_va_danh_lai_deu_bi_khoa()
    {
        var vm = new TagDialogViewModel("{floor}-{so}", 0, "T05");

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("XBOSS_VE_THIETBI", StringComparison.Ordinal));

        vm.LaDanhLai = true;
        Assert.False(vm.CoTheOk);

        // Khóa/mở khóa vẫn chạy được: kỹ sư tự chọn khối trên bản vẽ, không phụ thuộc bộ đếm này.
        vm.LaKhoa = true;
        Assert.True(vm.CoTheOk);
        Assert.Equal(CheDoTag.Khoa, vm.KetQua()!.CheDo);
    }

    [Fact]
    public void Mo_ta_che_do_noi_ro_viec_lam_tiep_theo_cua_tung_che_do()
    {
        var vm = new TagDialogViewModel("{floor}-{so}", 12, "T05");
        Assert.Contains("không sửa gì", vm.MoTaCheDo, StringComparison.Ordinal);

        vm.LaDanhLai = true;
        Assert.Contains("tag đã khóa", vm.MoTaCheDo, StringComparison.Ordinal);

        vm.LaMoKhoa = true;
        Assert.Contains("MỞ KHÓA", vm.MoTaCheDo, StringComparison.Ordinal);
    }
}
