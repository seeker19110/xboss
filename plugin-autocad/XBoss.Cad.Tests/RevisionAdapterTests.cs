using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.Ui;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M110 PR2 — phần THUẦN của tầng Adapter: hai ViewModel hộp thoại (FR1/FR4/FR5), phép kiểm 20
/// cloud/tam giác mồ côi (FR8), mục revision trong báo cáo phiên vẽ và chỗ đứng của 3 lệnh trong
/// quy trình (FR10).
///
/// Lệnh AutoCAD không chạy được trên CI nên mọi luật quyết định "bấm OK được hay không" nằm ở
/// ViewModel và được kẹp ở đây — hộp thoại không bao giờ cho bấm OK thứ mà lệnh sẽ từ chối.
/// </summary>
public class RevisionAdapterTests
{
    private static ThayDoiRevision ThayDoi(string handle, LoaiThayDoi loai = LoaiThayDoi.Doi) =>
        new(loai, handle, VaiTroVe.Tim, "HVAC", "duct-supply", "300x200", new BaoHinh(0, 0, 100, 100));

    // ===== FR1 — hộp thoại khoanh vùng =====

    [Fact]
    public void Rev_dialog_mac_dinh_tick_moi_de_xuat_va_tra_dung_vung_da_chon()
    {
        var vm = new RevisionDialogViewModel(2, [ThayDoi("A1"), ThayDoi("B2", LoaiThayDoi.Them)]);

        Assert.Equal(2, vm.SoRevisionDangMo);
        Assert.True(vm.TheoDeXuat);
        Assert.True(vm.CoTheOk);
        Assert.All(vm.CacDeXuat, m => Assert.True(m.Chon));

        vm.CacDeXuat[0].Chon = false;
        var kq = vm.KetQua();
        Assert.NotNull(kq);
        Assert.False(kq!.TuChonVung);
        Assert.Equal(["B2"], kq.DaChon.Select(d => d.Handle));
    }

    [Fact]
    public void Rev_dialog_bo_tick_het_thi_khoa_OK_kem_ly_do()
    {
        var vm = new RevisionDialogViewModel(1, [ThayDoi("A1")]);
        vm.CacDeXuat[0].Chon = false;

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("tick", StringComparison.OrdinalIgnoreCase));

        // Đổi sang "tự chọn vùng bằng chuột" là hợp lệ ngay (đường vào thứ hai của FR1).
        vm.TuChonVung = true;
        Assert.True(vm.CoTheOk);
        Assert.True(vm.KetQua()!.TuChonVung);
        Assert.Empty(vm.KetQua()!.DaChon);
    }

    [Fact]
    public void Rev_dialog_khong_co_moc_thi_chi_con_duong_khoanh_tay_va_noi_ro_ly_do()
    {
        var vm = new RevisionDialogViewModel(1, [], "Bản vẽ chưa từng chốt revision nên chưa có mốc để so.");

        Assert.True(vm.TuChonVung);
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("chưa từng chốt revision"));
        Assert.Contains("chưa từng chốt revision", vm.GhiChuDeXuat);
    }

    [Fact]
    public void Rev_dialog_nut_zoom_goi_dung_dong_dang_bam()
    {
        var vm = new RevisionDialogViewModel(1, [ThayDoi("A1"), ThayDoi("B2")]);
        MucDeXuatRevision? daZoom = null;
        vm.ZoomToi = m => daZoom = m;

        vm.LenhZoom.Execute(vm.CacDeXuat[1]);

        Assert.Same(vm.CacDeXuat[1], daZoom);
    }

    // ===== FR4/FR5 — hộp thoại chốt revision =====

    [Fact]
    public void Chot_dialog_du_thong_tin_thi_tra_dung_dong_revision()
    {
        var vm = new RevChotDialogViewModel(2, 6, "2026-08-29", "kysu", [])
        {
            NoiDung = " Dời tuyến gió trục 3 ",
        };

        Assert.True(vm.CoTheOk);
        var kq = vm.KetQua();
        Assert.Equal(new KetQuaHoiRevChot(2, "2026-08-29", "Dời tuyến gió trục 3", "kysu"), kq);
    }

    [Fact]
    public void Chot_dialog_vuot_maxRows_thi_khoa_OK_khong_bao_gio_ghi_de_dong_cu()
    {
        var vm = new RevChotDialogViewModel(7, 6, "2026-08-29", "kysu", []) { NoiDung = "Sửa lần 7" };

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("maxRows"));
    }

    [Fact]
    public void Chot_dialog_ngay_sai_dinh_dang_va_thieu_noi_dung_deu_khoa_OK()
    {
        var vm = new RevChotDialogViewModel(1, 6, "29/08/2026", "kysu", []);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("yyyy-MM-dd"));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("nội dung"));

        vm.NgayIso = "2026-08-29";
        vm.NoiDung = "Đổi cỡ ống";
        Assert.True(vm.CoTheOk);
        Assert.False(RevChotDialogViewModel.NgayHopLe("2026-13-01"));
    }

    [Fact]
    public void Chot_dialog_con_vung_chua_khoanh_thi_canh_bao_va_doi_tick_van_chot()
    {
        var vm = new RevChotDialogViewModel(
            2, 6, "2026-08-29", "kysu", [ThayDoi("A1"), ThayDoi("B2", LoaiThayDoi.Xoa)])
        {
            NoiDung = "Sửa theo phê bình tư vấn",
        };

        Assert.True(vm.CoBoSot);
        Assert.False(vm.CoTheOk);
        Assert.Equal(2, vm.DongBoSot.Count);
        Assert.Contains("2 thay đổi CHƯA nằm trong cloud", vm.TomTatBoSot);

        // Kỹ sư quyết, plugin KHÔNG chặn (FR5).
        vm.VanChot = true;
        Assert.True(vm.CoTheOk);
        Assert.NotNull(vm.KetQua());
    }

    // ===== FR6 — hộp thoại hiện/ẩn =====

    [Fact]
    public void HienThi_dialog_tra_dung_cac_revision_duoc_tick()
    {
        var vm = new HienThiRevisionDialogViewModel([
            new MucHienThiRevision(1, 4, "M-ANNO-REVS-R1", false),
            new MucHienThiRevision(2, 2, "M-ANNO-REVS-R2", true),
        ]);

        Assert.True(vm.CoTheOk);
        Assert.Equal([2], vm.KetQua());

        vm.CacRevision[0].Hien = true;
        Assert.Equal([1, 2], vm.KetQua());
    }

    [Fact]
    public void HienThi_dialog_ban_ve_chua_co_cloud_thi_khoa_OK()
    {
        var vm = new HienThiRevisionDialogViewModel([]);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("XBOSS_VE_REV"));
    }

    // ===== FR8 — phép kiểm 20 =====

    private static DrawingSnapshot Snapshot(params RevisionInfo[] revision) =>
        new()
        {
            Layers = [],
            Entities = [],
            InsUnits = 4,
            Revision = revision.Length > 0 ? revision : null,
        };

    [Fact]
    public void Phep_kiem_19_bao_tam_giac_mo_coi_va_cloud_mo_coi()
    {
        var kq = PhepKiemMoRong.RevisionMoCoi(Snapshot(
            new RevisionInfo { Handle = "2A", SoRevision = 2, LaCloud = false, HandleCapDoi = "2B" },
            new RevisionInfo { Handle = "3C", SoRevision = 1, LaCloud = true, HandleCapDoi = null }));

        Assert.NotNull(kq);
        Assert.Equal("revision-mo-coi", kq!.Id);
        Assert.Equal(["2A", "3C"], kq.Handles);
        Assert.Contains(kq.ChiTiet, c => c.Contains("Tam giác revision R2") && c.Contains("không còn cloud"));
        Assert.Contains(kq.ChiTiet, c => c.Contains("Cloud revision R1") && c.Contains("tam giác"));
    }

    [Fact]
    public void Phep_kiem_19_cap_con_du_thi_khong_bao_gi_va_tu_tat_khi_khong_co_du_lieu()
    {
        var duCap = PhepKiemMoRong.RevisionMoCoi(Snapshot(
            new RevisionInfo { Handle = "A", SoRevision = 1, LaCloud = true, HandleCapDoi = "B" },
            new RevisionInfo { Handle = "B", SoRevision = 1, LaCloud = false, HandleCapDoi = "A" }));
        Assert.Null(duCap);

        // Bản vẽ không có đối tượng revision nào (cloud vẽ tay bằng REVCLOUD) → TỰ TẮT, không báo oan.
        Assert.Null(PhepKiemMoRong.RevisionMoCoi(Snapshot()));
    }

    // ===== Báo cáo phiên vẽ + danh mục lệnh =====

    [Fact]
    public void Bao_cao_phien_ve_gom_revision_theo_so_va_khong_cong_vao_thong_ke_he()
    {
        var bc = VeSessionReport.Dung(
            [
                new VeXDataInfo { VaiTro = VaiTroVe.Tim, HeId = "HVAC", ItemId = "duct-supply", Size = "300x200" },
                new VeXDataInfo { VaiTro = VaiTroVe.Revision, SoRevision = 1, HandleCapDoi = "B" },
                new VeXDataInfo { VaiTro = VaiTroVe.Revision, SoRevision = 1, HandleCapDoi = "A" },
                new VeXDataInfo { VaiTro = VaiTroVe.Revision, SoRevision = 2, HandleCapDoi = "D" },
            ],
            new VeSessionMeta { RulePackVersion = "v11", TenBanVe = "test.dwg", NgayIso = "2026-08-29" });

        Assert.Equal([1, 2], bc.Revision.Select(r => r.So));
        Assert.Equal([2, 1], bc.Revision.Select(r => r.SoDoiTuong));
        // Guardrail 1: chú thích revision KHÔNG được cộng vào thống kê hệ.
        Assert.Equal(1, bc.TongTuyen);
        Assert.Single(bc.HeThong);
        Assert.Contains("Revision cloud", bc.ToVietnameseText());
    }

    [Fact]
    public void Ba_lenh_revision_dung_sau_XBOSS_VE_TRANGIN_trong_buoc_ho_so_ban_ve()
    {
        var hoSo = QuyTrinh.LenhCua(BuocQuyTrinh.HoSoBanVe).Select(l => l.Ten).ToList();

        Assert.Equal(
            ["XBOSS_VE_MATCAT", "XBOSS_VE_THONGKE", "XBOSS_VE_NGATNET", "XBOSS_VE_TRANGIN", "XBOSS_VE_REV",
             "XBOSS_VE_REV_CHOT", "XBOSS_VE_REV_HIENTHI", "XBOSS_VE_BAOCAO"],
            hoSo);
        Assert.All(
            LenhCatalog.TatCa.Where(l => l.Ten.StartsWith("XBOSS_VE_REV", StringComparison.Ordinal)),
            l => Assert.True(l.CanRulePack, $"{l.Ten} phải đòi rule pack (revisionPolicy)"));
    }
}
