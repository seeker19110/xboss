using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §7 FR2 / AC6 — 4 lỗi CHẶN của bước kiểm đồ thị tuyến. Mỗi loại có 1 ca DƯƠNG (lỗi phải nổ)
/// và 1 ca ÂM (đúng ca gần giống mà KHÔNG được báo oan) — báo oan làm kỹ sư mất lòng tin vào lệnh
/// nhanh hơn cả bỏ sót.
/// </summary>
public class KiemTuyenTests
{
    private static Diem2 D(double x, double y) => TuyenGraphTests.D(x, y);

    private static KetQuaKiemTuyen Kiem(
        IReadOnlyList<TuyenDauVao> tuyen, IReadOnlyList<ThietBiDatSan> thietBi) =>
        KiemTuyen.Kiem(TuyenGraph.Dung(tuyen, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh()));

    private static bool Co(KetQuaKiemTuyen kq, LoaiLoiTuyen loai) =>
        kq.Chan.Any(l => l.Loai == loai);

    // ===== (1) Tuyến hở =====

    [Fact]
    public void Tuyen_ho_ca_duong_dau_tuyen_khong_cham_gi()
    {
        var kq = Kiem([new TuyenDauVao("A", [D(0, 0), D(5000, 0)], "HVAC", "300x200", 3000)], []);

        Assert.True(Co(kq, LoaiLoiTuyen.TuyenHo));
        // Đúng MỘT đầu hở: đầu (0;0) là điểm nguồn nên không tính.
        Assert.Single(kq.Chan, l => l.Loai == LoaiLoiTuyen.TuyenHo);
        Assert.Contains("Tuyến hở", kq.Chan.First(l => l.Loai == LoaiLoiTuyen.TuyenHo).ThongDiep);
    }

    [Fact]
    public void Tuyen_ho_ca_am_dau_tuyen_cham_thiet_bi()
    {
        var kq = Kiem(
            [new TuyenDauVao("A", [D(0, 0), D(5000, 0)], "HVAC", "300x200", 3000)],
            [new ThietBiDatSan("FCU-1", D(5000, 0), "equipment", "HVAC")]);

        Assert.False(Co(kq, LoaiLoiTuyen.TuyenHo));
        Assert.True(kq.Dat);
    }

    // ===== (2) Thiếu cỡ =====

    [Fact]
    public void Thieu_size_ca_duong_mot_doan_chua_gan_co()
    {
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var sua = tuyen.Select(t => t.Id == "NHANH-A" ? t with { Size = null } : t).ToList();

        var kq = KiemTuyen.Kiem(
            TuyenGraph.Dung(sua, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh()));

        Assert.True(Co(kq, LoaiLoiTuyen.ThieuSize));
        // Báo MỘT lần cho cả tuyến, không mỗi cạnh.
        Assert.Single(kq.Chan, l => l.Loai == LoaiLoiTuyen.ThieuSize);
        Assert.Equal("NHANH-A", kq.Chan.First(l => l.Loai == LoaiLoiTuyen.ThieuSize).TuyenId);
        Assert.Contains(kq.CanhBao, l => l.Loai == LoaiLoiTuyen.ThieuThuocTinh && l.TuyenId == "NHANH-A");
    }

    [Fact]
    public void Thieu_size_ca_am_moi_tuyen_deu_co_co()
    {
        var kq = KiemTuyen.Kiem(TuyenGraphTests.DungAc1());

        Assert.False(Co(kq, LoaiLoiTuyen.ThieuSize));
        Assert.True(kq.Dat);
    }

    // ===== (3) Thiết bị nối sai hệ =====

    [Fact]
    public void Thiet_bi_sai_he_ca_duong()
    {
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var sua = thietBi.Select(t => t.Id == "FCU-2" ? t with { HeId = "PIPING" } : t).ToList();

        var kq = KiemTuyen.Kiem(
            TuyenGraph.Dung(tuyen, sua, D(0, 0), TuyenGraphTests.ThamSoPhatHanh()));

        Assert.True(Co(kq, LoaiLoiTuyen.ThietBiSaiHe));
        var loi = kq.Chan.First(l => l.Loai == LoaiLoiTuyen.ThietBiSaiHe);
        Assert.Equal("FCU-2", loi.ThietBiId);
        Assert.Contains("PIPING", loi.ThongDiep);
        Assert.Contains("HVAC", loi.ThongDiep);
    }

    [Fact]
    public void Thiet_bi_sai_he_ca_am_va_ca_thiet_bi_chua_khai_he_chi_canh_bao()
    {
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        Assert.False(Co(KiemTuyen.Kiem(TuyenGraph.Dung(tuyen, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh())),
            LoaiLoiTuyen.ThietBiSaiHe));

        // Block chưa khai hệ KHÔNG bị kết tội sai hệ — đó là thiếu thuộc tính (cảnh báo).
        var chuaKhai = thietBi.Select(t => t.Id == "FCU-3" ? t with { HeId = null } : t).ToList();
        var kq = KiemTuyen.Kiem(
            TuyenGraph.Dung(tuyen, chuaKhai, D(0, 0), TuyenGraphTests.ThamSoPhatHanh()));

        Assert.False(Co(kq, LoaiLoiTuyen.ThietBiSaiHe));
        Assert.True(kq.Dat);
        Assert.Contains(kq.CanhBao, l => l.Loai == LoaiLoiTuyen.ThieuThuocTinh && l.ThietBiId == "FCU-3");
    }

    // ===== (4) Cao độ mâu thuẫn =====

    [Fact]
    public void Cao_do_mau_thuan_ca_duong_te_3_nhanh_lech_cao_do()
    {
        var (tuyen, thietBi) = TuyenGraphTests.BanVeAc1();
        var sua = tuyen.Select(t => t.Id == "NHANH-A" ? t with { CaoDoMm = 2500 } : t).ToList();

        var kq = KiemTuyen.Kiem(
            TuyenGraph.Dung(sua, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh()));

        Assert.True(Co(kq, LoaiLoiTuyen.CaoDoMauThuan));
        var loi = kq.Chan.First(l => l.Loai == LoaiLoiTuyen.CaoDoMauThuan);
        Assert.Contains("3 nhánh", loi.ThongDiep);
        Assert.Contains("2500", loi.ThongDiep);
    }

    [Fact]
    public void Cao_do_mau_thuan_ca_am_nut_2_nhanh_lech_cao_do_la_doan_len_xuong()
    {
        // Hai tuyến nối tiếp nhau, khác cao độ: đây là ĐOẠN LÊN/XUỐNG hợp lệ, không phải mâu thuẫn.
        var tuyen = new List<TuyenDauVao>
        {
            new("A", [D(0, 0), D(5000, 0)], "HVAC", "300x200", 3000),
            new("B", [D(5000, 0), D(9000, 0)], "HVAC", "300x200", 2600),
        };
        var thietBi = new List<ThietBiDatSan>
        {
            new("FCU-1", D(9000, 0), "equipment", "HVAC"),
        };
        var g = TuyenGraph.Dung(tuyen, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh());
        var phanLoai = NutPhanLoai.PhanLoai(g);
        var kq = KiemTuyen.Kiem(g, phanLoai);

        Assert.False(Co(kq, LoaiLoiTuyen.CaoDoMauThuan));
        Assert.True(kq.Dat);
        Assert.Contains(phanLoai, n => n.Loai == LoaiNut.DoanLenXuong);

        // Lệch trong dung sai (5 mm) thì KHÔNG coi là đoạn lên/xuống.
        var trongDungSai = tuyen.Select(t => t.Id == "B" ? t with { CaoDoMm = 2997 } : t).ToList();
        var g2 = TuyenGraph.Dung(trongDungSai, thietBi, D(0, 0), TuyenGraphTests.ThamSoPhatHanh());
        Assert.DoesNotContain(NutPhanLoai.PhanLoai(g2), n => n.Loai == LoaiNut.DoanLenXuong);
    }
}
