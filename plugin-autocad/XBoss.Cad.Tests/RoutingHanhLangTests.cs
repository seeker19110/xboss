using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Zoning;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 PR1 — đồ thị hành lang + đi tuyến (§10 phần Core, chạy trên CI Linux, không cần AutoCAD):
/// đồ thị chữ T/chữ H, điểm rẽ ngoài bán kính bị loại, cạnh qua vùng cấm bị loại, Dijkstra ra đúng
/// đường trên đồ thị dựng tay, γ gom trục giảm tổng chiều dài (AC2 ở mức hàm thuần), tự chảy
/// có nghiệm/vô nghiệm.
/// </summary>
public class RoutingHanhLangTests
{
    private static readonly ThamSoDinhTuyen ThamSo = new(Elbow: 3000, CongestionMoiDonVi: 0.5, ReuseFactor: 0.35);

    private static HanhLangDauVao Doan(string id, double x1, double y1, double x2, double y2) =>
        new(id, [new Diem2(x1, y1), new Diem2(x2, y2)]);

    // ===== Dựng đồ thị (FR6) =====

    [Fact]
    public void Hanh_lang_chu_T_tach_canh_tai_giao_diem()
    {
        // Trục ngang y=0 từ x=0..20000; nhánh đứng x=10000 đi lên 8000.
        var g = HanhLangGraph.Dung(
            [Doan("ngang", 0, 0, 20000, 0), Doan("dung", 10000, 0, 10000, 8000)],
            [],
            snapRadius: 4000);

        // 4 nút: 2 đầu trục ngang, giao điểm, đầu nhánh đứng.
        Assert.Equal(4, g.Nut.Count);
        // 3 cạnh: ngang bị cắt đôi tại giao + nhánh đứng.
        Assert.Equal(3, g.Canh.Count);
        var giao = g.NutTai(new Diem2(10000, 0));
        Assert.Equal(3, g.CanhTaiNut(giao).Count);
    }

    [Fact]
    public void Hanh_lang_chu_H_co_2_giao_diem()
    {
        var g = HanhLangGraph.Dung(
            [
                Doan("trai", 0, 0, 0, 10000),
                Doan("phai", 12000, 0, 12000, 10000),
                Doan("ngang", 0, 5000, 12000, 5000),
            ],
            [],
            snapRadius: 4000);

        // Hai cột bị thanh ngang cắt đôi (4 cạnh) + thanh ngang liền (1 cạnh).
        Assert.Equal(5, g.Canh.Count);
        Assert.Equal(6, g.Nut.Count);
        Assert.Equal(3, g.CanhTaiNut(g.NutTai(new Diem2(0, 5000))).Count);
        Assert.Equal(3, g.CanhTaiNut(g.NutTai(new Diem2(12000, 5000))).Count);
    }

    [Fact]
    public void Diem_re_la_hinh_chieu_vuong_goc_len_hanh_lang_gan_nhat()
    {
        var g = HanhLangGraph.Dung(
            [Doan("ngang", 0, 0, 20000, 0)],
            [new ThietBiDauVao("MG-01", new Diem2(5000, 3000))],
            snapRadius: 4000);

        var re = Assert.Single(g.DiemRe);
        Assert.Equal("MG-01", re.ThietBi);
        Assert.Equal(3000, re.KhoangCach, 6);
        Assert.Equal(5000, g.Nut[re.Nut].ViTri.X, 6);
        Assert.Equal(0, g.Nut[re.Nut].ViTri.Y, 6);
        Assert.Empty(g.KhongGiai);
    }

    [Fact]
    public void Thiet_bi_ngoai_ban_kinh_vao_danh_sach_khong_giai_duoc_kem_khoang_cach()
    {
        // AC4: miệng gió cách hành lang 6 m, snapRadius 4 m.
        var g = HanhLangGraph.Dung(
            [Doan("ngang", 0, 0, 20000, 0)],
            [new ThietBiDauVao("MG-XA", new Diem2(5000, 6000)), new ThietBiDauVao("MG-GAN", new Diem2(9000, 1000))],
            snapRadius: 4000);

        Assert.Single(g.DiemRe);
        Assert.Equal("MG-GAN", g.DiemRe[0].ThietBi);
        var loi = Assert.Single(g.KhongGiai);
        Assert.Equal("MG-XA", loi.ThietBi);
        Assert.Equal(6000, loi.SoLieu!.Value, 6);
        Assert.Contains("bán kính", loi.LyDo);
    }

    [Fact]
    public void Hanh_lang_khong_cho_he_nay_di_qua_bi_bo_khoi_do_thi()
    {
        var chiChoDien = new HanhLangDauVao(
            "dien", [new Diem2(0, 0), new Diem2(20000, 0)], HeChoPhep: ["ELECTRICAL"]);

        var g = HanhLangGraph.Dung([chiChoDien], [new ThietBiDauVao("MG-01", new Diem2(5000, 100))],
            snapRadius: 4000, heId: "HVAC");

        Assert.Empty(g.Canh);
        Assert.Equal("MG-01", Assert.Single(g.KhongGiai).ThietBi);
    }

    [Fact]
    public void Canh_qua_vung_cam_bi_loai_khoi_do_thi()
    {
        // Vùng cấm hình vuông trùm đoạn giữa của hành lang ngang.
        var cam = new RanhGioiVung("cam", [
            new DoanTuyen(new Diem2(8000, -1000), new Diem2(12000, -1000)),
            new DoanTuyen(new Diem2(12000, -1000), new Diem2(12000, 1000)),
            new DoanTuyen(new Diem2(12000, 1000), new Diem2(8000, 1000)),
            new DoanTuyen(new Diem2(8000, 1000), new Diem2(8000, -1000)),
        ]);

        var khongCam = HanhLangGraph.Dung([Doan("ngang", 0, 0, 20000, 0)], [], 4000);
        var coCam = HanhLangGraph.Dung([Doan("ngang", 0, 0, 20000, 0)], [], 4000, vungCam: [cam]);

        Assert.Single(khongCam.Canh);
        Assert.Empty(coCam.Canh); // cả cạnh duy nhất đụng vùng cấm ⇒ bị loại, không đi xuyên (AC10)
    }

    // ===== Đi tuyến (FR7) =====

    [Fact]
    public void Dijkstra_ra_dung_duong_tren_do_thi_dung_tay()
    {
        // Chữ H: đường vòng qua thanh ngang giữa NGẮN hơn đi vòng qua đỉnh.
        var g = HanhLangGraph.Dung(
            [
                Doan("trai", 0, 0, 0, 10000),
                Doan("phai", 12000, 0, 12000, 10000),
                Doan("ngang", 0, 5000, 12000, 5000),
            ],
            [new ThietBiDauVao("TB", new Diem2(0, 300))],
            snapRadius: 4000);

        var nguon = g.NutTai(new Diem2(12000, 0));
        var kq = DinhTuyen.Chay(g, nguon, ThamSo);

        var tuyen = Assert.Single(kq.Tuyen);
        Assert.Equal("TB", tuyen.ThietBi);
        // 300 → 5000 (4700) + 12000 ngang + 5000 xuống = 21700.
        Assert.Equal(21700, tuyen.ChieuDai, 3);
        Assert.Equal(2, tuyen.SoCo);
    }

    [Fact]
    public void Gom_truc_gamma_giam_tong_chieu_dai_ve_ra_va_tang_canh_dung_chung()
    {
        // AC2 ở mức hàm thuần: TB-GAN có 2 lối về nguồn dài xấp xỉ nhau — một lối đi riêng (24099),
        // một lối gom vào trục mà TB-XA vừa đặt (25000). γ = 0.35 làm lối gom RẺ hơn dù dài hơn,
        // nên tổng chiều dài VẼ RA (cạnh chung tính một lần) tụt hẳn xuống.
        var hanhLang = new List<HanhLangDauVao>
        {
            Doan("truc", 0, 0, 30000, 0),
            Doan("xuong", 10000, 5000, 10000, 0),
            Doan("song", 10000, 5000, 29000, 5000),
            Doan("noi", 29000, 5000, 30000, 0),
        };
        var thietBi = new List<ThietBiDauVao>
        {
            new("TB-XA", new Diem2(0, -200)),
            new("TB-GAN", new Diem2(10000, 5200)),
        };

        var g1 = HanhLangGraph.Dung(hanhLang, thietBi, 4000);
        var g2 = HanhLangGraph.Dung(hanhLang, thietBi, 4000);
        var coGom = DinhTuyen.Chay(g1, g1.NutTai(new Diem2(30000, 0)), ThamSo);
        var khongGom = DinhTuyen.Chay(g2, g2.NutTai(new Diem2(30000, 0)), ThamSo.KhongGomTruc());

        Assert.Equal(2, coGom.Tuyen.Count);
        Assert.Equal(2, khongGom.Tuyen.Count);
        Assert.True(
            coGom.TongChieuDai < khongGom.TongChieuDai,
            $"γ phải kéo tổng chiều dài vẽ ra xuống: có gom {coGom.TongChieuDai}, không gom {khongGom.TongChieuDai}");
        Assert.True(
            coGom.SoCanhDungChung > khongGom.SoCanhDungChung,
            "có gom trục thì phải có cạnh dùng chung, tắt γ thì không");
        Assert.Equal(0, khongGom.TiLeDungChung);
        Assert.True(coGom.TiLeDungChung > 0);
    }

    [Fact]
    public void Do_dong_beta_day_tuyen_sang_hanh_lang_vang()
    {
        // Hai đường song song về nguồn: đường "dong" ngắn hơn 1000 nhưng đã có 5 hệ chiếm làn.
        var hanhLang = new List<HanhLangDauVao>
        {
            Doan("vao", 0, 0, 1000, 0),
            Doan("dong", 1000, 0, 21000, 0),
            Doan("vang-1", 1000, 0, 1000, 500),
            Doan("vang-2", 1000, 500, 21500, 500),
            Doan("vang-3", 21500, 500, 21000, 0),
        };
        var thietBi = new List<ThietBiDauVao> { new("TB", new Diem2(0, 100)) };

        var g = HanhLangGraph.Dung(hanhLang, thietBi, 4000);
        var nguon = g.NutTai(new Diem2(21000, 0));

        var khongPhat = DinhTuyen.Chay(g, nguon, ThamSo with { Elbow = 0 });
        var coPhat = DinhTuyen.Chay(
            g, nguon, ThamSo with { Elbow = 0 },
            doDongTheoHanhLang: new Dictionary<string, int> { ["dong"] = 5 });

        Assert.True(khongPhat.Tuyen[0].ChieuDai < coPhat.Tuyen[0].ChieuDai,
            "β phải đẩy tuyến sang hành lang vắng dù dài hơn");
    }

    [Fact]
    public void Khong_co_duong_ve_nguon_thi_bao_khong_giai_duoc()
    {
        var g = HanhLangGraph.Dung(
            [Doan("a", 0, 0, 10000, 0), Doan("b", 50000, 0, 60000, 0)],
            [new ThietBiDauVao("TB", new Diem2(5000, 100))],
            snapRadius: 4000);

        var nguon = g.NutTai(new Diem2(60000, 0));
        var kq = DinhTuyen.Chay(g, nguon, ThamSo);

        Assert.Empty(kq.Tuyen);
        Assert.Equal("TB", Assert.Single(kq.KhongGiai).ThietBi);
    }

    // ===== Tự chảy (FR8/AC5) =====

    [Fact]
    public void Tu_chay_co_nghiem_khi_du_chenh_cao()
    {
        var g = HanhLangGraph.Dung(
            [Doan("ngang", 0, 0, 20000, 0)],
            [new ThietBiDauVao("WC-01", new Diem2(0, 100), CaoDoMm: 3000)],
            snapRadius: 4000);
        var nguon = g.NutTai(new Diem2(20000, 0));

        var kq = DinhTuyen.Chay(
            g, nguon, ThamSo,
            tuChay: new RangBuocTuChay(DoDoc: 0.02, CaoDoXaMm: 2500),
            caoDoThietBi: new Dictionary<string, double> { ["WC-01"] = 3000 });

        // Cần 0,02 × 20000 = 400 mm; có 500 mm ⇒ giải được.
        Assert.Single(kq.Tuyen);
        Assert.Empty(kq.KhongGiai);
    }

    [Fact]
    public void Tu_chay_vo_nghiem_khi_diem_xa_cao_hon_thiet_bi_bao_kem_so_lieu()
    {
        // AC5: điểm xả CAO HƠN thiết bị ⇒ không sinh tuyến nào, không hạ độ dốc cho xong.
        var g = HanhLangGraph.Dung(
            [Doan("ngang", 0, 0, 20000, 0)],
            [new ThietBiDauVao("WC-01", new Diem2(0, 100), CaoDoMm: 2500)],
            snapRadius: 4000);
        var nguon = g.NutTai(new Diem2(20000, 0));

        var kq = DinhTuyen.Chay(
            g, nguon, ThamSo,
            tuChay: new RangBuocTuChay(DoDoc: 0.02, CaoDoXaMm: 3000),
            caoDoThietBi: new Dictionary<string, double> { ["WC-01"] = 2500 });

        Assert.Empty(kq.Tuyen);
        var loi = Assert.Single(kq.KhongGiai);
        Assert.Contains("tự chảy", loi.LyDo);
        Assert.Contains("400", loi.LyDo); // chênh cao CẦN
        Assert.Contains("-500", loi.LyDo); // chênh cao CÓ (âm — xả cao hơn thiết bị)
    }
}

/// <summary>
/// M114 PR1 — XData mới: vai trò <c>HanhLang</c> + sổ chiếm chỗ <c>lanDaCap</c> (FR3) và 3 cờ của
/// tuyến tự động <c>TuDong</c>/<c>PhienTuyen</c>/<c>SuaTay</c> (FR11/FR12). Trạng thái chiếm chỗ
/// SỐNG TRONG BẢN VẼ nên phép mã hóa/giải mã phải khứ hồi không mất mát.
/// </summary>
public class VeXDataHanhLangTests
{
    [Fact]
    public void Khu_hoi_XData_hanh_lang_giu_du_be_rong_cao_do_he_cho_phep_va_so_chiem_cho()
    {
        var goc = new VeXDataInfo
        {
            VaiTro = VaiTroVe.HanhLang,
            RulePackVersion = "v15",
            BeRongMm = 600,
            CotDayDamMm = 3200,
            CotTranMm = 2700,
            HeChoPhep = ["HVAC", "ELECTRICAL"],
            LanDaCap =
            [
                new LanChiem("HVAC", "tier1", -300, -100, 3170),
                new LanChiem("ELECTRICAL", "tier2", 50, 250, 3060),
            ],
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(goc));

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.HanhLang, lai!.VaiTro);
        Assert.Equal(600, lai.BeRongMm);
        Assert.Equal(3200, lai.CotDayDamMm);
        Assert.Equal(2700, lai.CotTranMm);
        Assert.Equal(["HVAC", "ELECTRICAL"], lai.HeChoPhep);
        Assert.Equal(goc.LanDaCap, lai.LanDaCap);
        Assert.Equal(200, lai.LanDaCap[0].BeRongMm);
    }

    [Fact]
    public void Khu_hoi_XData_tuyen_tu_dong_giu_co_TuDong_PhienTuyen_SuaTay()
    {
        var goc = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HeId = "HVAC",
            ItemId = "duct-supp",
            Size = "300x200",
            TuDong = true,
            PhienTuyen = "P-20260829-01",
            SuaTay = true,
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(goc))!;

        Assert.True(lai.TuDong);
        Assert.Equal("P-20260829-01", lai.PhienTuyen);
        Assert.True(lai.SuaTay);
    }

    [Fact]
    public void Tuyen_thuong_khong_mang_co_tu_dong_va_dong_lan_hong_bi_bo_qua()
    {
        var thuong = VeXData.GiaiMa(VeXData.MaHoa(new VeXDataInfo { VaiTro = VaiTroVe.Tim }))!;
        Assert.False(thuong.TuDong);
        Assert.False(thuong.SuaTay);
        Assert.Null(thuong.PhienTuyen);
        Assert.Empty(thuong.LanDaCap);

        // Dòng lan thiếu trường / số hỏng: bỏ qua bản ghi đó, KHÔNG làm hỏng cả XData.
        var lai = VeXData.GiaiMa(["ve=1", "vaitro=hanhlang", "lan=HVAC|tier1|x|y|z", "lan=ELV|tier2|0|100|3000"])!;
        Assert.Equal(VaiTroVe.HanhLang, lai.VaiTro);
        Assert.Equal("ELV", Assert.Single(lai.LanDaCap).HeId);
    }
}
