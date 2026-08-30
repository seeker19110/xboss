using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 AC3/AC9 — ViewModel hộp thoại <c>XBOSS_VE</c>. Đây là toàn bộ hành vi hộp thoại mà CI kiểm
/// được (XAML không có test tự động): danh mục dựng từ rule pack v9 THẬT, giá trị mặc định, quy
/// tắc khóa nút OK kèm lý do, cảnh báo size ngoài danh mục, bề rộng nét biên suy từ size, và ca
/// rule pack khai thiếu phải cho LÝ DO rõ chứ không văng lỗi.
/// </summary>
public class VeTuyenDialogViewModelTests
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

    // ===== Danh mục + mặc định =====

    [Fact]
    public void Danh_muc_dung_theo_rule_pack_dang_nap()
    {
        var pack = Pack();
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1);

        Assert.Equal(pack.DrawTools.Systems, vm.CacHe);
        Assert.Equal(pack.DrawTools.Systems[0].Id, vm.He!.Id);
        Assert.Equal(vm.He.Lines, vm.CacLoaiTuyen);
        Assert.Equal(vm.Tuyen!.Sizes, vm.CacSize);
        Assert.Equal(pack.SheetSetup.Slopes, vm.CacDoDoc);
        Assert.Equal("XBOSS_VE — Vẽ tuyến", vm.TieuDe);
    }

    [Fact]
    public void Mac_dinh_lay_lua_chon_cua_phien_truoc()
    {
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "chw-pipe", size: "DN40");

        Assert.Equal("PIPING", vm.He!.Id);
        Assert.Equal("chw-pipe", vm.Tuyen!.ItemId);
        Assert.Equal("DN40", vm.Size);
        Assert.False(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
        Assert.Equal(MucThongDiep.Tot, vm.MucDo);
    }

    [Fact]
    public void Chua_co_lua_chon_nao_thi_lay_muc_dau_danh_muc()
    {
        var pack = Pack();
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1);
        var tuyenDau = pack.DrawTools.Systems[0].Lines[0];

        Assert.Equal(tuyenDau.ItemId, vm.Tuyen!.ItemId);
        Assert.Equal(tuyenDau.Sizes[0], vm.Size);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Size_ngoai_danh_muc_cua_phien_truoc_van_duoc_giu()
    {
        // Dòng lệnh lấy VeContext.Size làm mặc định kể cả khi size đó tự nhập — hộp thoại giữ
        // đúng hành vi đó, không lặng lẽ nhảy về size đầu danh mục.
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "HVAC", itemId: "duct-supp", size: "999x111");

        Assert.Equal("999x111", vm.Size);
        Assert.True(vm.SizeTuNhap);
    }

    // ===== Sửa qua lại tự do (AC3) =====

    [Fact]
    public void Doi_he_thi_loai_tuyen_va_size_dat_lai_theo_he_moi()
    {
        var pack = Pack();
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1, heId: "HVAC", itemId: "duct-supp", size: "300x200");

        vm.He = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");

        Assert.Equal("PIPING", vm.He.Id);
        Assert.Equal("chw-pipe", vm.Tuyen!.ItemId); // loại tuyến đầu của hệ mới
        Assert.Equal(vm.Tuyen.Sizes[0], vm.Size);
        Assert.False(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Doi_loai_tuyen_thi_size_dat_lai_theo_danh_muc_cua_loai_do()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1, heId: "HVAC", itemId: "duct-supp", size: "300x200");

        vm.Tuyen = hvac.Lines.Single(l => l.ItemId == "duct-retn");

        Assert.Equal(vm.Tuyen.Sizes[0], vm.Size);
        Assert.Contains(vm.Size, vm.CacSize);
    }

    [Fact]
    public void Giao_dien_ghi_nguoc_rong_trong_luc_dang_bao_thi_khong_nuot_lua_chon()
    {
        // Tái hiện hành vi thật của WPF: ComboBox IsEditable bị đổi ItemsSource sẽ ghi NGƯỢC chuỗi
        // rỗng vào nguồn ngay trong lúc ViewModel đang phát PropertyChanged. Không chặn thì size
        // vừa đặt lại bị xóa trắng và nút OK khóa vô cớ.
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1, heId: "HVAC", itemId: "duct-supp", size: "300x200");
        vm.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(VeTuyenDialogViewModel.CacSize)) vm.Size = "";
        };

        vm.Tuyen = hvac.Lines.Single(l => l.ItemId == "duct-retn");

        Assert.Equal(vm.Tuyen.Sizes[0], vm.Size);
        Assert.True(vm.CoTheOk);
    }

    // ===== Khóa OK + lý do (AC2) =====

    [Fact]
    public void Xoa_size_thi_khoa_OK_kem_ly_do_tieng_Viet()
    {
        var vm = new VeTuyenDialogViewModel(Pack(), toMm: 1, heId: "HVAC", itemId: "duct-supp");
        Assert.True(vm.CoTheOk);

        vm.Size = "";

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Equal(MucThongDiep.Loi, vm.MucDo);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa chọn size", StringComparison.Ordinal));
        Assert.Contains("size", vm.ThongDiep, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Tuyen_slopeRequired_thieu_do_doc_thi_khoa_OK()
    {
        // pipe-sanr (ống thoát) là tuyến duy nhất khai slopeRequired trong rule pack thật.
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "pipe-sanr", size: "DN80", doDoc: "2%");
        Assert.True(vm.CanDoDoc);
        Assert.True(vm.CoTheOk);

        vm.DoDoc = "";

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("độ dốc", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Tuyen_khong_bat_buoc_do_doc_thi_khong_hoi_va_khong_ghi_do_doc()
    {
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "chw-pipe", size: "DN40", doDoc: "2%");

        Assert.False(vm.CanDoDoc);
        Assert.True(vm.CoTheOk);
        Assert.Null(vm.KetQua()!.DoDoc);
    }

    // ===== Cảnh báo size ngoài danh mục (FR5) =====

    [Fact]
    public void Size_ngoai_danh_muc_bat_canh_bao_custom_nhung_van_bam_OK_duoc()
    {
        var vm = new VeTuyenDialogViewModel(Pack(), toMm: 1, heId: "HVAC", itemId: "duct-supp");

        vm.Size = "777x333";

        Assert.True(vm.SizeTuNhap);
        Assert.True(vm.CoTheOk); // custom là CẢNH BÁO, không phải lỗi
        Assert.Equal(MucThongDiep.CanhBao, vm.MucDo);
        Assert.Contains(vm.CanhBao, c => c.Contains("custom", StringComparison.Ordinal));
        var kq = vm.KetQua()!;
        Assert.Equal("777x333", kq.Size);
        Assert.True(kq.SizeTuNhap);
    }

    [Fact]
    public void Do_doc_ngoai_danh_muc_bat_canh_bao_nhung_khong_khoa_OK()
    {
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "pipe-sanr", size: "DN80", doDoc: "2%");

        vm.DoDoc = "0,7%";

        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("0,7%", StringComparison.Ordinal));
    }

    // ===== Bề rộng nét biên suy từ size (AC3/FR6) =====

    [Fact]
    public void Be_rong_bien_cap_nhat_ngay_khi_doi_size()
    {
        var vm = new VeTuyenDialogViewModel(Pack(), toMm: 1, heId: "HVAC", itemId: "duct-supp");

        vm.Size = "800x400";
        Assert.True(vm.CoNetBien);
        Assert.Equal(800, vm.BeRongBienVe);

        vm.Size = "300x200";
        Assert.Equal(300, vm.BeRongBienVe);
    }

    [Fact]
    public void Be_rong_bien_quy_doi_theo_don_vi_ban_ve()
    {
        // Bản vẽ đơn vị mét: 1 đơn vị = 1000 mm ⇒ ống 800 mm rộng 0,8 đơn vị.
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1000, heId: "HVAC", itemId: "duct-supp", size: "800x400");

        Assert.Equal(0.8, vm.BeRongBienVe!.Value, 6);
    }

    [Fact]
    public void Tuyen_khong_co_net_bien_thi_noi_ro_chi_ve_tim()
    {
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "chw-pipe", size: "DN40");

        Assert.False(vm.CoNetBien);
        Assert.Null(vm.BeRongBienVe);
        Assert.Contains("chỉ vẽ tim", vm.MoTaBeRongBien, StringComparison.Ordinal);
    }

    [Fact]
    public void Size_khong_doc_duoc_be_rong_thi_canh_bao_chu_khong_khoa_OK()
    {
        var vm = new VeTuyenDialogViewModel(Pack(), toMm: 1, heId: "HVAC", itemId: "duct-supp");

        vm.Size = "ống to";

        Assert.Null(vm.BeRongBienVe);
        Assert.True(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("không sinh nét biên", StringComparison.Ordinal));
    }

    // ===== Rule pack khai thiếu: LÝ DO rõ, không văng lỗi (AC9) =====

    [Fact]
    public void Rule_pack_khong_khai_he_nao_thi_cho_ly_do_ro()
    {
        var vm = new VeTuyenDialogViewModel(PackKhaiThieu(), toMm: 1);

        Assert.Null(vm.He);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("drawTools.systems", StringComparison.Ordinal));
    }

    [Fact]
    public void He_khong_khai_loai_tuyen_nao_thi_cho_ly_do_ro()
    {
        var pack = PackKhaiThieu(new DrawSystem { Id = "HVAC", Name = "Điều hòa", Lines = [] });
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1);

        Assert.NotNull(vm.He);
        Assert.Null(vm.Tuyen);
        Assert.Empty(vm.CacSize);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không khai loại tuyến", StringComparison.Ordinal));
    }

    [Fact]
    public void Loai_tuyen_khong_khai_size_nao_thi_canh_bao_va_van_go_tay_duoc()
    {
        var pack = PackKhaiThieu(new DrawSystem
        {
            Id = "HVAC",
            Name = "Điều hòa",
            Lines = [new DrawLine { ItemId = "duct-supp", Name = "Ống gió cấp", EdgeStyle = "double", Sizes = [] }],
        });
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1);

        Assert.Empty(vm.CacSize);
        Assert.False(vm.CoTheOk); // chưa gõ gì thì vẫn thiếu size
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa chọn size", StringComparison.Ordinal));

        vm.Size = "500x250";

        Assert.True(vm.CoTheOk);
        Assert.True(vm.SizeTuNhap);
        Assert.Contains(vm.CanhBao, c => c.Contains("không khai size nào", StringComparison.Ordinal));
        Assert.Equal(500, vm.BeRongBienVe);
    }

    [Fact]
    public void Tuyen_bat_buoc_do_doc_ma_rule_pack_khong_khai_slopes_thi_canh_bao_chu_khong_vang_loi()
    {
        var pack = PackKhaiThieu(new DrawSystem
        {
            Id = "PIPING",
            Name = "Cấp thoát nước",
            Lines =
            [
                new DrawLine
                {
                    ItemId = "pipe-sanr", Name = "Ống thoát", EdgeStyle = "none",
                    Sizes = ["DN80"], SlopeRequired = true,
                },
            ],
        });
        var vm = new VeTuyenDialogViewModel(pack, toMm: 1);

        Assert.True(vm.CanDoDoc);
        Assert.Empty(vm.CacDoDoc);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.CanhBao, c => c.Contains("sheetSetup.slopes", StringComparison.Ordinal));

        vm.DoDoc = "2%";

        Assert.True(vm.CoTheOk);
        Assert.Equal("2%", vm.KetQua()!.DoDoc);
    }

    // ===== Bản ghi tham số trả cho lệnh =====

    [Fact]
    public void KetQua_mang_dung_bo_tham_so_ma_lenh_can()
    {
        var vm = new VeTuyenDialogViewModel(
            Pack(), toMm: 1, heId: "PIPING", itemId: "pipe-sanr", size: "DN100", doDoc: "1%");

        var kq = vm.KetQua()!;
        Assert.Equal("PIPING", kq.He.Id);
        Assert.Equal("pipe-sanr", kq.Tuyen.ItemId);
        Assert.Equal("DN100", kq.Size);
        Assert.False(kq.SizeTuNhap);
        Assert.Equal("1%", kq.DoDoc);
    }
}
