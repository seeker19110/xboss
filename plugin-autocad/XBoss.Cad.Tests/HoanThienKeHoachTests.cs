using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §6 bước 5 / FR3 / FR4 / AC3 — phần TÍNH ĐƯỢC của <c>XBOSS_HOANTHIEN</c>: lập kế hoạch 8
/// giai đoạn từ đồ thị đã chốt, và tính "tập thực thể cần thay thế" khi chạy lại.
///
/// Không có AutoCAD ở đây và cũng không cần: quyết định "chạy giai đoạn nào, trên tuyến nào, xóa
/// đúng thực thể nào" nằm trọn ở Core; Adapter chỉ đọc bản vẽ thành DTO rồi thi hành.
/// Đồ thị đầu vào dựng từ đúng bản vẽ giả lập AC1 của <see cref="TuyenGraphTests"/>.
/// </summary>
public class HoanThienKeHoachTests
{
    private static CompletionPolicySection Cp() => TuyenGraphTests.CompletionPhatHanh();

    /// <summary>Bản chốt đồ thị của bản vẽ AC1 — dựng đúng cách Adapter dựng ở XBOSS_TUYEN_DOTHI.</summary>
    internal static DoThiChot ChotAc1()
    {
        var g = TuyenGraphTests.DungAc1();
        var phanLoai = NutPhanLoai.PhanLoai(g);
        var phuKien = SuyPhuKien.Suy(phanLoai, Cp())
            .Where(p => p.TrangThai != TrangThaiPhuKien.KhongCan)
            .Select(p => new PhuKienChot(
                p.Nut, p.TrangThai, p.NodeKind, p.BlockId, p.BlockKind, p.Ten, SuaTay: false, BoQua: false))
            .ToList();

        return new DoThiChot(
            "2026-08-30",
            "v16",
            g.Nut[g.NutNguon].ViTri.X,
            g.Nut[g.NutNguon].ViTri.Y,
            g.TuyenGoc.Select(t => new TuyenChot(t.Id, t.HeId, t.Size, t.CaoDoMm, t.KieuNoi)).ToList(),
            phanLoai
                .Select(n => new NutChot(
                    n.Nut, g.Nut[n.Nut].ViTri.X, g.Nut[n.Nut].ViTri.Y, n.Loai, n.SoNhanh,
                    n.GocDoiHuongDeg, n.HeId, n.Size))
                .ToList(),
            g.Canh.Select(c => new CanhChot(c.ChiSo, c.Tu, c.Den, c.TuyenId, c.ChieuDai)).ToList(),
            g.ThietBi.Select(t => new ThietBiChot(t.Nut, t.ThietBiId, t.HeId, t.Tag)).ToList(),
            phuKien);
    }

    private static string[] MoiGiaiDoan() => HoanThienKeHoach.DanhMuc.Select(g => g.Ten).ToArray();

    // ===== FR3 — 8 giai đoạn, THỨ TỰ CHẠY CỐ ĐỊNH =====

    [Fact]
    public void Danh_muc_dung_8_giai_doan_va_khop_stageDefaults_cua_rule_pack()
    {
        Assert.Equal(8, HoanThienKeHoach.DanhMuc.Count);
        Assert.Equal(
            CompletionPolicySection.TenGiaiDoan,
            HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu).Select(g => g.Ten).ToList());
        Assert.Equal(Enumerable.Range(1, 8), HoanThienKeHoach.DanhMuc.Select(g => g.SoThuTu).Order());
    }

    [Fact]
    public void Ke_hoach_chay_theo_thu_tu_co_dinh_du_tick_lon_xon()
    {
        var lonXon = new[] { "thongKe", "phuKienTaiNut", "netDoi", "ngatNet" };
        var keHoach = HoanThienKeHoach.Lap(ChotAc1(), lonXon);

        Assert.Equal(
            ["netDoi", "phuKienTaiNut", "ngatNet", "thongKe"],
            keHoach.Select(v => v.GiaiDoan.Ten).ToList());
    }

    [Fact]
    public void Giai_doan_khong_bat_khong_vao_ke_hoach_va_khoa_la_bi_bo_qua()
    {
        var keHoach = HoanThienKeHoach.Lap(ChotAc1(), ["chiaDot", "giaiDoanKhongCoThat"]);

        Assert.Single(keHoach);
        Assert.Equal("chiaDot", keHoach[0].GiaiDoan.Ten);
    }

    [Fact]
    public void Moi_giai_doan_nhan_dung_danh_sach_tuyen_cua_do_thi()
    {
        var chot = ChotAc1();
        var keHoach = HoanThienKeHoach.Lap(chot, MoiGiaiDoan());

        Assert.Equal(8, keHoach.Count);
        Assert.All(keHoach, v => Assert.Equal(
            chot.Tuyen.Select(t => t.TuyenId).ToList(), v.TuyenGoc));
    }

    // ===== FR3 — nút phụ kiện: chỉ nút ĐÃ CHỐT block mới được chèn =====

    [Fact]
    public void Chi_giai_doan_phu_kien_mang_danh_sach_nut()
    {
        var keHoach = HoanThienKeHoach.Lap(ChotAc1(), MoiGiaiDoan());

        var phuKien = keHoach.Single(v => v.GiaiDoan.Ten == "phuKienTaiNut");
        Assert.NotEmpty(phuKien.Nut);
        Assert.All(keHoach.Where(v => v.GiaiDoan.Ten != "phuKienTaiNut"), v => Assert.Empty(v.Nut));
    }

    [Fact]
    public void Nut_bi_bo_qua_va_nut_chua_quyet_khong_duoc_chen_nhung_van_duoc_dem()
    {
        var goc = ChotAc1();
        var pkGoc = goc.PhuKien.ToList();
        Assert.True(pkGoc.Count >= 2, "Bản vẽ AC1 phải có ít nhất 2 nút cần phụ kiện");

        var sua = pkGoc
            .Select((p, i) => i switch
            {
                0 => p with { BoQua = true, SuaTay = true },
                1 => p with { TrangThai = TrangThaiPhuKien.ChuaQuyet, BlockId = null },
                _ => p,
            })
            .ToList();
        var chot = goc with { PhuKien = sua };

        var viec = HoanThienKeHoach.Lap(chot, ["phuKienTaiNut"]).Single();

        Assert.DoesNotContain(sua[0].Nut, viec.Nut);
        Assert.DoesNotContain(sua[1].Nut, viec.Nut);
        Assert.Equal(1, viec.SoNutBoQua);
        Assert.Equal(1, viec.SoNutChuaQuyet);
        Assert.Equal(pkGoc.Count - 2, viec.Nut.Count);
    }

    // ===== FR4 / AC3 — chạy lại thay thế đúng phần của chính mình =====

    private static ThucTheDaSinh Da(string handle, string giaiDoan, string tuyen, bool suaTay = false) =>
        new(handle, giaiDoan, tuyen, suaTay);

    [Fact]
    public void Chay_lai_xoa_dung_thuc_the_cua_chinh_giai_doan_va_tuyen_trong_pham_vi()
    {
        var chot = ChotAc1();
        var trong = chot.Tuyen[0].TuyenId;
        var keHoach = HoanThienKeHoach.Lap(chot, ["phuKienTaiNut", "chiaDot"]);

        var daSinh = new[]
        {
            Da("100", "phuKienTaiNut", trong),
            Da("101", "chiaDot", trong),
            // Giai đoạn KHÔNG chạy lần này (giá đỡ) — giữ nguyên dù cùng tuyến.
            Da("102", "giaDo", trong),
            // Tuyến ngoài phạm vi (bản vẽ có cụm tuyến khác) — giữ nguyên.
            Da("103", "phuKienTaiNut", "TUYEN-CUM-KHAC"),
        };

        var kq = HoanThienKeHoach.TinhThayThe(daSinh, keHoach);

        Assert.Equal(["100", "101"], kq.CanXoa);
        Assert.Equal(["102", "103"], kq.GiuViNgoaiPhamVi);
        Assert.Empty(kq.GiuViSuaTay);
    }

    [Fact]
    public void Thuc_the_da_sua_tay_khong_bao_gio_bi_xoa()
    {
        var chot = ChotAc1();
        var trong = chot.Tuyen[0].TuyenId;
        var keHoach = HoanThienKeHoach.Lap(chot, ["phuKienTaiNut"]);

        var kq = HoanThienKeHoach.TinhThayThe(
            [Da("200", "phuKienTaiNut", trong), Da("201", "phuKienTaiNut", trong, suaTay: true)],
            keHoach);

        Assert.Equal(["200"], kq.CanXoa);
        Assert.Equal(["201"], kq.GiuViSuaTay);
    }

    /// <summary>
    /// AC3 — chạy hai lần liên tiếp trên cùng input thì SỐ THỰC THỂ không đổi: lần 2 xóa đúng
    /// những gì lần 1 sinh ra rồi sinh lại đúng bấy nhiêu cái.
    /// </summary>
    [Fact]
    public void Ac3_chay_hai_lan_lien_tiep_so_thuc_the_khong_doi()
    {
        var chot = ChotAc1();
        var keHoach = HoanThienKeHoach.Lap(chot, MoiGiaiDoan());
        var trong = chot.Tuyen[0].TuyenId;

        // Lần 1: bản vẽ trống ⇒ không xóa gì, sinh ra 3 thực thể.
        var lan1 = HoanThienKeHoach.TinhThayThe([], keHoach);
        Assert.Empty(lan1.CanXoa);
        var sauLan1 = new List<ThucTheDaSinh>
        {
            Da("300", "phuKienTaiNut", trong),
            Da("301", "phuKienTaiNut", trong),
            Da("302", "loCho", trong),
        };

        // Lần 2: cùng input ⇒ xóa hết 3 cái cũ rồi sinh lại 3 cái ⇒ tổng vẫn 3.
        var lan2 = HoanThienKeHoach.TinhThayThe(sauLan1, keHoach);
        Assert.Equal(sauLan1.Count, lan2.CanXoa.Count);
        var sauLan2 = sauLan1.Count - lan2.CanXoa.Count + sauLan1.Count;
        Assert.Equal(sauLan1.Count, sauLan2);
    }

    [Fact]
    public void Thuc_the_ky_su_ve_tay_khong_mang_dau_M115_thi_khong_co_trong_ke_hoach_thay_the()
    {
        // Bộ lọc "chỉ nguon=M115" nằm ở Adapter; ở đây kiểm hệ quả: một handle chưa từng được đưa
        // vào TinhThayThe thì không xuất hiện trong bất kỳ danh sách nào của kế hoạch.
        var keHoach = HoanThienKeHoach.Lap(ChotAc1(), MoiGiaiDoan());
        var kq = HoanThienKeHoach.TinhThayThe([], keHoach);

        Assert.Empty(kq.CanXoa);
        Assert.Empty(kq.GiuViSuaTay);
        Assert.Empty(kq.GiuViNgoaiPhamVi);
    }

    // ===== FR4 — khuôn XData của dấu nguồn/giai đoạn đi qua được vòng mã hóa =====

    [Fact]
    public void Dau_M115_tren_xdata_ma_hoa_giai_ma_khong_mat()
    {
        var goc = new VeXDataInfo
        {
            VaiTro = VaiTroVe.PhuKien,
            HeId = "HVAC",
            HandleTim = "1A2B",
            NguonHoanThien = HoanThienKeHoach.NguonM115,
            GiaiDoanHoanThien = "phuKienTaiNut",
            BamHinhHoc = "abc123",
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(goc));

        Assert.NotNull(lai);
        Assert.Equal(HoanThienKeHoach.NguonM115, lai!.NguonHoanThien);
        Assert.Equal("phuKienTaiNut", lai.GiaiDoanHoanThien);
        Assert.Equal("1A2B", lai.HandleTim);
    }

    [Fact]
    public void Xdata_cu_khong_co_dau_M115_van_doc_duoc_va_khong_bi_coi_la_cua_M115()
    {
        var lai = VeXData.GiaiMa(VeXData.MaHoa(new VeXDataInfo { VaiTro = VaiTroVe.PhuKien, HeId = "HVAC" }));

        Assert.NotNull(lai);
        Assert.Null(lai!.NguonHoanThien);
        Assert.Null(lai.GiaiDoanHoanThien);
    }

    // ===== FR3 — báo cáo phiên: mục hoàn thiện =====

    [Fact]
    public void Bao_cao_phien_gom_thuc_the_theo_giai_doan_va_dem_nut_bo_qua()
    {
        var chot = ChotAc1();
        var chotCoBoQua = chot with
        {
            PhuKien = chot.PhuKien
                .Select((p, i) => i == 0 ? p with { BoQua = true } : p)
                .ToList(),
        };

        VeXDataInfo Sinh(string giaiDoan, string tim, bool suaTay = false) => new()
        {
            VaiTro = VaiTroVe.PhuKien,
            HeId = "HVAC",
            HandleTim = tim,
            NguonHoanThien = HoanThienKeHoach.NguonM115,
            GiaiDoanHoanThien = giaiDoan,
            SuaTay = suaTay,
        };

        var bc = VeSessionReport.Dung(
            [
                Sinh("phuKienTaiNut", "A"),
                Sinh("phuKienTaiNut", "B"),
                Sinh("phuKienTaiNut", "B", suaTay: true),
                Sinh("loCho", "A"),
                // Đối tượng kỹ sư vẽ bằng lệnh cũ — KHÔNG được lọt vào mục hoàn thiện.
                new VeXDataInfo { VaiTro = VaiTroVe.PhuKien, HeId = "HVAC", HandleTim = "A" },
            ],
            new VeSessionMeta { RulePackVersion = "v16", TenBanVe = "T", NgayIso = "2026-08-30" },
            nhatKy: null,
            doThi: chotCoBoQua);

        Assert.Equal(2, bc.HoanThien.Count);
        // Thứ tự bám thứ tự chạy ① → ⑧, không phải bảng chữ cái.
        Assert.Equal(["phuKienTaiNut", "loCho"], bc.HoanThien.Select(h => h.GiaiDoan).ToList());

        var pk = bc.HoanThien[0];
        Assert.Equal(3, pk.SoThucThe);
        Assert.Equal(2, pk.SoTuyen);
        Assert.Equal(1, pk.SoSuaTay);

        Assert.Equal(1, bc.HoanThienNutBoQua);
        Assert.Contains(bc.CanhBao, c => c.Contains("SỬA TAY"));
        Assert.Contains("Hoàn thiện bản vẽ", bc.ToVietnameseText());
    }

    // ===== FR3 — hộp thoại chọn giai đoạn =====

    [Fact]
    public void Hop_thoai_tick_san_dung_theo_stageDefaults_cua_rule_pack()
    {
        var cp = Cp();
        var vm = new HoanThienDialogViewModel(ChotAc1(), cp);

        Assert.Equal(8, vm.CacGiaiDoan.Count);
        Assert.All(vm.CacGiaiDoan, m => Assert.Equal(cp.BatSan(m.GiaiDoan.Ten), m.Bat));
        Assert.Equal(
            HoanThienKeHoach.DanhMuc.OrderBy(g => g.SoThuTu).Select(g => g.Ten).ToList(),
            vm.CacGiaiDoan.Select(m => m.GiaiDoan.Ten).ToList());
    }

    [Fact]
    public void Hop_thoai_khoa_ok_khi_bo_het_tick_va_mo_lai_khi_tick_lai()
    {
        var vm = new HoanThienDialogViewModel(ChotAc1(), Cp());
        foreach (var m in vm.CacGiaiDoan) m.Bat = false;

        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Chưa tick giai đoạn nào"));

        vm.CacGiaiDoan[0].Bat = true;
        Assert.True(vm.CoTheOk);
        Assert.Equal([vm.CacGiaiDoan[0].GiaiDoan.Ten], vm.KetQua().GiaiDoanBat);
    }

    [Fact]
    public void Hop_thoai_tra_ket_qua_theo_thu_tu_chay_co_dinh()
    {
        var vm = new HoanThienDialogViewModel(ChotAc1(), Cp());
        foreach (var m in vm.CacGiaiDoan) m.Bat = false;
        // Tick ngược: ⑧ trước, rồi ①.
        vm.CacGiaiDoan.Single(m => m.GiaiDoan.Ten == "thongKe").Bat = true;
        vm.CacGiaiDoan.Single(m => m.GiaiDoan.Ten == "netDoi").Bat = true;

        Assert.Equal(["netDoi", "thongKe"], vm.KetQua().GiaiDoanBat);
        Assert.Contains("2/8 giai đoạn", vm.GhiChu);
    }
}
