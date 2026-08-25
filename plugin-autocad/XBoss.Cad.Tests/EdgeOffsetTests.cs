using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR3 — nét biên offset (§6.1 bước 3, FR4, AC1). Đây là phần hình học DUY NHẤT của
/// bộ lệnh vẽ chạy được trên CI Linux nên phải phủ kỹ: thẳng, gãy khúc, cung, width lẻ,
/// tuyến kín, và mọi trường hợp phải TỪ CHỐI offset (thà vẽ mỗi tim còn hơn vẽ biên sai).
/// </summary>
public class EdgeOffsetTests
{
    private static void GanBang(double mong, double thuc) => Assert.Equal(mong, thuc, 6);

    private static void DinhLa(DinhPolyline d, double x, double y, double bulge = 0)
    {
        GanBang(x, d.X);
        GanBang(y, d.Y);
        GanBang(bulge, d.Bulge);
    }

    [Fact]
    public void Tuyen_thang_ra_hai_net_cach_tim_dung_nua_be_rong()
    {
        // AC1: ống gió 300x200 → biên cách tim 150 mỗi bên.
        var kq = EdgeOffset.Tinh([new DinhPolyline(0, 0, 0), new DinhPolyline(10000, 0, 0)], 300);

        Assert.True(kq.ThanhCong);
        Assert.Null(kq.LyDo);
        Assert.Equal(2, kq.Trai.Count);
        Assert.Equal(2, kq.Phai.Count);
        DinhLa(kq.Trai[0], 0, 150);
        DinhLa(kq.Trai[1], 10000, 150);
        DinhLa(kq.Phai[0], 0, -150);
        DinhLa(kq.Phai[1], 10000, -150);
    }

    [Fact]
    public void Be_rong_le_van_chia_doi_chinh_xac()
    {
        var kq = EdgeOffset.Tinh([new DinhPolyline(0, 0, 0), new DinhPolyline(1000, 0, 0)], 125);

        Assert.True(kq.ThanhCong);
        GanBang(62.5, kq.Trai[0].Y);
        GanBang(-62.5, kq.Phai[0].Y);
    }

    [Fact]
    public void Gay_khuc_vuong_goc_ra_dung_diem_mitre_hai_ben()
    {
        // Đi +X rồi rẽ trái lên +Y, bề rộng 200 (d = 100).
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, 0),
            new DinhPolyline(1000, 1000, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 200);

        Assert.True(kq.ThanhCong);
        // Bên trái = phía trong khúc cua.
        DinhLa(kq.Trai[0], 0, 100);
        DinhLa(kq.Trai[1], 900, 100);
        DinhLa(kq.Trai[2], 900, 1000);
        // Bên phải = phía ngoài khúc cua.
        DinhLa(kq.Phai[0], 0, -100);
        DinhLa(kq.Phai[1], 1100, -100);
        DinhLa(kq.Phai[2], 1100, 1000);
    }

    [Fact]
    public void Cung_offset_dong_tam_giu_nguyen_bulge()
    {
        // 1/4 cung ngược kim, tâm (0,0), R = 1000: (1000,0) → (0,1000), bulge = tan(22.5°).
        var bulge = Math.Tan(Math.PI / 8);
        var kq = EdgeOffset.Tinh([new DinhPolyline(1000, 0, bulge), new DinhPolyline(0, 1000, 0)], 300);

        Assert.True(kq.ThanhCong);
        // Trái = phía tâm → R giảm 150; phải = xa tâm → R tăng 150.
        DinhLa(kq.Trai[0], 850, 0, bulge);
        DinhLa(kq.Trai[1], 0, 850);
        DinhLa(kq.Phai[0], 1150, 0, bulge);
        DinhLa(kq.Phai[1], 0, 1150);
    }

    [Fact]
    public void Cung_thuan_kim_dao_ben_thu_hep_nhung_khong_doi_bulge()
    {
        // 1/4 cung THUẬN kim, tâm (0,0), R = 1000: (0,1000) → (1000,0), bulge âm.
        var bulge = -Math.Tan(Math.PI / 8);
        var kq = EdgeOffset.Tinh([new DinhPolyline(0, 1000, bulge), new DinhPolyline(1000, 0, 0)], 400);

        Assert.True(kq.ThanhCong);
        DinhLa(kq.Trai[0], 0, 1200, bulge); // trái = xa tâm
        DinhLa(kq.Trai[1], 1200, 0);
        DinhLa(kq.Phai[0], 0, 800, bulge);  // phải = về phía tâm
        DinhLa(kq.Phai[1], 800, 0);
    }

    [Fact]
    public void Noi_thang_voi_cung_tiep_tuyen_khong_tao_gay_o_diem_noi()
    {
        // Đoạn thẳng chạy +X tới (1000,0) rồi cung tiếp tuyến 1/4 vòng lên (2000,1000).
        var bulge = Math.Tan(Math.PI / 8);
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, bulge),
            new DinhPolyline(2000, 1000, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 200);

        Assert.True(kq.ThanhCong);
        // Nối tiếp tuyến ⇒ điểm biên tại đỉnh nối nằm đúng trên pháp tuyến, không lồi ra.
        DinhLa(kq.Trai[1], 1000, 100, bulge);
        DinhLa(kq.Phai[1], 1000, -100, bulge);
        // Cung tâm (1000,1000) R=1000: trái vào R=900, phải ra R=1100.
        DinhLa(kq.Trai[2], 1900, 1000);
        DinhLa(kq.Phai[2], 2100, 1000);
    }

    [Fact]
    public void Tuyen_kin_hinh_chu_nhat_ra_bien_trong_va_ngoai()
    {
        // Hình chữ nhật vẽ ngược chiều kim ⇒ bên trái là phía trong.
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, 0),
            new DinhPolyline(1000, 600, 0),
            new DinhPolyline(0, 600, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 100, kin: true);

        Assert.True(kq.ThanhCong);
        Assert.Equal(4, kq.Trai.Count);
        DinhLa(kq.Trai[0], 50, 50);
        DinhLa(kq.Trai[2], 950, 550);
        DinhLa(kq.Phai[0], -50, -50);
        DinhLa(kq.Phai[2], 1050, 650);
    }

    [Fact]
    public void Nhieu_dinh_giu_dung_so_dinh_va_tong_chieu_dai_hop_ly()
    {
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(2000, 0, 0),
            new DinhPolyline(2000, 1500, 0),
            new DinhPolyline(5000, 1500, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 300);

        Assert.True(kq.ThanhCong);
        Assert.Equal(4, kq.Trai.Count);
        Assert.Equal(4, kq.Phai.Count);
        // Mỗi đỉnh biên cách tim đúng 150 theo phương pháp tuyến ở hai đầu tuyến.
        GanBang(150, kq.Trai[0].Y);
        GanBang(-150, kq.Phai[0].Y);
    }

    [Fact]
    public void Dinh_trung_lien_tiep_bi_bo_qua_khong_lam_hong_bien()
    {
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(0, 0, 0), // cú click đúp của kỹ sư
            new DinhPolyline(1000, 0, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 200);

        Assert.True(kq.ThanhCong);
        Assert.Equal(2, kq.Trai.Count);
        DinhLa(kq.Trai[0], 0, 100);
    }

    [Fact]
    public void Be_rong_khong_duong_bi_tu_choi()
    {
        var kq = EdgeOffset.Tinh([new DinhPolyline(0, 0, 0), new DinhPolyline(1000, 0, 0)], 0);

        Assert.False(kq.ThanhCong);
        Assert.Contains("Bề rộng", kq.LyDo);
        Assert.Empty(kq.Trai);
    }

    [Fact]
    public void Duoi_hai_dinh_phan_biet_bi_tu_choi()
    {
        var kq = EdgeOffset.Tinh([new DinhPolyline(5, 5, 0), new DinhPolyline(5, 5, 0)], 200);

        Assert.False(kq.ThanhCong);
        Assert.Contains("2 đỉnh", kq.LyDo);
    }

    [Fact]
    public void Cung_ban_kinh_nho_hon_nua_be_rong_bi_tu_choi()
    {
        // Nửa vòng tròn R=100 (bulge = 1) với bề rộng 300 ⇒ biên trong lộn ngược.
        var kq = EdgeOffset.Tinh([new DinhPolyline(0, 0, 1), new DinhPolyline(200, 0, 0)], 300);

        Assert.False(kq.ThanhCong);
        Assert.Contains("nhỏ hơn nửa bề rộng", kq.LyDo);
    }

    [Fact]
    public void Gap_nguoc_180_do_bi_tu_choi()
    {
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, 0),
            new DinhPolyline(300, 0, 0), // quay ngược lại đúng trên chính nó
        };

        var kq = EdgeOffset.Tinh(tim, 200);

        Assert.False(kq.ThanhCong);
        Assert.Contains("gấp ngược", kq.LyDo);
    }

    [Fact]
    public void Tuyen_tu_cat_bi_tu_choi()
    {
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, 0),
            new DinhPolyline(1000, 1000, 0),
            new DinhPolyline(500, -500, 0), // cắt ngang đoạn đầu
        };

        Assert.True(EdgeOffset.TuCat(tim));

        var kq = EdgeOffset.Tinh(tim, 100);
        Assert.False(kq.ThanhCong);
        Assert.Contains("tự cắt", kq.LyDo);
    }

    [Fact]
    public void Doan_qua_ngan_so_voi_be_rong_bi_tu_choi()
    {
        // Đoạn giữa dài 50 nhưng bề rộng 2000 ⇒ mitre hai đầu vượt qua nhau, biên đảo chiều.
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(1000, 0, 0),
            new DinhPolyline(1050, 50, 0),
            new DinhPolyline(1050, 2000, 0),
        };

        var kq = EdgeOffset.Tinh(tim, 2000);

        Assert.False(kq.ThanhCong);
        Assert.Contains("đảo chiều", kq.LyDo);
    }

    [Fact]
    public void Tuyen_khong_tu_cat_thi_khong_bi_bao_oan()
    {
        // Chữ U: 2 nhánh song song sát nhau nhưng KHÔNG cắt nhau.
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(2000, 0, 0),
            new DinhPolyline(2000, 300, 0),
            new DinhPolyline(0, 300, 0),
        };

        Assert.False(EdgeOffset.TuCat(tim));
        Assert.True(EdgeOffset.Tinh(tim, 100).ThanhCong);
    }

    [Fact]
    public void Cung_lon_chia_nho_du_min_de_do_tu_cat()
    {
        // Nửa vòng tròn không tự cắt, không được báo oan dù chia nhỏ nhiều đoạn.
        var tim = new[] { new DinhPolyline(0, 0, 1), new DinhPolyline(2000, 0, 0) };
        Assert.False(EdgeOffset.TuCat(tim));
        var kq = EdgeOffset.Tinh(tim, 200);
        Assert.True(kq.ThanhCong);
        // Nửa vòng R=1000: biên trong R=900, biên ngoài R=1100 (cùng tâm (1000,0)).
        GanBang(100, kq.Trai[0].X);
        GanBang(1900, kq.Trai[1].X);
        GanBang(-100, kq.Phai[0].X);
        GanBang(2100, kq.Phai[1].X);
    }

    [Fact]
    public void Bien_luon_cach_deu_tim_tren_tuyen_gay_khuc_bat_ky()
    {
        // Đối chứng độc lập: mọi đỉnh biên phải cách tim đúng d theo phương vuông góc đoạn kề.
        var tim = new[]
        {
            new DinhPolyline(0, 0, 0),
            new DinhPolyline(3000, 400, 0),
            new DinhPolyline(4500, 2600, 0),
        };
        const double beRong = 500;

        var kq = EdgeOffset.Tinh(tim, beRong);

        Assert.True(kq.ThanhCong);
        for (var i = 0; i < 2; i++)
        {
            var a = new Diem2(tim[i].X, tim[i].Y);
            var b = new Diem2(tim[i + 1].X, tim[i + 1].Y);
            var phap = BulgeMath.PhapTuyenTrai(BulgeMath.GocDayCung(a, b));
            foreach (var (bien, dau) in new[] { (kq.Trai, 1.0), (kq.Phai, -1.0) })
            {
                // Khoảng cách có dấu từ đỉnh biên tới ĐƯỜNG THẲNG chứa đoạn i.
                var p = new Diem2(bien[i].X, bien[i].Y) - a;
                var kc = p.X * phap.X + p.Y * phap.Y;
                Assert.Equal(dau * beRong / 2, kc, 6);
            }
        }
    }
}
