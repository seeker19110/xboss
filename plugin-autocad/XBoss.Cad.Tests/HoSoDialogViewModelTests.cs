using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 PR3 · AC2/AC9 — ViewModel hộp thoại nhóm HỒ SƠ BẢN VẼ (<c>XBOSS_VE_THONGKE</c>,
/// <c>XBOSS_VE_MATCAT</c>, <c>XBOSS_VE_TRANGIN</c>). Danh mục dựng từ rule pack v9 THẬT.
/// </summary>
public class ThongKeDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    [Fact]
    public void Mac_dinh_la_bang_thiet_bi_va_ti_le_cua_phien()
    {
        var vm = new ThongKeDialogViewModel(Pack().SheetSetup.Scales, 50);

        Assert.Equal(LoaiBangThongKeUi.ThietBi, vm.Loai);
        Assert.Equal("50", vm.TiLe);
        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua()!;
        Assert.Equal(LoaiBangThongKeUi.ThietBi, kq.Loai);
        Assert.Equal(50, kq.TiLeIn);
    }

    [Fact]
    public void Doi_loai_bang_thi_mo_ta_nguon_du_lieu_doi_theo()
    {
        var vm = new ThongKeDialogViewModel(Pack().SheetSetup.Scales, 50);
        Assert.Contains("TAG/MODEL/SIZE", vm.MoTaNguon, StringComparison.Ordinal);

        vm.LaKhoiLuong = true;
        Assert.Contains("XBOSS_BOCKL", vm.MoTaNguon, StringComparison.Ordinal);
        Assert.Equal(LoaiBangThongKeUi.KhoiLuong, vm.KetQua()!.Loai);

        vm.LaChiaDot = true;
        Assert.Contains("XBOSS_VE_CHIADOT", vm.MoTaNguon, StringComparison.Ordinal);
    }

    [Fact]
    public void Co_bang_cu_thi_noi_ro_se_cap_nhat_tai_cho_khong_hoi_vi_tri()
    {
        var vm = new ThongKeDialogViewModel(Pack().SheetSetup.Scales, 50, coBangCu: true);

        Assert.Contains("CẬP NHẬT tại chỗ", vm.MoTaNguon, StringComparison.Ordinal);
        Assert.DoesNotContain("bấm điểm đặt bảng", vm.MoTaNguon, StringComparison.Ordinal);
    }

    [Fact]
    public void Ti_le_sai_thi_khoa_OK_kem_ly_do()
    {
        var vm = new ThongKeDialogViewModel(Pack().SheetSetup.Scales, 50) { TiLe = "-5" };

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không hợp lệ", StringComparison.Ordinal));
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_MATCAT</c>.</summary>
public class MatCatDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static IReadOnlyList<TuyenCatQua> BaTuyen() =>
    [
        new("1A2", "duct-supp", "800x400"),
        new("1A3", "duct-retn", "600x300"),
        new("1A4", "chw-pipe", "DN50"),
    ];

    [Fact]
    public void Moi_tuyen_mot_dong_cao_do_dung_thu_tu_va_moi_san_gia_tri_lan_truoc()
    {
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, BaTuyen(), "A-A", 2700);

        Assert.Equal(3, vm.CacCaoDo.Count);
        Assert.Equal("1A2", vm.CacCaoDo[0].Khoa);
        Assert.All(vm.CacCaoDo, d => Assert.Equal("2700", d.GiaTri));
        Assert.True(vm.CoTheOk);

        var kq = vm.KetQua()!;
        Assert.Equal(50, kq.TiLeIn);
        Assert.Equal([2700, 2700, 2700], kq.CaoDoMm);
    }

    [Fact]
    public void Cao_do_am_va_thap_phan_deu_doc_duoc()
    {
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, BaTuyen(), "A-A", 0);
        vm.CacCaoDo[0].GiaTri = "-150";
        vm.CacCaoDo[1].GiaTri = "2750.5";
        vm.CacCaoDo[2].GiaTri = "0";

        Assert.True(vm.CoTheOk);
        Assert.Equal([-150, 2750.5, 0], vm.KetQua()!.CaoDoMm);
    }

    [Fact]
    public void Cao_do_khong_phai_so_thi_khoa_OK_kem_ten_tuyen_trong_ly_do()
    {
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, BaTuyen(), "A-A", 2700);

        vm.CacCaoDo[1].GiaTri = "trên trần";

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("duct-retn", StringComparison.Ordinal));
    }

    [Fact]
    public void Chua_co_cao_do_moi_san_thi_moi_dong_deu_trong_va_khoa_OK()
    {
        // Rule pack không khai defaultElevations và phiên chưa nhập lần nào.
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, BaTuyen(), "A-A", null);

        Assert.All(vm.CacCaoDo, d => Assert.Equal("", d.GiaTri));
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("nhập số mm", StringComparison.Ordinal));
    }

    [Fact]
    public void Ten_mat_cat_hien_chi_doc_kem_ranh_gioi_cung_ve_cao_do()
    {
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, BaTuyen(), "B-B", 2700);

        Assert.Contains("B-B", vm.MoTaTenMatCat, StringComparison.Ordinal);
        Assert.Contains("NHẬP TAY", vm.MoTaTenMatCat, StringComparison.Ordinal);
    }

    [Fact]
    public void Tuyen_cat_khong_cat_qua_tuyen_nao_thi_cho_ly_do_ro_chu_khong_vang_loi()
    {
        var vm = new MatCatDialogViewModel(Pack().SheetSetup.Scales, 50, [], "A-A", 2700);

        Assert.Empty(vm.CacCaoDo);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không cắt qua tuyến nào", StringComparison.Ordinal));
    }
}

/// <summary>M106 PR3 · AC2/AC9 — ViewModel hộp thoại <c>XBOSS_VE_TRANGIN</c>.</summary>
public class TrangInDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static IReadOnlyList<KhungTenTheoKho> KhungTen(DrawToolsPack pack) =>
        pack.SheetSetup.PaperSizes
            .Select(k => new KhungTenTheoKho(k, $"XB_TITLE_{k}", ["DU_AN", "HANG_MUC", "NGUOI_VE"], null))
            .ToList();

    private static TrangInDialogViewModel Vm(
        DrawToolsPack pack,
        IReadOnlyList<KhungTenTheoKho>? khungTen = null,
        IReadOnlyList<string>? ctb = null,
        double? tiLe = 50,
        string? ctbDaNho = null,
        IReadOnlyDictionary<string, string>? thuocTinh = null) =>
        new(pack.DrawTools.Systems, pack.SheetSetup.PaperSizes, pack.SheetSetup.Scales,
            khungTen ?? KhungTen(pack), ctb ?? ["xboss.ctb", "monochrome.ctb"],
            tiLe, null, ctbDaNho, thuocTinh);

    [Fact]
    public void Mac_dinh_du_he_kho_giay_ti_le_va_pham_vi_an_layer()
    {
        var pack = Pack();
        var vm = Vm(pack);

        Assert.Equal(pack.DrawTools.Systems[0].Id, vm.He!.Id);
        Assert.Equal(pack.SheetSetup.PaperSizes[0], vm.KhoGiay);
        Assert.Equal("50", vm.TiLe);
        Assert.Equal(CheDoAnLayerTrangIn.HeKhac, vm.CheDoAn);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Ctb_uu_tien_ban_cua_cong_ty_va_giu_lua_chon_lan_truoc()
    {
        var pack = Pack();
        Assert.Equal("xboss.ctb", Vm(pack).Ctb);
        Assert.Equal("monochrome.ctb", Vm(pack, ctbDaNho: "monochrome.ctb").Ctb);

        // Không có CTB nào trên máy → giữ mặc định của layout (kết quả null).
        var vmKhongCtb = Vm(pack, ctb: []);
        Assert.Equal(TrangInDialogViewModel.GiuCtbMacDinh, vmKhongCtb.Ctb);
        Assert.Null(vmKhongCtb.KetQua()!.Ctb);
    }

    [Fact]
    public void The_khung_ten_doi_theo_kho_giay_va_giu_gia_tri_da_go()
    {
        var pack = Pack();
        var khoA = pack.SheetSetup.PaperSizes[0];
        var khoB = pack.SheetSetup.PaperSizes[^1];
        var vm = Vm(pack, khungTen:
        [
            new KhungTenTheoKho(khoA, "XB_TITLE_A", ["DU_AN", "HANG_MUC"], null),
            new KhungTenTheoKho(khoB, "XB_TITLE_B", ["DU_AN", "NGUOI_VE"], null),
        ]);

        Assert.Equal(["DU_AN", "HANG_MUC"], vm.CacThe.Select(t => t.Khoa));
        vm.CacThe[0].GiaTri = "TT AVIO";

        vm.KhoGiay = khoB;

        Assert.Equal(["DU_AN", "NGUOI_VE"], vm.CacThe.Select(t => t.Khoa));
        Assert.Equal("TT AVIO", vm.CacThe[0].GiaTri); // giá trị đã gõ không bị mất khi đổi khổ
        Assert.Contains("XB_TITLE_B", vm.MoTaKhungTen, StringComparison.Ordinal);
        Assert.Equal(khoB, vm.KetQua()!.KhoGiay);
    }

    [Fact]
    public void Gia_tri_the_nho_lan_truoc_duoc_moi_san()
    {
        var pack = Pack();
        var vm = Vm(pack, thuocTinh: new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["DU_AN"] = "TT AVIO Tháp A",
        });

        Assert.Equal("TT AVIO Tháp A", vm.CacThe.Single(t => t.Khoa == "DU_AN").GiaTri);
        Assert.Equal("TT AVIO Tháp A", vm.KetQua()!.ThuocTinhKhungTen["DU_AN"]);
    }

    [Fact]
    public void Khong_tra_duoc_khung_ten_cho_kho_dang_chon_thi_canh_bao_chu_khong_khoa_OK()
    {
        var pack = Pack();
        var vm = Vm(pack, khungTen:
        [
            new KhungTenTheoKho(pack.SheetSetup.PaperSizes[0], null, [],
                "Thư viện block chưa có khung tên kind=titleblock cho khổ này"),
        ]);

        Assert.True(vm.CoTheOk); // layout + viewport vẫn có giá trị
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("khung tên", StringComparison.OrdinalIgnoreCase));
        Assert.Empty(vm.CacThe);
    }

    [Fact]
    public void Rule_pack_chua_khai_paperSizes_hoac_scales_thi_khoa_OK_kem_ly_do()
    {
        var pack = Pack();
        var vm = new TrangInDialogViewModel(
            pack.DrawTools.Systems, [], [], [], [], 50);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("sheetSetup.paperSizes/scales", StringComparison.Ordinal));
    }

    [Fact]
    public void Ti_le_sai_thi_khoa_OK_va_mo_ta_viewport_noi_ro_can_nhap_lai()
    {
        var vm = Vm(Pack());
        vm.TiLe = "abc";

        Assert.False(vm.CoTheOk);
        Assert.Contains("Nhập tỉ lệ in", vm.MoTaTiLe, StringComparison.Ordinal);
    }

    [Fact]
    public void Doi_pham_vi_an_layer_thi_ket_qua_va_mo_ta_doi_theo()
    {
        var vm = Vm(Pack());
        vm.AnNgoaiHe = true;

        Assert.Equal(CheDoAnLayerTrangIn.NgoaiHe, vm.KetQua()!.CheDoAn);
        Assert.Contains("không thuộc hệ", vm.MoTaAnLayer, StringComparison.Ordinal);

        vm.KhongAn = true;
        Assert.Equal(CheDoAnLayerTrangIn.Khong, vm.KetQua()!.CheDoAn);
    }
}
