using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §6 bước 3–4 / FR2 / AC6 — phần logic THUẦN của hộp thoại <c>XBOSS_TUYEN_DOTHI</c>:
/// nút "Chốt đồ thị" bật/tắt theo lỗi CHẶN, danh sách lựa chọn phụ kiện hợp lệ theo hệ, và
/// chuyển trạng thái duyệt (đổi phụ kiện / bỏ qua nút) thành bản chốt.
///
/// Đồ thị đầu vào lấy từ đúng bản vẽ giả lập AC1 của <see cref="TuyenGraphTests"/> — hai tầng test
/// không dùng hai bộ dữ liệu khác nhau.
/// </summary>
public class TuyenDoThiViewModelTests
{
    private static CompletionPolicySection Cp() => TuyenGraphTests.CompletionPhatHanh();

    /// <summary>Đồ thị AC1 + đúng bộ dữ liệu mà Adapter đưa vào ViewModel.</summary>
    private static TuyenDoThiDialogViewModel Vm(TuyenGraph g)
    {
        var phanLoai = NutPhanLoai.PhanLoai(g);
        var kiem = KiemTuyen.Kiem(g, phanLoai);
        var phuKien = SuyPhuKien.Suy(phanLoai, Cp())
            .Where(p => p.TrangThai != TrangThaiPhuKien.KhongCan)
            .ToList();
        return new TuyenDoThiDialogViewModel(
            kiem, phuKien, Cp(),
            phanLoai.ToDictionary(n => n.Nut, n => g.Nut[n.Nut].ViTri),
            phanLoai.ToDictionary(n => n.Nut, n => n.HeId));
    }

    /// <summary>Bản vẽ AC1 nhưng một nhánh CHƯA gán cỡ ⇒ lỗi CHẶN "thiếu cỡ".</summary>
    private static TuyenGraph DoThiCoLoiChan()
    {
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var hong = tuyen.Select(t => t.Id == "NHANH-A" ? t with { Size = null } : t).ToList();
        return TuyenGraph.Dung(hong, thietBi, TuyenGraphTests.D(0, 0), TuyenGraphTests.ThamSoPhatHanh());
    }

    // ===== AC6 — nút "Chốt đồ thị" chỉ bật khi hết lỗi chặn =====

    [Fact]
    public void Khong_loi_chan_thi_chot_duoc()
    {
        var vm = Vm(TuyenGraphTests.DungAc1());
        Assert.True(vm.CoTheChot);
        Assert.True(vm.CoTheOk);
        Assert.NotNull(vm.KetQua());
    }

    [Fact]
    public void Con_loi_chan_thi_khoa_nut_chot_va_khong_tra_ket_qua()
    {
        var vm = Vm(DoThiCoLoiChan());
        Assert.False(vm.CoTheChot);
        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("lỗi CHẶN"));
        Assert.Contains(vm.CacLoi, m => m.Loi.Loai == LoaiLoiTuyen.ThieuSize && m.Nhan.StartsWith("CHẶN"));
    }

    [Fact]
    public void Canh_bao_khong_khoa_nut_chot()
    {
        // Bỏ cao độ của mọi tuyến: chỉ sinh CẢNH BÁO "thiếu thuộc tính", không phải lỗi chặn.
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var g = TuyenGraph.Dung(
            tuyen.Select(t => t with { CaoDoMm = null }).ToList(), thietBi,
            TuyenGraphTests.D(0, 0), TuyenGraphTests.ThamSoPhatHanh());

        var vm = Vm(g);
        Assert.True(vm.CoTheOk);
        Assert.NotEmpty(vm.CanhBao);
    }

    // ===== Danh sách lựa chọn hợp lệ theo hệ =====

    [Fact]
    public void Lua_chon_hop_le_chi_gom_luat_cua_dung_he_kem_muc_bo_qua()
    {
        var cp = Cp();
        var luat = TuyenDoThiDialogViewModel.LuaChonHopLe(cp, "HVAC");

        Assert.All(luat.Where(l => !l.LaBoQua), l => Assert.Equal("HVAC", l.Luat!.SystemId));
        Assert.Equal(
            cp.FittingRules.Count(r => r.SystemId == "HVAC"),
            luat.Count(l => !l.LaBoQua));
        Assert.Single(luat, l => l.LaBoQua);
        Assert.True(luat[^1].LaBoQua); // mục "bỏ qua" luôn ở cuối
    }

    [Fact]
    public void Nut_chua_gan_he_thi_chi_con_muc_bo_qua_khong_muon_luat_he_khac()
    {
        var luat = TuyenDoThiDialogViewModel.LuaChonHopLe(Cp(), null);
        Assert.Single(luat);
        Assert.True(luat[0].LaBoQua);
    }

    [Fact]
    public void Danh_sach_giu_dung_thu_tu_khai_trong_rule_pack()
    {
        var cp = Cp();
        Assert.Equal(
            cp.FittingRules.Where(r => r.SystemId == "HVAC").Select(r => r.BlockId),
            TuyenDoThiDialogViewModel.LuaChonHopLe(cp, "HVAC")
                .Where(l => !l.LaBoQua).Select(l => l.Luat!.BlockId));
    }

    // ===== Chuyển trạng thái duyệt =====

    [Fact]
    public void Mac_dinh_mo_san_o_dung_luat_plugin_da_suy_va_khong_tinh_la_sua_tay()
    {
        var vm = Vm(TuyenGraphTests.DungAc1());
        var daChon = vm.CacNut.Where(n => n.PhuKien.TrangThai == TrangThaiPhuKien.DaChon).ToList();

        Assert.NotEmpty(daChon);
        Assert.All(daChon, n =>
        {
            Assert.Equal(n.PhuKien.BlockId, n.DangChon.Luat?.BlockId);
            Assert.False(n.SuaTay);
        });
        Assert.All(vm.CacNut, n => Assert.False(n.SuaTay));
        Assert.Null(vm.KetQua()!.PhuKien.FirstOrDefault(p => p.SuaTay));
    }

    [Fact]
    public void Ky_su_doi_phu_kien_thi_ban_chot_ghi_lua_chon_moi_va_danh_dau_sua_tay()
    {
        var vm = Vm(TuyenGraphTests.DungAc1());
        var muc = vm.CacNut.First(n => n.PhuKien.TrangThai == TrangThaiPhuKien.DaChon);
        var khac = muc.LuaChon.First(l =>
            !l.LaBoQua && l.Luat!.BlockId != muc.PhuKien.BlockId);

        muc.DangChon = khac;

        Assert.True(muc.SuaTay);
        Assert.Contains("kỹ sư đã sửa", muc.Nhan);
        var chot = vm.KetQua()!.PhuKien.First(p => p.Nut == muc.PhuKien.Nut);
        Assert.Equal(khac.Luat!.BlockId, chot.BlockId);
        Assert.Equal(khac.Luat.Name, chot.Ten);
        Assert.Equal(TrangThaiPhuKien.DaChon, chot.TrangThai);
        Assert.True(chot.SuaTay);
        Assert.False(chot.BoQua);
    }

    [Fact]
    public void Ky_su_bo_qua_nut_thi_ban_chot_khong_chen_phu_kien_nao()
    {
        var vm = Vm(TuyenGraphTests.DungAc1());
        var muc = vm.CacNut.First(n => n.PhuKien.TrangThai == TrangThaiPhuKien.DaChon);

        muc.DangChon = muc.LuaChon.First(l => l.LaBoQua);

        var chot = vm.KetQua()!.PhuKien.First(p => p.Nut == muc.PhuKien.Nut);
        Assert.True(chot.BoQua);
        Assert.True(chot.SuaTay);
        Assert.Null(chot.BlockId);
        Assert.Equal(TrangThaiPhuKien.ChuaQuyet, chot.TrangThai);
    }

    [Fact]
    public void Nut_chua_quyet_de_nguyen_thi_khong_tinh_la_sua_tay_va_van_chot_duoc()
    {
        // Tuyến chưa gán HỆ ⇒ không tra được bảng luật ⇒ mọi nút thành "chưa quyết" (không phải lỗi).
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var g = TuyenGraph.Dung(
            tuyen.Select(t => t with { HeId = null }).ToList(),
            thietBi.Select(t => t with { HeId = null }).ToList(),
            TuyenGraphTests.D(0, 0), TuyenGraphTests.ThamSoPhatHanh());
        var vm = Vm(g);

        var chuaQuyet = vm.CacNut.Where(n => n.PhuKien.TrangThai == TrangThaiPhuKien.ChuaQuyet).ToList();
        Assert.NotEmpty(chuaQuyet);
        Assert.All(chuaQuyet, n => Assert.False(n.SuaTay));
        Assert.True(vm.CoTheOk); // chưa quyết KHÔNG phải lỗi chặn
        Assert.All(
            vm.KetQua()!.PhuKien.Where(p => chuaQuyet.Any(n => n.PhuKien.Nut == p.Nut)),
            p => Assert.True(p.BoQua));
    }

    [Fact]
    public void Tom_tat_nut_dem_dung_so_nut_se_chen_va_so_nut_sua_tay()
    {
        var vm = Vm(TuyenGraphTests.DungAc1());
        var tong = vm.CacNut.Count(n => !n.Chot().BoQua);
        Assert.Contains($"{tong}/{vm.CacNut.Count} nút sẽ chèn", vm.TomTatNut);

        vm.CacNut.First(n => n.PhuKien.TrangThai == TrangThaiPhuKien.DaChon).DangChon =
            vm.CacNut.First(n => n.PhuKien.TrangThai == TrangThaiPhuKien.DaChon)
                .LuaChon.First(l => l.LaBoQua);

        Assert.Contains($"{tong - 1}/{vm.CacNut.Count} nút sẽ chèn", vm.TomTatNut);
        Assert.Contains("1 nút kỹ sư đã sửa tay", vm.TomTatNut);
    }
}
