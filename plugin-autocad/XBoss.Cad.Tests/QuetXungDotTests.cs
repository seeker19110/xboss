using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M116 §6 bước 2 / §7 FR1+FR3 / AC1 — quét 3 lớp xung đột phối hợp trên DTO tuyến thuần
/// (<see cref="QuetXungDot"/>), id ổn định (<see cref="XungDotId"/>) và đề xuất sinh từ bảng luật
/// rule pack (<see cref="DeXuatXuLy"/>). Toàn bộ chạy trên CI Linux, không đụng AutoCAD.
///
/// Quy ước dựng ca: bản vẽ đơn vị mm (<c>donViTrenMm = 1</c>) trừ khi ca đó cố ý kiểm quy đổi.
/// </summary>
public class QuetXungDotTests
{
    /// <summary>Bảng ưu tiên dùng cho phần lớn ca — HVAC đi trên, ELV nhường sau cùng.</summary>
    private static readonly string[] UuTien = ["HVAC", "PIPING", "FIREFIGHTING", "ELECTRICAL", "ELV"];

    private static CoordinationPolicySection ChinhSach(
        double khoangBaoTriMm = 200,
        params (string A, string B, double Mm)[] cap) => new()
    {
        Enabled = true,
        PriorityFrom = "crossingPolicy",
        MaintenanceGapMm = khoangBaoTriMm,
        MinClearancePairsMm = cap
            .Select(c => new CapKhoangCach { SystemA = c.A, SystemB = c.B, MinClearanceMm = c.Mm })
            .ToList(),
    };

    private static TuyenPhoiHop Tuyen(
        string id,
        string heId,
        (double X, double Y) dau,
        (double X, double Y) cuoi,
        double? caoDoMm = null,
        double beCaoMm = 0,
        double beRongMm = 0,
        string co = "") =>
        new(id, [new Diem2(dau.X, dau.Y), new Diem2(cuoi.X, cuoi.Y)], heId, caoDoMm, beCaoMm, beRongMm, co);

    /// <summary>Ống gió chạy ngang, tim 3000 mm, dải cao độ 2800..3200.</summary>
    private static TuyenPhoiHop OngGioNgang(string id = "A1") =>
        Tuyen(id, "HVAC", (0, 0), (10000, 0), 3000, 400, 800, "800x400");

    /// <summary>Máng cáp chạy dọc cắt qua ống gió tại (5000, 0).</summary>
    private static TuyenPhoiHop MangCapDoc(string id = "B1", double? caoDoMm = 3100) =>
        Tuyen(id, "ELECTRICAL", (5000, -5000), (5000, 5000), caoDoMm, caoDoMm is null ? 0 : 200, 300, "300");

    // ===== AC1 — lớp 1: giao cắt khi dải cao độ chồng =====

    [Fact]
    public void AC1_hai_he_giao_nhau_dai_cao_do_chong_ra_dung_mot_xung_dot_CUNG()
    {
        var gio = OngGioNgang();
        var mang = MangCapDoc();

        var xd = Assert.Single(QuetXungDot.Quet([gio, mang], ChinhSach(), UuTien));

        Assert.Equal(LopKiem.GiaoCatCaoDo, xd.Lop);
        Assert.Equal(MucXungDot.Cung, xd.Muc);
        Assert.False(xd.ThieuCaoDo);
        Assert.Equal([gio.Id, mang.Id], xd.IdTuyen);
        Assert.Equal(["HVAC", "ELECTRICAL"], xd.HeLienQuan);
        Assert.Equal(5000, xd.ViTri.X, 6);
        Assert.Equal(0, xd.ViTri.Y, 6);
        // Chồng = min(3200; 3200) − max(2800; 3000) = 200 mm.
        Assert.Equal(200, xd.SoLieuMm!.Value, 6);
        Assert.Contains("Giao cắt cùng cao độ", xd.MoTa);
    }

    [Fact]
    public void AC1_de_xuat_dung_chieu_uu_tien_va_cao_do_moi_suy_tu_hinh_hoc()
    {
        var xd = Assert.Single(QuetXungDot.Quet([OngGioNgang(), MangCapDoc()], ChinhSach(), UuTien));

        var nhuong = xd.DeXuat.First(d => d.Loai == LoaiDeXuat.NhuongCaoDo);
        Assert.Equal("ELECTRICAL", nhuong.HeNhuong); // ELECTRICAL xếp sau HVAC trong priority
        // Mép trên máng cáp xuống ngay dưới đáy ống gió: 2800 − 200/2 = 2700 mm.
        Assert.Equal(2700, nhuong.SoLieuMm!.Value, 6);
        Assert.Contains("B1", nhuong.MoTa);

        // Luôn kèm phương án 2 (fitting vượt) cho ca không hạ được cao độ.
        Assert.Contains(xd.DeXuat, d => d.Loai == LoaiDeXuat.FittingVuot);
    }

    [Fact]
    public void AC1_cung_vi_tri_nhung_dai_cao_do_tach_roi_thi_KHONG_bao()
    {
        // Máng cáp ở 1900..2100, ống gió ở 2800..3200 — giao nhau trên mặt bằng nhưng không va nhau.
        var mangThap = Tuyen("B1", "ELECTRICAL", (5000, -5000), (5000, 5000), 2000, 200, 300);

        Assert.Empty(QuetXungDot.Quet([OngGioNgang(), mangThap], ChinhSach(), UuTien));
    }

    [Fact]
    public void Hai_tuyen_CUNG_he_giao_nhau_thi_khong_phai_xung_dot_lien_he()
    {
        // Cùng quy ước crossingPolicy: cấp × thoát nước cùng hệ PIPING là việc của kỹ sư.
        var a = Tuyen("A1", "PIPING", (0, 0), (10000, 0), 3000, 200, 200);
        var b = Tuyen("B1", "PIPING", (5000, -5000), (5000, 5000), 3000, 200, 200);

        Assert.Empty(QuetXungDot.Quet([a, b], ChinhSach(), UuTien));
    }

    [Fact]
    public void Tuyen_chua_gan_he_hoac_thieu_dinh_bi_bo_qua_khong_doan()
    {
        var chuaGanHe = Tuyen("B1", "", (5000, -5000), (5000, 5000), 3000, 200, 200);
        var motDinh = new TuyenPhoiHop("C1", [new Diem2(5000, 0)], "ELECTRICAL", 3000, 200);

        Assert.Empty(QuetXungDot.Quet([OngGioNgang(), chuaGanHe, motDinh], ChinhSach(), UuTien));
    }

    [Fact]
    public void Khong_suy_duoc_chieu_uu_tien_thi_chi_de_xuat_fitting_vuot()
    {
        // Cả hai hệ đều KHÔNG khai trong bảng ưu tiên ⇒ ngang hàng, không đoán ai nhường ai.
        var xd = Assert.Single(QuetXungDot.Quet([OngGioNgang(), MangCapDoc()], ChinhSach(), []));

        var deXuat = Assert.Single(xd.DeXuat);
        Assert.Equal(LoaiDeXuat.FittingVuot, deXuat.Loai);
        Assert.Equal("", deXuat.HeNhuong);
        Assert.Contains("không suy được ai nhường", deXuat.MoTa);
    }

    [Fact]
    public void Bang_uu_tien_lay_tu_rule_pack_dang_phat_hanh_cho_ket_qua_nhu_bang_khai_tay()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        var hang = pack.DrawTools.CoordinationPolicy!.HangUuTien(pack.DrawTools.CrossingPolicy);

        var xd = Assert.Single(QuetXungDot.Quet([OngGioNgang(), MangCapDoc()], ChinhSach(), hang));

        Assert.Equal("ELECTRICAL", xd.DeXuat.First(d => d.Loai == LoaiDeXuat.NhuongCaoDo).HeNhuong);
    }

    // ===== FR1 — id ổn định, chạy lại không nhân đôi =====

    [Fact]
    public void Quet_hai_lan_tren_cung_du_lieu_ra_dung_cac_id_cu()
    {
        var tuyen = new[] { OngGioNgang(), MangCapDoc(), Tuyen("C1", "PIPING", (0, 2000), (10000, 2000), 3000, 100, 100) };

        var lan1 = QuetXungDot.Quet(tuyen, ChinhSach(), UuTien);
        var lan2 = QuetXungDot.Quet(tuyen, ChinhSach(), UuTien);

        Assert.NotEmpty(lan1);
        Assert.Equal(lan1.Select(x => x.Id), lan2.Select(x => x.Id));
        Assert.Equal(lan1.Count, lan1.Select(x => x.Id).Distinct().Count());
    }

    [Fact]
    public void Doi_thu_tu_tuyen_dau_vao_khong_doi_id_xung_dot()
    {
        var gio = OngGioNgang();
        var mang = MangCapDoc();

        Assert.Equal(
            QuetXungDot.Quet([gio, mang], ChinhSach(), UuTien).Single().Id,
            QuetXungDot.Quet([mang, gio], ChinhSach(), UuTien).Single().Id);
    }

    [Fact]
    public void XungDotId_khong_phu_thuoc_thu_tu_handle_va_lam_tron_toa_do_ve_mm()
    {
        Assert.Equal(
            XungDotId.Tao(LopKiem.GiaoCatCaoDo, ["A1", "B1"], XungDotId.MocToaDo(1234.4, -10.2)),
            XungDotId.Tao(LopKiem.GiaoCatCaoDo, ["B1", "A1"], XungDotId.MocToaDo(1234.1, -10.4)));

        // Lớp kiểm khác nhau tại cùng chỗ là hai dòng khác nhau.
        Assert.NotEqual(
            XungDotId.Tao(LopKiem.GiaoCatCaoDo, ["A1", "B1"], XungDotId.MocToaDo(0, 0)),
            XungDotId.Tao(LopKiem.GiaoCatPhang, ["A1", "B1"], XungDotId.MocToaDo(0, 0)));

        Assert.StartsWith(XungDotId.TienTo, XungDotId.Tao(LopKiem.GiaoCatCaoDo, ["A1"], "x"));
    }

    // ===== §11 — tuyến thiếu cao độ chỉ vào lớp kiểm phẳng =====

    [Fact]
    public void Tuyen_thieu_cao_do_chi_vao_kiem_phang_kem_nhan_thieu_cao_do()
    {
        var mangThieuCaoDo = MangCapDoc(caoDoMm: null);

        var xd = Assert.Single(QuetXungDot.Quet([OngGioNgang(), mangThieuCaoDo], ChinhSach(), UuTien));

        Assert.Equal(LopKiem.GiaoCatPhang, xd.Lop);
        Assert.Equal(MucXungDot.CanhBao, xd.Muc); // KHÔNG bao giờ lên mức CỨNG khi thiếu dữ liệu
        Assert.True(xd.ThieuCaoDo);
        Assert.Contains("thiếu cao độ", xd.MoTa);
        Assert.Null(xd.SoLieuMm);

        var deXuat = Assert.Single(xd.DeXuat);
        Assert.Equal(LoaiDeXuat.BoSungCaoDo, deXuat.Loai);
        Assert.Contains("B1", deXuat.MoTa);
    }

    [Fact]
    public void Tuyen_thieu_cao_do_khong_vao_lop_khoang_cach_quy_pham()
    {
        // Hai tuyến song song rất gần nhau nhưng một bên thiếu cao độ ⇒ không đoán, không báo lớp 3.
        var nuoc = Tuyen("A1", "PIPING", (0, 0), (10000, 0), 3000, 100, 100);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 150), (10000, 150), null, 0, 100);

        Assert.Empty(QuetXungDot.Quet([nuoc, mang], ChinhSach(200, ("ELECTRICAL", "PIPING", 300)), UuTien));
    }

    // ===== Lớp 3 — khoảng cách quy phạm =====

    [Fact]
    public void Cap_he_gan_hon_nguong_ra_CANH_BAO_kem_de_xuat_dich_he_uu_tien_thap_hon()
    {
        var nuoc = Tuyen("A1", "PIPING", (0, 0), (10000, 0), 3000, 100, 100);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 250), (10000, 250), 3000, 100, 100);

        var xd = Assert.Single(QuetXungDot.Quet(
            [nuoc, mang], ChinhSach(200, ("ELECTRICAL", "PIPING", 300)), UuTien));

        Assert.Equal(LopKiem.KhoangCachQuyPham, xd.Lop);
        Assert.Equal(MucXungDot.CanhBao, xd.Muc);
        // Mép–mép = 250 − (100 + 100)/2 = 150 mm; cùng cao độ nên không có phần lệch đứng.
        Assert.Equal(150, xd.SoLieuMm!.Value, 6);

        var deXuat = Assert.Single(xd.DeXuat);
        Assert.Equal(LoaiDeXuat.DichLan, deXuat.Loai);
        Assert.Equal("ELECTRICAL", deXuat.HeNhuong);
        Assert.Equal(150, deXuat.SoLieuMm!.Value, 6); // còn thiếu 300 − 150
    }

    [Fact]
    public void Lop_khoang_cach_tu_tat_khi_rule_pack_khong_khai_cap_he_do()
    {
        var nuoc = Tuyen("A1", "PIPING", (0, 0), (10000, 0), 3000, 100, 100);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 250), (10000, 250), 3000, 100, 100);

        Assert.Empty(QuetXungDot.Quet([nuoc, mang], ChinhSach(), UuTien));
        // Khai cặp KHÁC thì cặp này vẫn không bị báo.
        Assert.Empty(QuetXungDot.Quet([nuoc, mang], ChinhSach(200, ("HVAC", "PIPING", 300)), UuTien));
    }

    [Fact]
    public void Lech_cao_do_duoc_tinh_vao_khoang_cach_nen_khong_bao_oan()
    {
        // Cùng vị trí mặt bằng như ca trên nhưng máng cáp treo cao hơn 400 mm mép–mép ⇒
        // khoảng cách = căn(150² + 400²) ≈ 427 mm > 300 mm.
        var nuoc = Tuyen("A1", "PIPING", (0, 0), (10000, 0), 3000, 100, 100);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 250), (10000, 250), 3500, 100, 100);

        Assert.Empty(QuetXungDot.Quet([nuoc, mang], ChinhSach(200, ("ELECTRICAL", "PIPING", 300)), UuTien));
    }

    [Fact]
    public void Cap_da_xung_dot_CUNG_thi_khong_bao_lai_o_lop_khoang_cach()
    {
        var xd = Assert.Single(QuetXungDot.Quet(
            [OngGioNgang(), MangCapDoc()],
            ChinhSach(200, ("ELECTRICAL", "HVAC", 500)),
            UuTien));

        Assert.Equal(LopKiem.GiaoCatCaoDo, xd.Lop); // một chỗ, một dòng
    }

    [Fact]
    public void Ban_ve_don_vi_met_quy_doi_dung_nguong_mm()
    {
        // Y HỆT ca 150 mm ở trên nhưng toạ độ tính bằng MÉT (donViTrenMm = 0,001).
        var nuoc = Tuyen("A1", "PIPING", (0, 0), (10, 0), 3000, 100, 100);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 0.25), (10, 0.25), 3000, 100, 100);

        var xd = Assert.Single(QuetXungDot.Quet(
            [nuoc, mang], ChinhSach(200, ("ELECTRICAL", "PIPING", 300)), UuTien, donViTrenMm: 0.001));

        Assert.Equal(150, xd.SoLieuMm!.Value, 6);
    }

    // ===== Lớp 2 — tranh chấp hành lang =====

    private static HanhLangDauVao HanhLang(double beRongMm = 1000) =>
        new("HL-1", [new Diem2(0, 0), new Diem2(10000, 0)], beRongMm);

    [Fact]
    public void Tong_be_rong_vuot_hanh_lang_ra_xung_dot_MEM_kem_de_xuat_dich_lan()
    {
        // 2 tuyến cùng tầng cao độ: 400 + 400 + 200 × 2 làn = 1200 mm > 1000 mm ⇒ thiếu 200 mm.
        var gio = Tuyen("A1", "HVAC", (0, 0), (10000, 0), 3000, 300, 400);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 200), (10000, 200), 3050, 300, 400);

        var xd = Assert.Single(QuetXungDot.Quet(
            [gio, mang], ChinhSach(), UuTien, hanhLang: [HanhLang()]));

        Assert.Equal(LopKiem.TranhChapHanhLang, xd.Lop);
        Assert.Equal(MucXungDot.Mem, xd.Muc);
        Assert.Equal("HL-1", xd.HanhLangId);
        Assert.Equal(200, xd.SoLieuMm!.Value, 6);
        Assert.Equal([gio.Id, mang.Id], xd.IdTuyen.OrderBy(i => i, StringComparer.Ordinal).ToList());

        var deXuat = Assert.Single(xd.DeXuat);
        Assert.Equal(LoaiDeXuat.DichLan, deXuat.Loai);
        Assert.Equal("ELECTRICAL", deXuat.HeNhuong); // ưu tiên thấp nhất trong nhóm
    }

    [Fact]
    public void Hai_tuyen_khac_TANG_cao_do_khong_tranh_nhau_be_rong()
    {
        var gio = Tuyen("A1", "HVAC", (0, 0), (10000, 0), 3000, 300, 400);   // 2850..3150
        var mang = Tuyen("B1", "ELECTRICAL", (0, 200), (10000, 200), 2400, 300, 400); // 2250..2550

        Assert.Empty(QuetXungDot.Quet([gio, mang], ChinhSach(), UuTien, hanhLang: [HanhLang()]));
    }

    [Fact]
    public void Hanh_lang_du_rong_thi_khong_bao()
    {
        var gio = Tuyen("A1", "HVAC", (0, 0), (10000, 0), 3000, 300, 400);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 200), (10000, 200), 3050, 300, 400);

        Assert.Empty(QuetXungDot.Quet(
            [gio, mang], ChinhSach(), UuTien, hanhLang: [HanhLang(beRongMm: 1500)]));
    }

    [Fact]
    public void Tuyen_ngoai_hanh_lang_va_tuyen_thieu_cao_do_khong_bi_tinh_vao_be_rong()
    {
        var gio = Tuyen("A1", "HVAC", (0, 0), (10000, 0), 3000, 300, 400);
        var ngoaiHanhLang = Tuyen("B1", "ELECTRICAL", (0, 9000), (10000, 9000), 3050, 300, 400);
        var thieuCaoDo = Tuyen("C1", "ELV", (0, 300), (10000, 300), null, 0, 400);

        Assert.Empty(QuetXungDot.Quet(
            [gio, ngoaiHanhLang, thieuCaoDo], ChinhSach(), UuTien, hanhLang: [HanhLang()]));
    }

    [Fact]
    public void Khong_co_du_lieu_hanh_lang_thi_lop_2_tu_bo_qua()
    {
        var gio = Tuyen("A1", "HVAC", (0, 0), (10000, 0), 3000, 300, 400);
        var mang = Tuyen("B1", "ELECTRICAL", (0, 200), (10000, 200), 3050, 300, 400);

        Assert.Empty(QuetXungDot.Quet([gio, mang], ChinhSach(), UuTien));
    }
}
