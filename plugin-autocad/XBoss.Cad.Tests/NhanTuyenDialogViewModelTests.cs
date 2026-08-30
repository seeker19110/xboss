using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M107 FR1/FR2 — phần THUẦN của vùng chọn <c>XBOSS_VE_NHANTUYEN</c>: Adapter đọc bản vẽ rồi đếm,
/// còn cách diễn đạt con số (sẽ nhận gì, bỏ qua vì lý do gì) nằm ở đây nên hộp thoại và tóm tắt
/// cuối lệnh không bao giờ báo lệch nhau.
/// </summary>
public class TomTatChonNhanTuyenTests
{
    [Fact]
    public void Tong_nhan_va_tong_bo_qua_dem_dung_tung_loai()
    {
        var t = new TomTatChonNhanTuyen(
            SoPolyline: 5, SoLine: 2, SoNhanLai: 1,
            SoKhongPhaiTuyen: 3, SoThuocXref: 4, SoPhuTroXBoss: 2);

        Assert.Equal(8, t.TongNhan);
        Assert.Equal(9, t.TongBoQua);
    }

    [Fact]
    public void Vung_chon_rong_thi_khong_co_dong_bo_qua_nao()
    {
        var t = new TomTatChonNhanTuyen();

        Assert.Equal(0, t.TongNhan);
        Assert.Empty(t.DongBoQua);
        Assert.Contains("Không có tuyến nào nhận được", t.MoTaSeNhan, StringComparison.Ordinal);
    }

    [Fact]
    public void Moi_ly_do_bo_qua_mot_dong_va_bo_dong_co_so_0()
    {
        var t = new TomTatChonNhanTuyen(SoPolyline: 1, SoThuocXref: 2);

        var dong = Assert.Single(t.DongBoQua);
        Assert.StartsWith("2 đối tượng:", dong, StringComparison.Ordinal);
        Assert.Contains("xref", dong, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Ly_do_bo_qua_deu_co_nhan_tieng_Viet()
    {
        foreach (var lyDo in Enum.GetValues<LyDoBoQuaNhanTuyen>())
            Assert.False(string.IsNullOrWhiteSpace(TomTatChonNhanTuyen.Nhan(lyDo)), $"{lyDo}: thiếu nhãn");
    }

    [Fact]
    public void Mo_ta_se_nhan_noi_ro_line_bi_chuyen_kieu_va_tuyen_nhan_lai()
    {
        var t = new TomTatChonNhanTuyen(SoPolyline: 3, SoLine: 1, SoNhanLai: 2);

        Assert.Contains("Sẽ nhận 6 tuyến", t.MoTaSeNhan, StringComparison.Ordinal);
        Assert.Contains("chuyển thành polyline 2 đỉnh", t.MoTaSeNhan, StringComparison.Ordinal);
        Assert.Contains("nhận lại", t.MoTaSeNhan, StringComparison.Ordinal);
    }
}

/// <summary>
/// M107 FR2 — ViewModel hộp thoại <c>XBOSS_VE_NHANTUYEN</c>: danh mục dựng từ rule pack v9 THẬT,
/// giá trị mặc định, quy tắc khóa nút OK kèm lý do tiếng Việt, cảnh báo cỡ ngoài danh mục, bề rộng
/// nét biên suy từ cỡ, và ca rule pack khai thiếu phải cho LÝ DO rõ chứ không văng lỗi.
/// </summary>
public class NhanTuyenDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    /// <summary>Rule pack khai thiếu — dựng thẳng model (Load sẽ chặn từ đầu, không tạo được bằng JSON).</summary>
    private static DrawToolsPack PackKhaiThieu(params DrawSystem[] he) =>
        new()
        {
            RulePack = Pack().RulePack,
            DrawTools = new DrawToolsSection { Systems = he },
            SheetSetup = new SheetSetupSection(),
        };

    private static TomTatChonNhanTuyen VungChon(int soPolyline = 5) =>
        new(SoPolyline: soPolyline);

    // ===== Danh mục + mặc định =====

    [Fact]
    public void Danh_muc_dung_theo_rule_pack_dang_nap()
    {
        var pack = Pack();
        var vm = new NhanTuyenDialogViewModel(pack, toMm: 1, VungChon());

        Assert.Equal(pack.DrawTools.Systems, vm.CacHe);
        Assert.Equal(pack.DrawTools.Systems[0].Id, vm.He!.Id);
        Assert.Equal(vm.He.Lines, vm.CacLoaiTuyen);
        Assert.Equal(vm.Tuyen!.Sizes, vm.CacSize);
        Assert.Equal(pack.SheetSetup.Slopes, vm.CacDoDoc);
        Assert.Equal("XBOSS_VE_NHANTUYEN — Nhận tuyến có sẵn", vm.TieuDe);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Mac_dinh_lay_lua_chon_cua_phien_truoc()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "PIPING", itemId: "chw-pipe", size: "DN40");

        Assert.Equal("PIPING", vm.He!.Id);
        Assert.Equal("chw-pipe", vm.Tuyen!.ItemId);
        Assert.Equal("DN40", vm.Size);
        Assert.False(vm.SizeTuNhap);
        Assert.Equal(MucThongDiep.Tot, vm.MucDo);

        var kq = vm.KetQua()!;
        Assert.Equal("PIPING", kq.He.Id);
        Assert.Equal("DN40", kq.Size);
        Assert.False(kq.SizeTuNhap);
    }

    [Fact]
    public void Doi_he_thi_loai_tuyen_va_size_dat_lai_theo_he_moi()
    {
        var pack = Pack();
        var vm = new NhanTuyenDialogViewModel(
            pack, toMm: 1, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "300x200");

        vm.He = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");

        Assert.Equal("chw-pipe", vm.Tuyen!.ItemId);
        Assert.Equal(vm.Tuyen.Sizes[0], vm.Size);
        Assert.Equal(vm.Tuyen.Layer, vm.LayerDich);
        Assert.True(vm.CoTheOk);
    }

    // ===== Phần chỉ đọc: layer đích + bề rộng nét biên (FR2/FR3) =====

    [Fact]
    public void Hien_layer_dich_va_be_rong_net_bien_suy_tu_co()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "800x400");

        Assert.True(vm.CoNetBien);
        Assert.Equal(800, vm.BeRongBienVe!.Value, 6);
        Assert.Contains(vm.Tuyen!.Layer, vm.MoTaViecSeLam, StringComparison.Ordinal);
        Assert.Contains("bề rộng 800", vm.MoTaViecSeLam, StringComparison.Ordinal);
        // Guardrail 1 của M107 phải đọc được ngay trên hộp thoại.
        Assert.Contains("giữ nguyên", vm.MoTaViecSeLam, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Don_vi_ban_ve_met_thi_be_rong_quy_doi_theo_don_vi_do()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1000, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "800x400");

        Assert.Equal(0.8, vm.BeRongBienVe!.Value, 6);
    }

    [Fact]
    public void Loai_tuyen_khong_co_net_bien_thi_noi_ro_chi_nhan_tim()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "PIPING", itemId: "chw-pipe", size: "DN40");

        Assert.False(vm.CoNetBien);
        Assert.Null(vm.BeRongBienVe);
        Assert.Contains("không sinh nét biên", vm.MoTaViecSeLam, StringComparison.Ordinal);
    }

    [Fact]
    public void Vung_chon_hien_chi_doc_dung_bo_so_Adapter_dem_duoc()
    {
        var tomTat = new TomTatChonNhanTuyen(SoPolyline: 4, SoLine: 1, SoThuocXref: 2, SoKhongPhaiTuyen: 3);
        var vm = new NhanTuyenDialogViewModel(Pack(), toMm: 1, tomTat);

        Assert.Same(tomTat, vm.TomTat);
        Assert.Equal(tomTat.MoTaSeNhan, vm.MoTaSeNhan);
        Assert.Equal(2, vm.DongBoQua.Count);
    }

    // ===== Cảnh báo không chặn =====

    [Fact]
    public void Co_ngoai_danh_muc_bat_canh_bao_custom_nhung_van_nhan_duoc()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "888x333");

        Assert.True(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("custom", StringComparison.Ordinal));
        Assert.True(vm.KetQua()!.SizeTuNhap);
    }

    [Fact]
    public void Co_khong_doc_duoc_be_rong_thi_canh_bao_chi_nhan_tim()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "ong-gio-lon");

        Assert.True(vm.CoNetBien);
        Assert.Null(vm.BeRongBienVe);
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("chỉ nhận tim", StringComparison.Ordinal));
    }

    [Fact]
    public void Nhan_lai_tuyen_da_la_tuyen_XBoss_thi_canh_bao_go_dau_boc_va_chia_dot()
    {
        var vm = new NhanTuyenDialogViewModel(Pack(), toMm: 1, new TomTatChonNhanTuyen(SoNhanLai: 3));

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("XBOSS_BOCKL", StringComparison.Ordinal));
        Assert.Contains(vm.CanhBao, c => c.Contains("XBOSS_VE_CHIADOT", StringComparison.Ordinal));
    }

    // ===== Khóa nút OK kèm lý do (FR2) =====

    [Fact]
    public void Vung_chon_khong_co_tuyen_nao_thi_khoa_OK_kem_ly_do()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, new TomTatChonNhanTuyen(SoKhongPhaiTuyen: 4, SoThuocXref: 1));

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("xref", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Tuyen_bat_buoc_do_doc_ma_chua_nhap_thi_khoa_OK()
    {
        var pack = Pack();
        var tuyenDoc = pack.DrawTools.Systems
            .SelectMany(s => s.Lines.Select(l => (s, l)))
            .First(x => x.l.SlopeRequired);
        var vm = new NhanTuyenDialogViewModel(
            pack, toMm: 1, VungChon(), heId: tuyenDoc.s.Id, itemId: tuyenDoc.l.ItemId);

        Assert.True(vm.CanDoDoc);
        vm.DoDoc = "";

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("slopeRequired", StringComparison.Ordinal));
    }

    [Fact]
    public void Do_doc_chi_vao_ket_qua_khi_loai_tuyen_bat_buoc()
    {
        var vm = new NhanTuyenDialogViewModel(
            Pack(), toMm: 1, VungChon(), heId: "HVAC", itemId: "duct-supp", size: "800x400", doDoc: "2%");

        Assert.False(vm.CanDoDoc);
        Assert.Null(vm.KetQua()!.DoDoc);
    }

    // ===== Rule pack khai thiếu: lý do rõ, không văng lỗi (AC9 của M106) =====

    [Fact]
    public void Rule_pack_khong_khai_he_nao_thi_cho_ly_do_ro()
    {
        var vm = new NhanTuyenDialogViewModel(PackKhaiThieu(), toMm: 1, VungChon());

        Assert.Null(vm.He);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("drawTools.systems", StringComparison.Ordinal));
    }

    [Fact]
    public void He_khong_khai_loai_tuyen_nao_thi_cho_ly_do_ro()
    {
        var vm = new NhanTuyenDialogViewModel(
            PackKhaiThieu(new DrawSystem { Id = "HVAC", Name = "Điều hòa" }), toMm: 1, VungChon());

        Assert.Null(vm.Tuyen);
        Assert.False(vm.CoTheOk);
        Assert.Equal("", vm.LayerDich);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("lines", StringComparison.Ordinal));
    }

    [Fact]
    public void Loai_tuyen_khong_khai_size_nao_thi_van_go_tay_duoc_kem_canh_bao()
    {
        var vm = new NhanTuyenDialogViewModel(
            PackKhaiThieu(new DrawSystem
            {
                Id = "HVAC",
                Name = "Điều hòa",
                Lines = [new DrawLine { ItemId = "duct-supp", Name = "Ống gió cấp", Layer = "M-DUCT-SUPP" }],
            }),
            toMm: 1,
            VungChon());

        Assert.Empty(vm.CacSize);
        Assert.False(vm.CoTheOk); // chưa gõ gì thì chưa nhận được
        vm.Size = "600x300";

        Assert.True(vm.CoTheOk);
        Assert.True(vm.SizeTuNhap);
        Assert.Contains(vm.CanhBao, c => c.Contains("custom", StringComparison.Ordinal));
    }
}
