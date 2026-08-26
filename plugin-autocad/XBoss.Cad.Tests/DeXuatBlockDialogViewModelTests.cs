using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 AC8/AC9 — ViewModel hộp thoại <c>XBOSS_VE_DEXUAT</c> sau khi chuyển WinForms → WPF.
/// Điểm phải canh: <b>giữ nguyên mọi trường và quy tắc <see cref="BlockDeXuatRules"/></b> — hộp
/// thoại mới không được nới lỏng (gửi thứ server trả 422) cũng không được siết thêm (chặn thứ
/// server nhận). Trạng thái nằm ở Core nên đây là lần đầu hành vi hộp thoại này được CI kiểm.
/// </summary>
public class DeXuatBlockDialogViewModelTests
{
    private static IReadOnlyList<MucChon<string>> He() =>
        [new("HVAC", "HVAC — Điều hòa"), new("PIPING", "PIPING — Cấp thoát nước")];

    private static IReadOnlyList<MucChon<string>> Item() =>
        [new("fcu", "fcu — FCU (bộ)"), new("valve", "valve — Van (cái)")];

    private static DeXuatBlockDialogViewModel Vm(
        string ten = "XB_FCU_NEW",
        IReadOnlyList<string>? daCo = null,
        string? heDoan = "HVAC",
        string? itemDoan = "fcu") =>
        new(ten, daCo ?? ["XB_ELBOW"], He(), heDoan, Item(), itemDoan, ["A1", "A3"]);

    [Fact]
    public void Doan_san_he_theo_layer_va_item_theo_ten_block()
    {
        var vm = Vm();

        Assert.Equal("HVAC", vm.MucHeChon!.GiaTri);
        Assert.Equal("fcu", vm.MucItemChon!.GiaTri);
        Assert.Equal(BlockKind.Fitting, vm.MucLoaiChon!.GiaTri);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Meta_mang_dung_bo_truong_ma_lenh_gui_len()
    {
        var vm = Vm();
        vm.GhiChu = " FCU 2 chiều ";

        var meta = vm.KetQua()!;
        Assert.Equal("XB_FCU_NEW", meta.BlockName);
        Assert.Equal(BlockKind.Fitting, meta.Kind);
        Assert.Equal("HVAC", meta.SystemId);
        Assert.Equal("fcu", meta.TakeoffItemId);
        Assert.Null(meta.PaperSize);
        Assert.Equal("FCU 2 chiều", meta.Note);
    }

    [Fact]
    public void Ten_block_trung_thu_vien_hien_hanh_thi_khoa_OK_ngay_tai_cho()
    {
        var vm = Vm(ten: "xb_elbow", daCo: ["XB_ELBOW"]);

        Assert.False(vm.CoTheOk); // AutoCAD không phân biệt hoa/thường
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("đã có block tên", StringComparison.Ordinal));
    }

    [Fact]
    public void Ten_block_rong_hoac_co_ky_tu_cam_thi_khoa_OK()
    {
        var vm = Vm(ten: "");
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa nhập tên block", StringComparison.Ordinal));

        vm.TenBlock = "XB/FCU";
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("không cho phép", StringComparison.Ordinal));
    }

    [Fact]
    public void Thieu_he_hoac_item_thi_khoa_OK_kem_ly_do_tieng_Viet()
    {
        var vm = Vm(heDoan: null, itemDoan: null);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa chọn hệ", StringComparison.Ordinal));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("item bóc tách", StringComparison.OrdinalIgnoreCase));

        vm.MucHeChon = vm.CacHe[0];
        vm.MucItemChon = vm.CacItem[0];
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Doi_sang_khung_ten_thi_xoa_he_va_item_roi_bat_o_kho_giay()
    {
        var vm = Vm();

        vm.MucLoaiChon = vm.CacLoai.Single(m => m.GiaTri == BlockKind.Titleblock);

        Assert.False(vm.CanHe);
        Assert.False(vm.CanItem);
        Assert.True(vm.CanKhoGiay);
        // Trường không còn nghĩa phải BỊ XOÁ — để lại là lý do khóa "khung tên không thuộc hệ nào".
        Assert.Null(vm.Meta().SystemId);
        Assert.Null(vm.Meta().TakeoffItemId);

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa chọn khổ giấy", StringComparison.Ordinal));

        vm.KhoGiay = "A1";

        Assert.True(vm.CoTheOk);
        var meta = vm.KetQua()!;
        Assert.Equal(BlockKind.Titleblock, meta.Kind);
        Assert.Equal("A1", meta.PaperSize);
        Assert.Null(meta.SystemId);
    }

    [Fact]
    public void Doi_tu_khung_ten_ve_lai_loai_khac_thi_xoa_kho_giay()
    {
        var vm = Vm();
        vm.MucLoaiChon = vm.CacLoai.Single(m => m.GiaTri == BlockKind.Titleblock);
        vm.KhoGiay = "A1";

        vm.MucLoaiChon = vm.CacLoai.Single(m => m.GiaTri == BlockKind.Support);

        Assert.False(vm.CanKhoGiay);
        Assert.Equal("", vm.KhoGiay);
        Assert.Null(vm.Meta().PaperSize);
    }

    [Fact]
    public void Danh_muc_loai_dung_dung_5_kind_cua_BlockDeXuatRules()
    {
        var vm = Vm();

        Assert.Equal(BlockDeXuatRules.CacLoai, vm.CacLoai.Select(m => m.GiaTri));
        Assert.Equal(BlockDeXuatRules.CacLoai.Select(BlockDeXuatRules.Nhan), vm.CacLoai.Select(m => m.Nhan));
    }

    [Fact]
    public void Ly_do_khoa_OK_lay_nguyen_van_tu_BlockDeXuatRules_khong_viet_lai()
    {
        var vm = Vm(ten: "");

        Assert.Equal(BlockDeXuatRules.Kiem(vm.Meta(), ["XB_ELBOW"]), vm.LyDoChuaHopLe);
    }
}
