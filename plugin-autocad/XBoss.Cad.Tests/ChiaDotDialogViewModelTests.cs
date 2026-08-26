using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M106 AC4/AC9 — ViewModel hộp thoại <c>XBOSS_VE_CHIADOT</c>: phạm vi, ghi đè kiểu nối, và
/// <b>xem trước số đốt + chiều dài từng đốt</b>. Ca then chốt là "xem trước phải KHỚP TUYỆT ĐỐI
/// với <see cref="JointSegmenter"/>" — hộp thoại hứa con số nào thì bản vẽ phải ra đúng con số đó,
/// nếu không kỹ sư đặt gia công theo một bảng và xưởng cắt theo bảng khác.
///
/// Tham số chia đốt lấy từ rule pack v9 THẬT trong repo (cùng nguồn với engine web).
/// </summary>
public class ChiaDotDialogViewModelTests
{
    private static DrawToolsPack Pack() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

    private static DrawLine LoaiTuyen(DrawToolsPack pack, string heId, string itemId) =>
        pack.DrawTools.Systems.Single(s => s.Id == heId).Lines.Single(l => l.ItemId == itemId);

    /// <summary>Một tuyến ứng viên như Adapter đọc ra từ bản vẽ.</summary>
    private static TuyenChiaDot Tuyen(
        DrawToolsPack pack,
        string heId,
        string itemId,
        string size,
        string handle,
        double[] doanMm,
        bool sizeTuNhap = false,
        int runIndex = 1)
    {
        var line = LoaiTuyen(pack, heId, itemId);
        return new TuyenChiaDot(
            handle, heId, itemId, line.Name, size, sizeTuNhap, line.SizeKind, runIndex,
            line.JointRules!, doanMm.Select(d => new DoanTim { LengthMm = d }).ToList());
    }

    private static KetQuaChiaDot ChiaThat(TuyenChiaDot t, string? ghiDe = null) =>
        JointSegmenter.ChiaTuyen(new YeuCauChiaDot
        {
            SystemId = t.HeId,
            ItemId = t.ItemId,
            Size = t.Size,
            SizeKind = t.SizeKind,
            RunIndex = t.RunIndex,
            OverrideJointType = ghiDe,
            Rules = t.Rules,
            Segments = t.Doan,
        });

    private static ChiaDotDialogViewModel Vm(DrawToolsPack pack, params TuyenChiaDot[] tuyen) =>
        new(tuyen, pack.DrawTools.Systems);

    // ===== Mặc định + danh mục =====

    [Fact]
    public void Mac_dinh_la_chon_tay_va_kieu_noi_TU_DONG()
    {
        var pack = Pack();
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]));

        Assert.Equal(PhamViChiaDot.ChonTay, vm.PhamVi);
        Assert.True(vm.ChonTay);
        Assert.False(vm.ChonCaHe);
        Assert.Null(vm.KieuNoi); // TỰ ĐỘNG = mặc định của M105 FR1
        Assert.Equal("XBOSS_VE_CHIADOT — Chia đốt", vm.TieuDe);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Danh_muc_he_chi_liet_he_CO_tuyen_trong_ban_ve()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2B", [5000]),
            Tuyen(pack, "PIPING", "chw-pipe", "DN80", "2C", [12000]));

        Assert.Equal(["HVAC", "PIPING"], vm.CacHe.Select(h => h.Id));
        Assert.Equal(2, vm.CacHe.Single(h => h.Id == "HVAC").SoTuyen);
        Assert.Contains("2 tuyến", vm.CacHe.Single(h => h.Id == "HVAC").Nhan, StringComparison.Ordinal);
    }

    [Fact]
    public void Danh_muc_kieu_noi_dung_bang_selection_cua_rule_pack()
    {
        var pack = Pack();
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]));

        // Mục đầu luôn là TỰ ĐỘNG, sau đó là đúng các kiểu nối tuyến này khai.
        Assert.Null(vm.CacKieuNoi[0].JointType);
        Assert.Equal(
            ["nep_c", "tdc", "mat_bich_v"],
            vm.CacKieuNoi.Skip(1).Select(m => m.JointType));
        Assert.Contains("đốt ≤", vm.CacKieuNoi[2].Nhan, StringComparison.Ordinal);
        Assert.True(vm.ChoGhiDeKieuNoi);
        Assert.Equal("tdc", vm.KieuNoiTuDong); // cạnh lớn 800 → tdc
        Assert.Contains("tdc", vm.MoTaKieuNoi, StringComparison.Ordinal);
    }

    // ===== Phạm vi =====

    [Fact]
    public void Pham_vi_ca_he_chi_lay_tuyen_cua_he_dang_chon()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "PIPING", "chw-pipe", "DN80", "2C", [12000]));

        vm.ChonCaHe = true;
        vm.HeId = "PIPING";

        Assert.Equal(PhamViChiaDot.CaHe, vm.PhamVi);
        Assert.Equal(["2C"], vm.TuyenTrongPhamVi.Select(t => t.Handle));
        Assert.Contains("đúng 1 tuyến", vm.GhiChuPhamVi, StringComparison.Ordinal);
    }

    [Fact]
    public void Pham_vi_chon_tay_noi_ro_xem_truoc_tinh_tren_toan_ban_ve()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2B", [5000]));

        Assert.Contains("toàn bộ 2 tuyến", vm.GhiChuPhamVi, StringComparison.Ordinal);
        Assert.Contains("chọn tuyến trên bản vẽ", vm.GhiChuPhamVi, StringComparison.Ordinal);
    }

    [Fact]
    public void He_khong_con_tuyen_nao_thi_khoa_OK_kem_ly_do()
    {
        var pack = Pack();
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]));

        vm.ChonCaHe = true;
        vm.HeId = "ELV";

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("chưa có tuyến nào", StringComparison.Ordinal));
    }

    // ===== Xem trước (AC4) =====

    [Fact]
    public void Xem_truoc_khop_tung_con_so_voi_JointSegmenter()
    {
        var pack = Pack();
        var tuyen = Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000, 3000]);
        var vm = Vm(pack, tuyen);

        var that = ChiaThat(tuyen);
        Assert.Contains($"{that.PieceCount} đốt", vm.TomTatXemTruoc, StringComparison.Ordinal);
        Assert.Contains($"{that.JointCount} mối", vm.TomTatXemTruoc, StringComparison.Ordinal);

        var dong = Assert.Single(vm.DongXemTruoc);
        Assert.Contains("2A", dong, StringComparison.Ordinal);
        Assert.Contains(that.JointType, dong, StringComparison.Ordinal);
        foreach (var dot in that.Pieces)
            Assert.Contains(dot.LengthMm.ToString("#,##0.#", System.Globalization.CultureInfo.InvariantCulture), dong, StringComparison.Ordinal);
    }

    [Fact]
    public void Doi_kieu_noi_thi_so_dot_cap_nhat_ngay()
    {
        var pack = Pack();
        var tuyen = Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]);
        var vm = Vm(pack, tuyen);

        var tuDong = ChiaThat(tuyen);
        Assert.Contains($"{tuDong.PieceCount} đốt", vm.TomTatXemTruoc, StringComparison.Ordinal);

        vm.KieuNoi = "nep_c"; // ghi đè xuống kiểu đốt ngắn hơn

        var ghiDe = ChiaThat(tuyen, "nep_c");
        Assert.Contains($"{ghiDe.PieceCount} đốt", vm.TomTatXemTruoc, StringComparison.Ordinal);
        Assert.Contains(vm.DongXemTruoc, d => d.Contains("nep_c", StringComparison.Ordinal));
        Assert.Contains(vm.DongXemTruoc, d => d.Contains("ghi đè tay", StringComparison.Ordinal));
        Assert.Equal("nep_c", vm.KetQua()!.KieuNoi);
    }

    [Fact]
    public void Ghi_de_kieu_noi_vuot_nguong_thi_hien_canh_bao_nghiep_vu_cua_engine()
    {
        var pack = Pack();
        // Cạnh lớn 800 > ngưỡng 450 của nẹp C ⇒ engine sinh cảnh báo vuot_nguong_canh_lon.
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]));

        vm.KieuNoi = "nep_c";

        Assert.Contains(
            vm.CanhBao,
            c => c.Contains(JointSegmenter.NhanCanhBao[CanhBaoChiaDot.VuotNguongCanhLon], StringComparison.Ordinal));
        Assert.True(vm.CoTheOk); // cảnh báo nghiệp vụ KHÔNG khóa OK — kỹ sư tự quyết
    }

    [Fact]
    public void Doi_pham_vi_lam_ghi_de_het_hop_le_thi_tu_ve_TU_DONG()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "PIPING", "chw-pipe", "DN80", "2C", [12000]));

        vm.ChonCaHe = true;
        vm.HeId = "HVAC";
        vm.KieuNoi = "nep_c";
        Assert.Equal("nep_c", vm.KieuNoi);

        vm.ChonTay = true; // phạm vi lại gồm 2 loại tuyến → "nep_c" không còn nghĩa

        Assert.Null(vm.KieuNoi);
        Assert.False(vm.ChoGhiDeKieuNoi);
        Assert.Null(vm.KetQua()!.KieuNoi);
    }

    [Fact]
    public void Nhieu_loai_tuyen_thi_khoa_ghi_de_kieu_noi_kem_giai_thich()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "PIPING", "chw-pipe", "DN80", "2C", [12000]));

        Assert.False(vm.ChoGhiDeKieuNoi);
        Assert.Single(vm.CacKieuNoi); // chỉ còn mục TỰ ĐỘNG
        Assert.Contains("2 loại tuyến", vm.MoTaKieuNoi, StringComparison.Ordinal);
        Assert.True(vm.CoTheOk);
    }

    [Fact]
    public void Xem_truoc_dai_thi_gop_duoi_thanh_mot_dong_dem()
    {
        var pack = Pack();
        var tuyen = Enumerable.Range(1, 15)
            .Select(i => Tuyen(pack, "HVAC", "duct-supp", "800x400", $"H{i}", [5000], runIndex: i))
            .ToArray();
        var vm = Vm(pack, tuyen);

        Assert.Equal(13, vm.DongXemTruoc.Count); // 12 dòng + 1 dòng gộp
        Assert.Contains("và 3 tuyến nữa", vm.DongXemTruoc[^1], StringComparison.Ordinal);
    }

    // ===== Ca hỏng: lý do rõ, không văng lỗi (AC9) =====

    [Fact]
    public void Ban_ve_khong_co_tuyen_nao_thi_khoa_OK_kem_ly_do()
    {
        var vm = Vm(Pack());

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("jointRules", StringComparison.Ordinal));
    }

    [Fact]
    public void Tuyen_co_co_khong_doc_duoc_thi_bo_qua_kem_ly_do_chu_khong_vang_loi()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "cỡ lạ", "2A", [5000], sizeTuNhap: true),
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2B", [5000]));

        // Tuyến hỏng chỉ bị BỎ QUA kèm lý do; tuyến còn lại vẫn xem trước và OK được.
        Assert.True(vm.CoTheOk);
        Assert.Single(vm.DongXemTruoc);
        Assert.Contains(vm.CanhBao, c => c.Contains("Bỏ qua 1 tuyến", StringComparison.Ordinal));
        Assert.Contains(vm.CanhBao, c => c.Contains("NGOÀI danh mục", StringComparison.Ordinal));
    }

    [Fact]
    public void Moi_tuyen_deu_hong_thi_khoa_OK_va_neu_ly_do_cu_the()
    {
        var pack = Pack();
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "cỡ lạ", "2A", [5000]));

        Assert.False(vm.CoTheOk);
        Assert.Equal(MucThongDiep.Loi, vm.MucDo);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không tuyến nào", StringComparison.Ordinal));
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("2A", StringComparison.Ordinal));
    }

    // ===== Bản ghi tham số trả cho lệnh =====

    [Fact]
    public void KetQua_mang_dung_bo_tham_so_ma_lenh_can()
    {
        var pack = Pack();
        var vm = Vm(
            pack,
            Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]),
            Tuyen(pack, "PIPING", "chw-pipe", "DN80", "2C", [12000]));

        vm.ChonCaHe = true;
        vm.HeId = "PIPING";
        vm.KieuNoi = "ren";

        var kq = vm.KetQua()!;
        Assert.Equal(PhamViChiaDot.CaHe, kq.PhamVi);
        Assert.Equal("PIPING", kq.HeId);
        Assert.Equal("ren", kq.KieuNoi);
    }

    [Fact]
    public void KetQua_pham_vi_chon_tay_khong_mang_he()
    {
        var pack = Pack();
        var vm = Vm(pack, Tuyen(pack, "HVAC", "duct-supp", "800x400", "2A", [5000]));

        var kq = vm.KetQua()!;
        Assert.Equal(PhamViChiaDot.ChonTay, kq.PhamVi);
        Assert.Null(kq.HeId);
    }
}
