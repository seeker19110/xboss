using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M109 PR1 — hình học ngắt nét giao chéo (§9 phần Core, chạy trên CI Linux, không cần AutoCAD):
/// vùng che theo bề rộng + clearance, cầu vượt đúng bán kính, lọc góc gắt, xếp hạng priority
/// (kể cả hệ không khai) và đảo tay thắng priority.
/// </summary>
public class CrossingGeometryTests
{
    private static readonly string[] Priority = ["HVAC", "PIPING", "FIREFIGHTING", "ELECTRICAL", "ELV"];

    private static void GanBang(double mong, double thuc) => Assert.Equal(mong, thuc, 6);

    // ===== Vùng che (phương án B — wipeout) =====

    [Fact]
    public void Vung_che_giao_vuong_goc_rong_dung_be_rong_tuyen_tren_cong_2_clearance()
    {
        // AC1: ống gió 800 (đi trên, chạy theo trục X) cắt vuông góc ống nước bề rộng 100 (đi dưới).
        var dinh = CrossingGeometry.VungChe(
            new Diem2(0, 0), huongTren: (1, 0), huongDuoi: (0, 1),
            beRongTren: 800, beRongDuoi: 100, clearance: 50);

        Assert.Equal(4, dinh.Count);
        // Ngang tuyến đi trên (trục Y): 800 + 2×50 = 900 ⇒ ±450.
        GanBang(450, dinh.Max(d => d.Y));
        GanBang(-450, dinh.Min(d => d.Y));
        // Dọc tuyến đi trên (trục X): vừa đủ trùm bề rộng tuyến dưới ⇒ ±50.
        GanBang(50, dinh.Max(d => d.X));
        GanBang(-50, dinh.Min(d => d.X));
    }

    [Fact]
    public void Vung_che_giao_cheo_dai_ra_theo_1_tren_sin_goc()
    {
        // Giao 30° ⇒ phần tuyến dưới nằm trong dải rộng của tuyến trên dài gấp 1/sin30° = 2 lần.
        var huongDuoi = (Math.Cos(Math.PI / 6), Math.Sin(Math.PI / 6));
        var dinh = CrossingGeometry.VungChe(
            new Diem2(0, 0), (1, 0), huongDuoi,
            beRongTren: 300, beRongDuoi: 200, clearance: 0);

        GanBang(150, dinh.Max(d => d.Y));
        GanBang(200d / 2 / Math.Sin(Math.PI / 6), dinh.Max(d => d.X)); // = 200
    }

    [Fact]
    public void Vung_che_bam_theo_diem_giao_va_huong_tuyen_tren()
    {
        // Tuyến trên chạy theo trục Y ⇒ vùng che xoay theo: bề rộng nằm ngang.
        var dinh = CrossingGeometry.VungChe(
            new Diem2(1000, 2000), huongTren: (0, 1), huongDuoi: (1, 0),
            beRongTren: 400, beRongDuoi: 100, clearance: 50);

        GanBang(1000 - 250, dinh.Min(d => d.X));
        GanBang(1000 + 250, dinh.Max(d => d.X));
        GanBang(2000 - 50, dinh.Min(d => d.Y));
        GanBang(2000 + 50, dinh.Max(d => d.Y));
    }

    [Fact]
    public void Hai_tuyen_song_song_khong_co_vung_che()
    {
        Assert.Empty(CrossingGeometry.VungChe(new Diem2(0, 0), (1, 0), (2, 0), 300, 100, 50));
        Assert.Empty(CrossingGeometry.VungChe(new Diem2(0, 0), (0, 0), (0, 1), 300, 100, 50));
    }

    // ===== Cầu vượt (phương án C — tuyến đơn nét) =====

    [Fact]
    public void Cau_vuot_dung_ban_kinh_va_hai_dau_cat_trum_be_rong_tuyen_tren()
    {
        // AC3: cáp (đơn nét, chạy theo trục X) chui dưới tuyến đơn nét khác (bề rộng 0) vuông góc.
        var kq = CrossingGeometry.CauVuot(
            new Diem2(0, 0), huongDuoi: (1, 0), huongTren: (0, 1),
            beRongTren: 0, clearance: 50, banKinh: 150);

        Assert.True(kq.ThanhCong);
        Assert.Null(kq.LyDo);
        GanBang(150, kq.BanKinh);
        GanBang(-50, kq.Dau.X);   // nửa dây = clearance / sin90° = 50
        GanBang(50, kq.Cuoi.X);
        GanBang(0, kq.Dau.Y);
        // Tâm nằm trên trung trực dây, cách dây sqrt(150² − 50²).
        GanBang(0, kq.Tam.X);
        GanBang(-Math.Sqrt(150.0 * 150 - 50 * 50), kq.Tam.Y);
        // Mọi điểm của cung cách tâm đúng bán kính.
        GanBang(150, kq.Tam.KhoangCach(kq.Dau));
        GanBang(150, kq.Tam.KhoangCach(kq.Cuoi));
        // Cung nhỏ vồng lên trên (ngược phía tâm) và quay theo chiều kim ⇒ bulge âm, |bulge| < 1.
        Assert.True(kq.Bulge < 0);
        Assert.True(Math.Abs(kq.Bulge) < 1);
        GanBang(-Math.Tan(Math.Asin(50.0 / 150) / 2), kq.Bulge);
    }

    [Fact]
    public void Cau_vuot_trum_ca_be_rong_tuyen_di_tren()
    {
        // Tuyến trên là ống gió 800 ⇒ nửa dây = 800/2 + 50 = 450, vẫn nằm trong bán kính 500.
        var kq = CrossingGeometry.CauVuot(
            new Diem2(0, 0), (1, 0), (0, 1), beRongTren: 800, clearance: 50, banKinh: 500);

        Assert.True(kq.ThanhCong);
        GanBang(-450, kq.Dau.X);
        GanBang(450, kq.Cuoi.X);
    }

    [Fact]
    public void Ban_kinh_nho_hon_nua_day_thi_tu_choi_kem_ly_do_thay_vi_ve_sai()
    {
        var kq = CrossingGeometry.CauVuot(
            new Diem2(0, 0), (1, 0), (0, 1), beRongTren: 800, clearance: 50, banKinh: 150);

        Assert.False(kq.ThanhCong);
        Assert.Contains("jogRadiusMm", kq.LyDo!);
    }

    [Fact]
    public void Cau_vuot_tu_choi_khi_ban_kinh_khong_duong_hoac_hai_tuyen_song_song()
    {
        Assert.False(CrossingGeometry.CauVuot(new Diem2(0, 0), (1, 0), (0, 1), 0, 50, 0).ThanhCong);
        Assert.False(CrossingGeometry.CauVuot(new Diem2(0, 0), (1, 0), (3, 0), 0, 50, 150).ThanhCong);
        Assert.False(CrossingGeometry.CauVuot(new Diem2(0, 0), (0, 0), (0, 1), 0, 50, 150).ThanhCong);
    }

    // ===== Lọc góc gắt (FR3) =====

    [Fact]
    public void Goc_giao_duoi_nguong_thi_khong_ngat_net()
    {
        Assert.True(CrossingGeometry.DuGocDeNgat(90, 15));
        Assert.True(CrossingGeometry.DuGocDeNgat(15, 15)); // đúng ngưỡng vẫn ngắt
        Assert.False(CrossingGeometry.DuGocDeNgat(14.9, 15));
        Assert.False(CrossingGeometry.DuGocDeNgat(0, 15));
    }

    // ===== Xếp hạng theo priority (FR3) =====

    [Fact]
    public void He_dung_truoc_trong_priority_di_tren()
    {
        var kq = CrossingGeometry.ChonTrenDuoi("PIPING", "HVAC", Priority);
        Assert.NotNull(kq);
        Assert.Equal("HVAC", kq!.Value.HeTren);
        Assert.Equal("PIPING", kq.Value.HeDuoi);
        Assert.False(kq.Value.TheoDaoTay);

        // Thứ tự tham số không đổi kết quả.
        Assert.Equal("HVAC", CrossingGeometry.ChonTrenDuoi("HVAC", "PIPING", Priority)!.Value.HeTren);
    }

    [Fact]
    public void He_khong_khai_trong_priority_xep_sau_cung()
    {
        Assert.Equal(int.MaxValue, CrossingGeometry.HangUuTien("PLUMBING-LA", Priority));
        Assert.Equal(0, CrossingGeometry.HangUuTien("HVAC", Priority));

        // Hệ lạ luôn đi dưới, kể cả so với hệ xếp chót bảng.
        var kq = CrossingGeometry.ChonTrenDuoi("HE-LA", "ELV", Priority);
        Assert.Equal("ELV", kq!.Value.HeTren);
        Assert.Equal("HE-LA", kq.Value.HeDuoi);
    }

    [Fact]
    public void Hai_he_cung_khong_khai_van_cho_ket_qua_tat_dinh()
    {
        // Không có ý nghĩa kỹ thuật, chỉ cần chạy lại lệnh cho ra y hệt (AC4).
        var xuoi = CrossingGeometry.ChonTrenDuoi("LA-A", "LA-B", Priority)!.Value;
        var nguoc = CrossingGeometry.ChonTrenDuoi("LA-B", "LA-A", Priority)!.Value;
        Assert.Equal(xuoi.HeTren, nguoc.HeTren);
        Assert.Equal(xuoi.HeDuoi, nguoc.HeDuoi);
    }

    [Fact]
    public void Hai_tuyen_cung_he_khong_ngat_net()
    {
        // FR3: ca này (kể cả cấp × thoát nước, cùng hệ PIPING) đi vào mục báo cáo riêng.
        Assert.Null(CrossingGeometry.ChonTrenDuoi("PIPING", "PIPING", Priority));
    }

    [Fact]
    public void Dao_tay_thang_priority()
    {
        // AC5: kỹ sư đảo 1 điểm giao rồi chạy lại thì điểm đó giữ chiều đã đảo.
        var kq = CrossingGeometry.ChonTrenDuoi("HVAC", "PIPING", Priority, daoTay: true);
        Assert.Equal("PIPING", kq!.Value.HeTren);
        Assert.Equal("HVAC", kq.Value.HeDuoi);
        Assert.True(kq.Value.TheoDaoTay);

        // Cùng hệ thì đảo tay cũng không sinh ngắt nét.
        Assert.Null(CrossingGeometry.ChonTrenDuoi("HVAC", "HVAC", Priority, daoTay: true));
    }
}
