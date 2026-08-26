using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại nhóm VẼ (<c>XBOSS_VE_NEN</c>, <c>XBOSS_VE_NHAN</c>,
/// <c>XBOSS_VE_DOI</c>, <c>XBOSS_VE_PHUKIEN</c>/<c>XBOSS_VE_THIETBI</c>). Danh mục dựng từ rule
/// pack v9 THẬT trong repo.
/// </summary>
public class VeNenDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    [Fact]
    public void Danh_muc_he_dung_theo_rule_pack_va_mac_dinh_la_he_dau()
    {
        var pack = Pack();
        var vm = new VeNenDialogViewModel(pack.DrawTools.Systems, pack.DrawTools.BaseFadePct);

        Assert.Equal(pack.DrawTools.Systems, vm.CacHe);
        Assert.Equal(pack.DrawTools.Systems[0].Id, vm.He!.Id);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Giu_he_dang_ve_cua_phien_lam_mac_dinh()
    {
        var pack = Pack();
        var vm = new VeNenDialogViewModel(pack.DrawTools.Systems, pack.DrawTools.BaseFadePct, "PIPING");

        Assert.Equal("PIPING", vm.He!.Id);
        Assert.Equal("PIPING", vm.KetQua()!.He.Id);
    }

    [Fact]
    public void Muc_lam_mo_va_so_layer_dich_hien_dang_chi_doc_theo_he_dang_chon()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = new VeNenDialogViewModel(pack.DrawTools.Systems, pack.DrawTools.BaseFadePct, "HVAC");

        Assert.Contains($"{pack.DrawTools.BaseFadePct}%", vm.MoTaViecSeLam, StringComparison.Ordinal);
        Assert.Contains($"{hvac.Lines.Count} layer đích", vm.MoTaViecSeLam, StringComparison.Ordinal);

        vm.He = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");

        Assert.Contains("Cấp thoát nước", vm.MoTaViecSeLam, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Rule_pack_khong_khai_he_nao_thi_cho_ly_do_ro_chu_khong_vang_loi()
    {
        var vm = new VeNenDialogViewModel([], 70);

        Assert.Null(vm.He);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("drawTools.systems", StringComparison.Ordinal));
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_NHAN</c> (tỉ lệ in của phiên).</summary>
public class VeNhanDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    [Fact]
    public void Chua_hoi_lan_nao_thi_lay_ti_le_dau_danh_muc_rule_pack()
    {
        var pack = Pack();
        var vm = new VeNhanDialogViewModel(pack.SheetSetup.Scales, 2.5, null);

        Assert.Equal(TiLeInDialog.DanhMuc(pack.SheetSetup.Scales), vm.CacTiLe);
        Assert.Equal(vm.CacTiLe[0], vm.TiLe);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Giu_ti_le_dang_dung_cua_phien_lam_mac_dinh()
    {
        var vm = new VeNhanDialogViewModel(Pack().SheetSetup.Scales, 2.5, 100);

        Assert.Equal("100", vm.TiLe);
        Assert.Equal(100, vm.KetQua()!.TiLeIn);
        Assert.Contains("cả phiên", vm.MoTaCaoChu, StringComparison.Ordinal);
    }

    [Fact]
    public void Cao_chu_suy_ra_tu_ti_le_va_cap_nhat_ngay_khi_doi()
    {
        var vm = new VeNhanDialogViewModel(Pack().SheetSetup.Scales, 2.5, 50);
        Assert.Contains("125mm trong mô hình", vm.MoTaCaoChu, StringComparison.Ordinal);

        vm.TiLe = "100";

        Assert.Contains("250mm trong mô hình", vm.MoTaCaoChu, StringComparison.Ordinal);
    }

    [Fact]
    public void Ti_le_khong_phai_so_duong_thi_khoa_OK_kem_ly_do()
    {
        var vm = new VeNhanDialogViewModel(Pack().SheetSetup.Scales, 2.5, 50) { TiLe = "to" };

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không hợp lệ", StringComparison.Ordinal));

        vm.TiLe = "0";
        Assert.False(vm.CoTheOk);

        vm.TiLe = "";
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa nhập tỉ lệ", StringComparison.Ordinal));
    }

    [Fact]
    public void Ti_le_ngoai_danh_muc_chi_canh_bao_chu_khong_khoa_OK()
    {
        var vm = new VeNhanDialogViewModel(Pack().SheetSetup.Scales, 2.5, 50) { TiLe = "37" };

        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("ngoài danh mục", StringComparison.Ordinal));
        Assert.Equal(37, vm.KetQua()!.TiLeIn);
    }

    [Fact]
    public void Rule_pack_khong_khai_scales_thi_canh_bao_chu_khong_vang_loi()
    {
        var vm = new VeNhanDialogViewModel([], 2.5, null);

        Assert.Empty(vm.CacTiLe);
        Assert.False(vm.CoTheOk); // chưa gõ gì thì vẫn thiếu tỉ lệ

        vm.TiLe = "50";

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("sheetSetup.scales", StringComparison.Ordinal));
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_DOI</c>.</summary>
public class VeDoiDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static VeDoiDialogViewModel Vm(
        int soTuyen = 3, int soDaBoc = 0, int soKhoiBam = 0, string? sizeCu = null, string? doDocCu = null)
    {
        var pack = Pack();
        return new VeDoiDialogViewModel(
            pack.DrawTools.Systems, pack.SheetSetup.Slopes, ["HVAC/duct-supp 300x200: 3 tuyến"],
            soTuyen, soDaBoc, soKhoiBam, sizeCu, doDocCu);
    }

    [Fact]
    public void Mac_dinh_lay_he_dau_va_size_dau_cua_loai_tuyen_dau()
    {
        var pack = Pack();
        var vm = Vm();

        Assert.Equal(pack.DrawTools.Systems[0].Id, vm.He!.Id);
        Assert.Equal(vm.Tuyen!.Sizes[0], vm.Size);
        Assert.False(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Giu_size_cu_khi_loai_tuyen_moi_cung_khai_size_do()
    {
        var pack = Pack();
        var sizeDau = pack.DrawTools.Systems[0].Lines[0].Sizes[0];
        var vm = Vm(sizeCu: sizeDau);

        Assert.Equal(sizeDau, vm.Size);
    }

    [Fact]
    public void Doi_he_thi_loai_tuyen_va_size_dat_lai_theo_he_moi()
    {
        var pack = Pack();
        var vm = Vm();

        vm.He = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");

        Assert.Equal("chw-pipe", vm.Tuyen!.ItemId);
        Assert.Equal(vm.Tuyen.Sizes[0], vm.Size);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Khong_co_tuyen_nao_dang_chon_thi_khoa_OK_kem_ly_do()
    {
        var vm = Vm(soTuyen: 0);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không có tuyến tim nào", StringComparison.Ordinal));
    }

    [Fact]
    public void Xoa_size_thi_khoa_OK_kem_ly_do_tieng_Viet()
    {
        var vm = Vm();

        vm.Size = "";

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa chọn size mới", StringComparison.Ordinal));
    }

    [Fact]
    public void Tuyen_slopeRequired_thieu_do_doc_thi_khoa_OK()
    {
        var pack = Pack();
        var piping = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");
        var vm = Vm();
        vm.He = piping;
        vm.Tuyen = piping.Lines.Single(l => l.ItemId == "pipe-sanr");
        Assert.True(vm.CanDoDoc);

        vm.DoDoc = "";

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("độ dốc", StringComparison.OrdinalIgnoreCase));

        vm.DoDoc = "2%";

        Assert.True(vm.CoTheOk);
        Assert.Equal("2%", vm.KetQua()!.DoDoc);
    }

    [Fact]
    public void Tuyen_khong_bat_buoc_do_doc_thi_ket_qua_khong_mang_do_doc()
    {
        var vm = Vm(doDocCu: "2%");

        Assert.False(vm.CanDoDoc);
        Assert.Null(vm.KetQua()!.DoDoc);
    }

    [Fact]
    public void Size_ngoai_danh_muc_bat_canh_bao_custom_nhung_van_bam_OK_duoc()
    {
        var vm = Vm();

        vm.Size = "777x333";

        Assert.True(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("custom", StringComparison.Ordinal));
        Assert.True(vm.KetQua()!.SizeTuNhap);
    }

    [Fact]
    public void He_qua_noi_du_go_dau_boc_xoa_chia_dot_va_block_dang_bam()
    {
        var vm = Vm(soDaBoc: 2, soKhoiBam: 5);

        Assert.Contains(vm.HeQua, h => h.Contains("ĐÃ BÓC KHỐI LƯỢNG", StringComparison.Ordinal));
        Assert.Contains(vm.HeQua, h => h.Contains("XBOSS_VE_CHIADOT", StringComparison.Ordinal));
        Assert.Contains(vm.HeQua, h => h.Contains("5 block", StringComparison.Ordinal));
        Assert.Contains(vm.CanhBao, c => c.Contains("gỡ dấu", StringComparison.Ordinal));
    }

    [Fact]
    public void Khong_tuyen_nao_da_boc_thi_he_qua_khong_nhac_toi_dau_boc()
    {
        var vm = Vm(soDaBoc: 0, soKhoiBam: 0);

        Assert.DoesNotContain(vm.HeQua, h => h.Contains("ĐÃ BÓC KHỐI LƯỢNG", StringComparison.Ordinal));
        Assert.Empty(vm.CanhBao);
    }

    [Fact]
    public void Rule_pack_khong_khai_he_nao_thi_cho_ly_do_ro()
    {
        var vm = new VeDoiDialogViewModel([], [], [], 3, 0, 0);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("drawTools.systems", StringComparison.Ordinal));
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel dùng chung của <c>XBOSS_VE_PHUKIEN</c>/<c>_THIETBI</c>.</summary>
public class ChonBlockDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static BlockDef Block(string id, bool scaleBySize = false, params string[] att) => new()
    {
        Id = id,
        BlockName = $"XB_{id.ToUpperInvariant()}",
        Kind = "fitting",
        ScaleBySize = scaleBySize,
        RotateToPath = true,
        Attributes = att,
    };

    private static ChonBlockDialogViewModel Vm(IReadOnlyList<HeCoBlock> cacHe, string? blockId = null) =>
        new("XBOSS_VE_PHUKIEN", "phụ kiện", "lib-v3", "Sau OK: bấm điểm trên tuyến.", cacHe, null, blockId);

    [Fact]
    public void Danh_muc_block_doi_theo_he_dang_chon()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var piping = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");
        var vm = Vm([
            new HeCoBlock(hvac, [Block("elbow"), Block("tee")], []),
            new HeCoBlock(piping, [Block("valve")], []),
        ]);

        Assert.Equal("HVAC", vm.He!.He.Id);
        Assert.Equal(2, vm.CacBlock.Count);
        Assert.Equal("elbow", vm.Block!.Id);

        vm.He = vm.CacHe[1];

        Assert.Single(vm.CacBlock);
        Assert.Equal("valve", vm.Block!.Id);
        Assert.Equal("PIPING", vm.KetQua()!.He.Id);
    }

    [Fact]
    public void Giu_block_chon_lan_truoc_trong_phien_lam_mac_dinh()
    {
        var hvac = Pack().DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = Vm([new HeCoBlock(hvac, [Block("elbow"), Block("tee")], [])], blockId: "tee");

        Assert.Equal("tee", vm.Block!.Id);
    }

    [Fact]
    public void Khong_he_nao_co_block_dung_duoc_thi_khoa_OK_kem_ly_do()
    {
        var vm = Vm([]);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("phụ kiện", StringComparison.Ordinal));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("lib-v3", StringComparison.Ordinal));
    }

    [Fact]
    public void Thu_vien_thieu_id_rule_pack_khai_thi_canh_bao_chu_khong_khoa_OK()
    {
        var hvac = Pack().DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = Vm([new HeCoBlock(hvac, [Block("elbow")], ["damper", "flex"])]);

        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("damper, flex", StringComparison.Ordinal));
    }

    [Fact]
    public void Thong_tin_suy_ra_cua_block_hien_dang_chi_doc()
    {
        var hvac = Pack().DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = Vm([new HeCoBlock(hvac, [Block("elbow", scaleBySize: true, "TAG", "MODEL")], [])]);

        Assert.Contains("tỉ lệ chèn tự suy từ size tuyến", vm.MoTaBlock, StringComparison.Ordinal);
        Assert.Contains("xoay theo hướng tuyến", vm.MoTaBlock, StringComparison.Ordinal);
        Assert.Contains("TAG, MODEL", vm.MoTaBlock, StringComparison.Ordinal);
        Assert.Contains("Sau OK", vm.MoTaBlock, StringComparison.Ordinal);
    }

    [Fact]
    public void He_khong_co_block_nao_thi_khoa_OK_kem_ly_do_rieng_cua_he_do()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = Vm([new HeCoBlock(hvac, [], [])]);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("chọn hệ khác", StringComparison.Ordinal));
    }
}
