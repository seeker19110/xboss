using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Zoning;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.3 "bóc theo vùng" — cắt tuyến theo ranh giới polyline kín. Then chốt: AC (c)
/// tuyến 10 m cắt ranh giới 6/4 → vùng A 6.00 m, vùng B 4.00 m; và bất biến "không mất mét nào"
/// (tổng các phần luôn bằng chiều dài tuyến, phần ngoài vùng vẫn được báo).
/// </summary>
public class VungClipperTests
{
    private static Diem2 D(double x, double y) => new(x, y);

    /// <summary>Ranh giới hình chữ nhật (đơn vị bản vẽ = mm).</summary>
    private static RanhGioiVung ChuNhat(string ten, double x1, double y1, double x2, double y2) =>
        new(ten,
        [
            new DoanTuyen(D(x1, y1), D(x2, y1)),
            new DoanTuyen(D(x2, y1), D(x2, y2)),
            new DoanTuyen(D(x2, y2), D(x1, y2)),
            new DoanTuyen(D(x1, y2), D(x1, y1)),
        ]);

    [Fact]
    public void AC_c_tuyen_10m_cat_ranh_gioi_6_4_ra_dung_6m_va_4m()
    {
        // Tuyến thẳng 10 000 mm dọc trục X; vùng A phủ 0..6000, vùng B phủ 6000..12000.
        var tuyen = new[] { new DoanTuyen(D(0, 0), D(10_000, 0)) };
        var vung = new[]
        {
            ChuNhat("Vùng A", -1000, -1000, 6000, 1000),
            ChuNhat("Vùng B", 6000, -1000, 12_000, 1000),
        };

        var phan = VungClipper.Cat(tuyen, vung);

        Assert.Equal(2, phan.Count);
        Assert.Equal("Vùng A", phan[0].Vung);
        Assert.Equal(6000, phan[0].ChieuDai, 6);
        Assert.Equal("Vùng B", phan[1].Vung);
        Assert.Equal(4000, phan[1].ChieuDai, 6);
        // Cắt ĐÚNG tại giao điểm, không làm tròn về đỉnh gần nhất.
        Assert.Equal(6000, phan[0].Cuoi.X, 6);
        Assert.Equal(6000, phan[1].Dau.X, 6);

        var tong = VungClipper.GopTheoVung(phan);
        Assert.Equal([("Vùng A", 6000d), ("Vùng B", 4000d)], tong);
    }

    [Fact]
    public void Phan_ngoai_moi_vung_van_duoc_bao_khong_mat_met_nao()
    {
        var tuyen = new[] { new DoanTuyen(D(0, 0), D(10_000, 0)) };
        var vung = new[] { ChuNhat("Tầng 5", 2000, -500, 5000, 500) };

        var phan = VungClipper.Cat(tuyen, vung);

        Assert.Equal(3, phan.Count);
        Assert.Equal(VungClipper.NgoaiVung, phan[0].Vung);
        Assert.Equal(2000, phan[0].ChieuDai, 6);
        Assert.Equal("Tầng 5", phan[1].Vung);
        Assert.Equal(3000, phan[1].ChieuDai, 6);
        Assert.Equal(VungClipper.NgoaiVung, phan[2].Vung);
        Assert.Equal(5000, phan[2].ChieuDai, 6);
        Assert.Equal(10_000, phan.Sum(p => p.ChieuDai), 6);
    }

    [Fact]
    public void Tuyen_gay_khuc_nam_tron_trong_vung_gop_thanh_mot_phan()
    {
        var tuyen = new[]
        {
            new DoanTuyen(D(1000, 1000), D(4000, 1000)),
            new DoanTuyen(D(4000, 1000), D(4000, 3000)),
        };
        var vung = new[] { ChuNhat("Zone A", 0, 0, 5000, 5000) };

        var phan = VungClipper.Cat(tuyen, vung);

        var p = Assert.Single(phan);
        Assert.Equal("Zone A", p.Vung);
        Assert.Equal(5000, p.ChieuDai, 6);
    }

    [Fact]
    public void Cung_tron_do_theo_chieu_dai_cung_that_khong_phai_day_cung()
    {
        // 1/4 cung bán kính 1000 (bulge = tan(90°/4)); chiều dài thật = π·1000/2 ≈ 1570.80,
        // dây cung chỉ 1414.2 — nếu code đo theo dây thì sai ~10%.
        var bulge = Math.Tan(Math.PI / 2 / 4);
        var tuyen = new[] { new DoanTuyen(D(1000, 0), D(0, 1000), bulge) };
        var vung = new[] { ChuNhat("Zone A", -2000, -2000, 2000, 2000) };

        var p = Assert.Single(VungClipper.Cat(tuyen, vung));
        Assert.Equal("Zone A", p.Vung);
        Assert.Equal(Math.PI * 1000 / 2, p.ChieuDai, 3);
    }

    [Fact]
    public void Cung_tron_cat_ranh_gioi_chia_dung_ti_le()
    {
        // Cùng 1/4 cung; ranh giới cắt tại x = 1000·cos45° → phần trong vùng = nửa cung (45°).
        var bulge = Math.Tan(Math.PI / 2 / 4);
        var tuyen = new[] { new DoanTuyen(D(1000, 0), D(0, 1000), bulge) };
        var vung = new[] { ChuNhat("Zone A", -2000, -2000, 1000 * Math.Cos(Math.PI / 4), 2000) };

        var phan = VungClipper.Cat(tuyen, vung);

        Assert.Equal(2, phan.Count);
        Assert.Equal(VungClipper.NgoaiVung, phan[0].Vung);
        Assert.Equal("Zone A", phan[1].Vung);
        // Sai số cho phép: ranh giới/cung đều tuyến tính hóa bước 5° → lệch < 3 mm trên 785 mm.
        Assert.Equal(Math.PI * 1000 / 4, phan[1].ChieuDai, 0.5);
        Assert.Equal(Math.PI * 1000 / 2, phan.Sum(p => p.ChieuDai), 3);
    }

    [Fact]
    public void Vung_chong_nhau_lay_vung_dau_tien_first_match()
    {
        var tuyen = new[] { new DoanTuyen(D(1000, 0), D(2000, 0)) };
        var vung = new[]
        {
            ChuNhat("Vùng A", 0, -500, 5000, 500),
            ChuNhat("Vùng B", 0, -500, 5000, 500),
        };

        var p = Assert.Single(VungClipper.Cat(tuyen, vung));
        Assert.Equal("Vùng A", p.Vung);
    }

    [Fact]
    public void Khong_khai_vung_nao_thi_ca_tuyen_la_ngoai_vung()
    {
        var p = Assert.Single(VungClipper.Cat([new DoanTuyen(D(0, 0), D(3000, 0))], []));
        Assert.Equal(VungClipper.NgoaiVung, p.Vung);
        Assert.Equal(3000, p.ChieuDai, 6);
    }

    [Fact]
    public void Diem_cua_block_thuoc_vung_chua_no()
    {
        var vung = new[] { ChuNhat("Tầng 5", 0, 0, 5000, 5000), ChuNhat("Tầng 6", 6000, 0, 9000, 5000) };
        Assert.Equal("Tầng 5", VungClipper.VungChuaDiem(D(2500, 2500), vung));
        Assert.Equal("Tầng 6", VungClipper.VungChuaDiem(D(7000, 2500), vung));
        Assert.Equal(VungClipper.NgoaiVung, VungClipper.VungChuaDiem(D(5500, 2500), vung));
    }

    [Fact]
    public void Ranh_gioi_khong_khep_kin_van_duoc_tu_khep()
    {
        // Kỹ sư vẽ 3 cạnh rồi quên đóng — coi như tam giác kín, không vỡ phép kiểm điểm-trong-đa-giác.
        var vung = new[]
        {
            new RanhGioiVung("Tam giác",
            [
                new DoanTuyen(D(0, 0), D(4000, 0)),
                new DoanTuyen(D(4000, 0), D(0, 4000)),
            ]),
        };
        Assert.Equal("Tam giác", VungClipper.VungChuaDiem(D(500, 500), vung));
        Assert.Equal(VungClipper.NgoaiVung, VungClipper.VungChuaDiem(D(3000, 3000), vung));
    }
}
