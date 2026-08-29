using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Ui.ViewModels;
using XBoss.Cad.Core.Zoning;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 PR4 — lập kế hoạch đi tuyến (<see cref="KeHoachDiTuyen"/>) và hộp thoại xem trước
/// (<see cref="TuyenTuDongDialogViewModel"/>). Đây là chỗ AC1/AC2/AC4/AC5/AC6/AC7/AC9/AC10 kiểm
/// được trên CI Linux; phần còn lại (AC3, AC8, AC11–AC13) cần AutoCAD thật nên nằm ở mục verify
/// tay của <c>VERIFY-VA-PHAT-HANH.md</c>.
///
/// Mọi số đo trong tệp này là mm và bản vẽ coi như đơn vị mm (toMm = 1).
/// </summary>
public class TuyenTuDongTests
{
    private static readonly ThamSoDinhTuyen ThamSo = new(Elbow: 3000, CongestionMoiDonVi: 0.5, ReuseFactor: 0.35);

    private static RoutingPolicySection ChinhSach() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.RoutingPolicy!;

    private static HanhLangChoTuyen HL(
        string id,
        double x1, double y1, double x2, double y2,
        double beRong = 2400,
        IReadOnlyList<LanChiem>? lanDaCap = null,
        IReadOnlyList<string>? heChoPhep = null) =>
        new(
            new HanhLangDauVao(
                id,
                [new Diem2(x1, y1), new Diem2(x2, y2)],
                beRong,
                CotDayDamMm: 3100,
                CotTranMm: 2600,
                heChoPhep),
            lanDaCap ?? []);

    private static ThietBiChoTuyen TB(string ten, double x, double y, string he = "HVAC", bool daCoTuyen = false) =>
        new(ten, new Diem2(x, y), he, daCoTuyen);

    /// <summary>Tầng mẫu: trục ngang + 2 nhánh đứng, 4 miệng gió, nguồn ở gốc trục.</summary>
    private static List<HanhLangChoTuyen> TangMau() =>
    [
        HL("HL-TRUC", 0, 0, 30000, 0),
        HL("HL-N1", 10000, 0, 10000, 8000),
        HL("HL-N2", 20000, 0, 20000, 8000),
    ];

    private static List<ThietBiChoTuyen> MiengGio() =>
    [
        TB("MG-01", 8000, 3000),
        TB("MG-02", 12000, 6000),
        TB("MG-03", 18000, 3000),
        TB("MG-04", 22000, 6000),
    ];

    private static KetQuaKeHoach Lap(
        IReadOnlyList<HanhLangChoTuyen> hanhLang,
        IReadOnlyList<ThietBiChoTuyen> thietBi,
        string he = "HVAC",
        double beRongMm = 600,
        double caoMm = 300,
        ThamSoDinhTuyen? chiPhi = null,
        IReadOnlyList<RanhGioiVung>? vungCam = null,
        RangBuocTuChay? tuChay = null,
        double caoDoThietBiMm = 0,
        Diem2? nguon = null) =>
        KeHoachDiTuyen.Lap(
            hanhLang,
            thietBi,
            ChinhSach(),
            he,
            nguon ?? new Diem2(0, 0),
            snapRadius: 4000,
            chiPhi ?? ThamSo,
            beRongMm,
            caoMm,
            CapPhatLanTang.HeDienDuAn,
            vungCam,
            tuChay,
            caoDoThietBiMm);

    // ===== AC1 — nối đủ thiết bị, chạy dọc hành lang, gom về trục chung =====

    [Fact]
    public void Noi_du_thiet_bi_va_cap_lan_cho_tung_hanh_lang()
    {
        var kq = Lap(TangMau(), MiengGio());

        Assert.Null(kq.LoiChan);
        Assert.Equal(4, kq.SoThietBiDich);
        Assert.Equal(4, kq.SoNoiDuoc);
        Assert.Empty(kq.KhongGiai);

        // Ba hành lang đều được cấp làn tier1 (HVAC) đúng cao độ đáy dầm − offset − chiều cao.
        Assert.Equal(3, kq.ChiemCho.Count);
        foreach (var c in kq.ChiemCho)
        {
            var lan = c.LanMoi;
            Assert.NotNull(lan);
            Assert.Equal("tier1", lan!.TierId);
            Assert.Equal("HVAC", lan.HeId);
            Assert.Equal(3100 - 30 - 300, lan.CaoDoMm);
            Assert.Equal(lan, Assert.Single(c.So)); // sổ ghi ngược vào XData chỉ có đúng làn này
        }
    }

    [Fact]
    public void Moi_canh_hanh_lang_chi_ve_dung_mot_lan()
    {
        // Đây là bất biến chống bóc TRÙNG khối lượng (AC3): đoạn trục chung 4 nhánh cùng đi qua
        // phải nằm trên ĐÚNG một polyline. Tổng phải bằng: 4 nhánh rẽ 2000 + trục 20000 + N1 6000
        // + N2 6000 = 40000.
        var kq = Lap(TangMau(), MiengGio());

        Assert.Equal(40000, kq.TongChieuDai, 3);
        Assert.True(kq.SoCanhDungChung > 0, "các nhánh phải gom vào trục chung, không đi riêng lẻ");

        // Không có đoạn nào bị vẽ hai lần: gom mọi đoạn con lại rồi so tổng chiều dài.
        var doan = new HashSet<string>(StringComparer.Ordinal);
        var tongDoan = 0.0;
        foreach (var n in kq.Nhanh)
        {
            for (var i = 0; i + 1 < n.Diem.Count; i++)
            {
                var a = n.Diem[i];
                var b = n.Diem[i + 1];
                var khoa = a.X < b.X || (a.X == b.X && a.Y <= b.Y)
                    ? $"{a.X},{a.Y}->{b.X},{b.Y}"
                    : $"{b.X},{b.Y}->{a.X},{a.Y}";
                Assert.True(doan.Add(khoa), $"đoạn {khoa} bị vẽ hai lần");
                tongDoan += a.KhoangCach(b);
            }
        }
        Assert.Equal(kq.TongChieuDai, tongDoan, 3);
    }

    [Fact]
    public void Thiet_bi_da_co_tuyen_bi_bo_qua_theo_mac_dinh()
    {
        var thietBi = MiengGio();
        thietBi[0] = thietBi[0] with { DaCoTuyen = true };

        Assert.Equal(3, Lap(TangMau(), thietBi).SoNoiDuoc);
    }

    [Fact]
    public void Thiet_bi_he_khac_khong_bi_keo_vao_luot_chay_cua_he_nay()
    {
        var thietBi = MiengGio();
        thietBi.Add(TB("OC-01", 8000, 2000, "ELECTRICAL"));

        var kq = Lap(TangMau(), thietBi);

        Assert.Equal(4, kq.SoThietBiDich);
        Assert.DoesNotContain(kq.Nhanh, n => n.ThietBi == "OC-01");
    }

    [Fact]
    public void Tag_thiet_bi_trung_nhau_khong_lam_chet_lenh()
    {
        // Bản vẽ thật hoàn toàn có thể có tag trùng (đó là thứ phép kiểm 17 của XBOSS_KIEMTRA đi
        // tìm). Lệnh phải chạy được, KHÔNG trộn hai thiết bị làm một và không nuốt mất nhánh nào.
        var kq = Lap(TangMau(), [TB("MG-01", 8000, 3000), TB("MG-01", 18000, 3000)]);

        Assert.Null(kq.LoiChan);
        Assert.Equal(2, kq.SoNoiDuoc);
        // Tên được tách ra để hai thiết bị không dùng chung một điểm rẽ/một cao độ.
        Assert.Equal(["MG-01 #1", "MG-01 #2"], kq.Nhanh.Select(n => n.ThietBi).Distinct().Order());
        // Mỗi nhánh vẫn bắt đầu ĐÚNG tại vị trí thiết bị của nó.
        Assert.Contains(kq.Nhanh, n => n.Diem[0] == new Diem2(8000, 3000));
        Assert.Contains(kq.Nhanh, n => n.Diem[0] == new Diem2(18000, 3000));
    }

    // ===== AC2 — γ gom trục có tác dụng thật ở mức kế hoạch =====

    [Fact]
    public void Gom_truc_gamma_giam_tong_chieu_dai_ve_ra()
    {
        // Cùng topo với ca γ ở mức hàm thuần (RoutingHanhLangTests): TB-GAN có 2 lối về nguồn dài
        // xấp xỉ nhau, γ làm lối GOM VÀO TRỤC rẻ hơn dù dài hơn.
        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("truc", 0, 0, 30000, 0),
            HL("xuong", 10000, 5000, 10000, 0),
            HL("song", 10000, 5000, 29000, 5000),
            HL("noi", 29000, 5000, 30000, 0),
        };
        var thietBi = new List<ThietBiChoTuyen> { TB("TB-XA", 0, -200), TB("TB-GAN", 10000, 5200) };
        var nguon = new Diem2(30000, 0);

        var coGom = Lap(hanhLang, thietBi, chiPhi: ThamSo, nguon: nguon);
        var khongGom = Lap(hanhLang, thietBi, chiPhi: ThamSo.KhongGomTruc(), nguon: nguon);

        Assert.Equal(2, coGom.SoNoiDuoc);
        Assert.Equal(2, khongGom.SoNoiDuoc);
        Assert.True(
            coGom.TongChieuDai < khongGom.TongChieuDai,
            $"γ phải kéo tổng chiều dài VẼ RA xuống: gom {coGom.TongChieuDai}, không gom {khongGom.TongChieuDai}");
        Assert.Equal(0, khongGom.TiLeDungChung);
        Assert.True(coGom.TiLeDungChung > 0);
    }

    // ===== AC4 — ngoài bán kính rẽ nhánh =====

    [Fact]
    public void Thiet_bi_ngoai_ban_kinh_bao_khong_giai_duoc_con_lai_van_noi()
    {
        var thietBi = MiengGio();
        thietBi.Add(TB("MG-XA", 15000, 6000)); // cách trục 6000 và cách N1/N2 5000 > 4000

        var kq = Lap(TangMau(), thietBi);

        Assert.Equal(4, kq.SoNoiDuoc);
        var loi = Assert.Single(kq.KhongGiai);
        Assert.Equal("MG-XA", loi.ThietBi);
        Assert.Contains("bán kính", loi.LyDo);
        Assert.Equal(5000, loi.SoLieu!.Value, 3);
    }

    [Fact]
    public void Diem_nguon_khong_dau_duoc_vao_hanh_lang_thi_khong_ve_gi()
    {
        var kq = Lap(TangMau(), MiengGio(), nguon: new Diem2(0, 9000));

        Assert.NotNull(kq.LoiChan);
        Assert.Contains("Điểm nguồn", kq.LoiChan);
        Assert.Empty(kq.Nhanh);
        Assert.Empty(kq.ChiemCho);
    }

    // ===== AC5 — tự chảy vô nghiệm =====

    [Fact]
    public void Tu_chay_diem_xa_cao_hon_thiet_bi_thi_khong_sinh_tuyen_nao()
    {
        var kq = Lap(
            TangMau(),
            [TB("WC-01", 8000, 3000, "PIPING")],
            he: "PIPING",
            beRongMm: 100,
            caoMm: 100,
            tuChay: new RangBuocTuChay(DoDoc: 0.02, CaoDoXaMm: 3000),
            caoDoThietBiMm: 2500);

        Assert.Empty(kq.Nhanh);
        Assert.Empty(kq.ChiemCho); // không cấp làn cho tuyến không tồn tại
        var loi = Assert.Single(kq.KhongGiai);
        Assert.Contains("tự chảy", loi.LyDo);
        Assert.Contains("chênh cao", loi.LyDo);
    }

    [Fact]
    public void Tu_chay_du_chenh_cao_thi_van_di_tuyen_binh_thuong()
    {
        var kq = Lap(
            TangMau(),
            [TB("WC-01", 8000, 3000, "PIPING")],
            he: "PIPING",
            beRongMm: 100,
            caoMm: 100,
            tuChay: new RangBuocTuChay(DoDoc: 0.005, CaoDoXaMm: 2000),
            caoDoThietBiMm: 3000);

        Assert.Equal(1, kq.SoNoiDuoc);
        Assert.Empty(kq.KhongGiai);
    }

    // ===== AC6/AC7 — cấp tầng/làn qua CapPhatLanTang =====

    [Fact]
    public void He_chay_sau_doc_so_chiem_cho_cua_he_chay_truoc_va_nhan_tier_khac()
    {
        var hvac = Lap(TangMau(), MiengGio());
        var soTruc = hvac.ChiemCho.Single(c => c.HanhLangId == "HL-TRUC").So;

        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("HL-TRUC", 0, 0, 30000, 0, lanDaCap: soTruc),
            HL("HL-N1", 10000, 0, 10000, 8000),
            HL("HL-N2", 20000, 0, 20000, 8000),
        };
        var kq = Lap(
            hanhLang, [TB("OC-01", 8000, 3000, "ELECTRICAL")], he: "ELECTRICAL", beRongMm: 200, caoMm: 100);

        var truc = kq.ChiemCho.Single(c => c.HanhLangId == "HL-TRUC");
        Assert.Equal("tier2", truc.LanMoi!.TierId);
        Assert.Equal(3100 - 140 - 100, truc.LanMoi.CaoDoMm);
        Assert.Equal(2, truc.So.Count); // sổ có đủ 2 bản ghi: HVAC + ELECTRICAL (AC6)
        Assert.Contains(truc.So, l => l.HeId == "HVAC");
    }

    [Fact]
    public void Hai_he_dien_cung_tang_cach_nhau_dung_khe_ho_elecToHot()
    {
        var cs = ChinhSach();
        var dien = Lap(TangMau(), [TB("OC-01", 8000, 3000, "ELECTRICAL")], he: "ELECTRICAL", beRongMm: 200, caoMm: 100);
        var soTruc = dien.ChiemCho.Single(c => c.HanhLangId == "HL-TRUC").So;

        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("HL-TRUC", 0, 0, 30000, 0, lanDaCap: soTruc),
            HL("HL-N1", 10000, 0, 10000, 8000),
            HL("HL-N2", 20000, 0, 20000, 8000),
        };
        var elv = Lap(hanhLang, [TB("CAM-01", 8000, 3000, "ELV")], he: "ELV", beRongMm: 150, caoMm: 80);

        var lanDien = soTruc.Single(l => l.HeId == "ELECTRICAL");
        var lanElv = elv.ChiemCho.Single(c => c.HanhLangId == "HL-TRUC").LanMoi!;
        Assert.Equal("tier2", lanElv.TierId);
        Assert.Equal(lanDien.LanDenMm + cs.LaneGapMm.ElecToHot, lanElv.LanTuMm);
    }

    [Fact]
    public void Hanh_lang_het_lan_thi_bao_ro_hanh_lang_nao_he_nao_dang_chiem()
    {
        // AC7: hành lang rộng 600 đã có làn ELECTRICAL 100–500; ELV xin thêm 150 ⇒ cần tới 800 > 600.
        var daCap = new List<LanChiem> { new("ELECTRICAL", "tier2", 100, 500, 2860) };
        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("HL-HEP", 0, 0, 30000, 0, beRong: 600, lanDaCap: daCap),
        };

        var kq = Lap(hanhLang, [TB("CAM-01", 8000, 1000, "ELV")], he: "ELV", beRongMm: 150, caoMm: 80);

        Assert.Empty(kq.Nhanh);
        Assert.Empty(kq.ChiemCho); // hệ này chưa từng chiếm chỗ ⇒ không có gì để ghi lại
        var loi = Assert.Single(kq.KhongGiai);
        Assert.Contains("HL-HEP", loi.LyDo);
        Assert.Contains("hết làn", loi.LyDo);
        Assert.Contains("ELECTRICAL", loi.LyDo);
    }

    // ===== AC9 — chạy lại ổn định (idempotent) =====

    [Fact]
    public void Chay_lai_khong_doi_so_nhanh_lan_chieu_dai_hay_so_chiem_cho()
    {
        var lan1 = Lap(TangMau(), MiengGio());

        // Lần 2 chạy trên bản vẽ đã mang sổ chiếm chỗ của lần 1 (FR13 gỡ trước rồi cấp lại).
        var hanhLang = TangMau()
            .Select(h => h with { LanDaCap = lan1.ChiemCho.Single(c => c.HanhLangId == h.Id).So })
            .ToList();
        var lan2 = Lap(hanhLang, MiengGio());
        var lan3 = Lap(
            hanhLang.Select(h => h with { LanDaCap = lan2.ChiemCho.Single(c => c.HanhLangId == h.Id).So }).ToList(),
            MiengGio());

        Assert.Equal(lan1.SoNoiDuoc, lan3.SoNoiDuoc);
        Assert.Equal(lan1.Nhanh.Count, lan3.Nhanh.Count);
        Assert.Equal(lan1.TongChieuDai, lan3.TongChieuDai, 6);
        Assert.Equal(
            lan1.ChiemCho.Select(c => (c.HanhLangId, c.LanMoi)),
            lan3.ChiemCho.Select(c => (c.HanhLangId, c.LanMoi)));
    }

    [Fact]
    public void Hanh_lang_khong_con_duoc_dung_nua_thi_chiem_cho_cu_bi_go()
    {
        // Sổ cũ ghi hệ HVAC chiếm cả HL-N2, nhưng lần này không thiết bị nào ở nhánh đó.
        var soCu = new List<LanChiem> { new("HVAC", "tier1", 100, 700, 2770) };
        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("HL-TRUC", 0, 0, 30000, 0),
            HL("HL-N1", 10000, 0, 10000, 8000),
            HL("HL-N2", 20000, 0, 20000, 8000, lanDaCap: soCu),
        };

        var kq = Lap(hanhLang, [TB("MG-01", 8000, 3000)]);

        var n2 = kq.ChiemCho.Single(c => c.HanhLangId == "HL-N2");
        Assert.Null(n2.LanMoi);
        Assert.Empty(n2.So); // làn cũ của hệ này được GỠ, không rò rỉ làn (FR13)
    }

    // ===== AC10 — vùng cấm =====

    [Fact]
    public void Vung_cam_cat_ngang_thi_tuyen_di_vong_chu_khong_xuyen_qua()
    {
        var cam = new RanhGioiVung("cam", [
            new DoanTuyen(new Diem2(8000, -1000), new Diem2(12000, -1000)),
            new DoanTuyen(new Diem2(12000, -1000), new Diem2(12000, 1000)),
            new DoanTuyen(new Diem2(12000, 1000), new Diem2(8000, 1000)),
            new DoanTuyen(new Diem2(8000, 1000), new Diem2(8000, -1000)),
        ]);
        var hanhLang = new List<HanhLangChoTuyen>
        {
            HL("truc", 0, 0, 20000, 0),
            HL("len", 6000, 0, 6000, 5000),
            HL("vong", 6000, 5000, 14000, 5000),
            HL("xuong", 14000, 5000, 14000, 0),
        };

        var kq = Lap(hanhLang, [TB("MG-01", 15000, 500)], vungCam: [cam]);

        Assert.Equal(1, kq.SoNoiDuoc);
        Assert.Empty(kq.KhongGiai);
        foreach (var n in kq.Nhanh)
        {
            Assert.DoesNotContain(n.Diem, d => d.Y == 0 && d.X > 8000 && d.X < 12000);
        }
        Assert.True(kq.TongChieuDai > 15500, "phải đi vòng nên dài hơn đường thẳng qua vùng cấm");
    }

    [Fact]
    public void Vung_cam_chan_het_loi_ve_nguon_thi_bao_khong_giai_duoc()
    {
        var cam = new RanhGioiVung("cam", [
            new DoanTuyen(new Diem2(8000, -1000), new Diem2(12000, -1000)),
            new DoanTuyen(new Diem2(12000, -1000), new Diem2(12000, 1000)),
            new DoanTuyen(new Diem2(12000, 1000), new Diem2(8000, 1000)),
            new DoanTuyen(new Diem2(8000, 1000), new Diem2(8000, -1000)),
        ]);

        // MG-GAN nằm cùng phía với nguồn nên vẫn nối được; MG-XA bị vùng cấm cắt đứt lối về.
        var kq = Lap(
            [HL("truc", 0, 0, 20000, 0)],
            [TB("MG-GAN", 2000, 300), TB("MG-XA", 15000, 500)],
            vungCam: [cam]);

        Assert.Equal(1, kq.SoNoiDuoc);
        Assert.Equal("MG-GAN", Assert.Single(kq.Nhanh).ThietBi);
        var loi = Assert.Single(kq.KhongGiai);
        Assert.Equal("MG-XA", loi.ThietBi);
        Assert.Contains("vùng cấm", loi.LyDo);
    }

    // ===== NFR1 — 120 thiết bị, 40 đoạn hành lang: dựng đồ thị + đi tuyến ≤ 5 giây =====

    [Fact]
    public void Tang_lon_120_thiet_bi_40_hanh_lang_chay_duoi_5_giay()
    {
        // Lưới 20 hành lang ngang × 20 hành lang dọc, bước 5 m — đồ thị vài trăm nút, đúng cỡ một
        // tầng thật. Ngưỡng 5 giây là NFR1; thời gian thật nhỏ hơn nhiều bậc (Dijkstra trên vài
        // trăm nút), nên ca này chỉ đỏ khi ai đó cài lại thuật toán bằng thứ tăng theo bình phương.
        var hanhLang = new List<HanhLangChoTuyen>();
        for (var i = 0; i < 20; i++)
        {
            hanhLang.Add(HL($"ngang-{i}", 0, i * 5000, 95000, i * 5000));
            hanhLang.Add(HL($"doc-{i}", i * 5000, 0, i * 5000, 95000));
        }

        var thietBi = new List<ThietBiChoTuyen>();
        for (var k = 0; k < 120; k++)
        {
            thietBi.Add(TB($"MG-{k:000}", k % 19 * 5000 + 1500, k / 19 * 5000 + 1200));
        }

        var dongHo = System.Diagnostics.Stopwatch.StartNew();
        var kq = Lap(hanhLang, thietBi);
        dongHo.Stop();

        Assert.Equal(120, kq.SoNoiDuoc);
        Assert.True(
            dongHo.Elapsed < TimeSpan.FromSeconds(5),
            $"NFR1: dựng đồ thị + đi tuyến mất {dongHo.Elapsed.TotalSeconds:0.##}s (giới hạn 5s)");
    }

    // ===== Hộp thoại xem trước (FR10/FR12) =====

    private static DrawToolsPack Pack() => DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));

    private static TuyenTuDongDialogViewModel Vm(
        IReadOnlyList<HanhLangChoTuyen>? hanhLang = null,
        IReadOnlyList<ThietBiChoTuyen>? thietBi = null,
        IReadOnlyList<TuyenTuDongDaCo>? tuyenCu = null,
        Diem2? nguon = null,
        Action<IReadOnlyList<NhanhVeRa>>? veNetTam = null)
    {
        var pack = Pack();
        return new TuyenTuDongDialogViewModel(
            pack,
            pack.DrawTools.RoutingPolicy!,
            toMm: 1,
            hanhLang ?? TangMau(),
            thietBi ?? MiengGio(),
            tuyenCu ?? [],
            nguon ?? new Diem2(0, 0),
            heId: "HVAC",
            itemId: "duct-supp",
            size: "600x300",
            veNetTam: veNetTam);
    }

    [Fact]
    public void Hop_thoai_tinh_san_ke_hoach_va_cho_bam_OK_khi_noi_duoc()
    {
        var vm = Vm();

        Assert.True(vm.CoTheOk, string.Join(" | ", vm.LyDoChuaHopLe));
        Assert.Equal(4, vm.KeHoach.SoNoiDuoc);
        Assert.Contains("Nối được 4/4", vm.TomTatXemTruoc);
        Assert.Equal(3, vm.DongCapLan.Count);
        Assert.Empty(vm.DongKhongGiai);
        Assert.NotNull(vm.KetQua());
    }

    [Fact]
    public void Hop_thoai_ve_net_tam_ngay_khi_mo_va_ve_lai_khi_doi_lua_chon()
    {
        var lanVe = 0;
        var soNhanh = -1;
        var vm = Vm(veNetTam: n =>
        {
            lanVe++;
            soNhanh = n.Count;
        });

        Assert.Equal(1, lanVe);
        Assert.Equal(vm.KeHoach.Nhanh.Count, soNhanh);

        vm.BoQuaThietBiDaCoTuyen = false;
        Assert.Equal(2, lanVe);
    }

    [Fact]
    public void Net_tam_hong_khong_lam_chet_hop_thoai_ma_chi_them_canh_bao()
    {
        var vm = Vm(veNetTam: _ => throw new InvalidOperationException("giả lập lỗi đồ họa"));

        Assert.True(vm.CoTheOk);
        Assert.Contains("nét tạm", vm.ThongBaoNetTam);
        Assert.Contains(vm.CanhBao, c => c.Contains("nét tạm"));
    }

    [Fact]
    public void Hop_thoai_khoa_OK_khi_khong_noi_duoc_thiet_bi_nao()
    {
        var vm = Vm(thietBi: [TB("MG-XA", 15000, 6000)]);

        Assert.False(vm.CoTheOk);
        Assert.Null(vm.KetQua());
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("Không nối được thiết bị nào"));
        Assert.Contains(vm.DongKhongGiai, d => d.StartsWith("MG-XA", StringComparison.Ordinal));
    }

    [Fact]
    public void Hop_thoai_dem_dung_tuyen_sua_tay_bo_qua_va_tuyen_se_dung_lai()
    {
        var vm = Vm(tuyenCu:
        [
            new TuyenTuDongDaCo("A1", "HVAC", SuaTay: true, LechBam: false),
            new TuyenTuDongDaCo("A2", "HVAC", SuaTay: false, LechBam: true),
            new TuyenTuDongDaCo("A3", "HVAC", SuaTay: false, LechBam: false),
            new TuyenTuDongDaCo("B1", "ELECTRICAL", SuaTay: false, LechBam: false),
        ]);

        Assert.Equal(2, vm.SoBoQuaSuaTay); // A1 (đã đánh dấu) + A2 (vừa phát hiện lệch băm)
        Assert.Equal(1, vm.SoDungLai);     // A3; B1 của hệ khác không bị đụng tới
        Assert.Contains("GIỮ NGUYÊN", vm.MoTaTuyenCu);
        Assert.Contains(vm.CanhBao, c => c.Contains("sửa tay"));
    }

    [Fact]
    public void Hop_thoai_doi_he_thi_tinh_lai_ke_hoach_theo_he_moi()
    {
        var vm = Vm(thietBi: [TB("MG-01", 8000, 3000), TB("OC-01", 12000, 3000, "ELECTRICAL")]);
        Assert.Equal(1, vm.KeHoach.SoNoiDuoc);

        vm.He = vm.CacHe.Single(h => h.Id == "ELECTRICAL");

        Assert.Equal("ELECTRICAL", vm.He!.Id);
        Assert.Equal(1, vm.KeHoach.SoThietBiDich);
        Assert.Equal("tier2", vm.KeHoach.ChiemCho[0].LanMoi!.TierId);
    }

    [Fact]
    public void Hop_thoai_doi_he_sang_tu_chay_thi_doi_cao_do_truoc_khi_cho_OK()
    {
        var vm = Vm(thietBi: [TB("WC-01", 8000, 3000, "PIPING")]);
        vm.He = vm.CacHe.Single(h => h.Id == "PIPING");
        vm.Tuyen = vm.CacLoaiTuyen.Single(l => l.ItemId == "pipe-sanr");

        Assert.True(vm.CanDoDoc);
        Assert.False(vm.CoTheOk);
        Assert.Contains(vm.LyDoChuaHopLe, l => l.Contains("TẠI THIẾT BỊ"));

        vm.CaoDoThietBi = "3000";
        vm.CaoDoXa = "2000";
        vm.DoDoc = "1%";

        Assert.True(vm.CoTheOk, string.Join(" | ", vm.LyDoChuaHopLe));
        Assert.Equal(1, vm.KeHoach.SoNoiDuoc);
    }

    [Theory]
    [InlineData("2%", 0.02)]
    [InlineData(" 1.5% ", 0.015)]
    [InlineData("0.02", 0.02)]
    public void Doc_do_doc_tu_chuoi_rule_pack(string chuoi, double mongDoi) =>
        Assert.Equal(mongDoi, TuyenTuDongDialogViewModel.DocDoDoc(chuoi)!.Value, 9);

    [Theory]
    [InlineData("")]
    [InlineData("2 phần trăm")]
    [InlineData("-1%")]
    public void Do_doc_khong_doc_duoc_thi_tra_null(string chuoi) =>
        Assert.Null(TuyenTuDongDialogViewModel.DocDoDoc(chuoi));
}
