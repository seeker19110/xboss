using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Graph;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M115 §7 FR2 / AC1 — dựng đồ thị từ tuyến tim kỹ sư vẽ, gộp nút theo dung sai, phân loại nút.
/// Bản vẽ giả lập theo ĐƠN VỊ mm (1 đơn vị bản vẽ = 1 mm) nên ngưỡng của rule pack dùng thẳng.
/// </summary>
public class TuyenGraphTests
{
    /// <summary>Tham số lấy từ rule pack ĐANG PHÁT HÀNH — test và plugin không dùng 2 bộ số khác nhau.</summary>
    internal static ThamSoDoThi ThamSoPhatHanh()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        return ThamSoDoThi.Tu(pack.DrawTools.CompletionPolicy!);
    }

    internal static CompletionPolicySection CompletionPhatHanh() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.CompletionPolicy!;

    internal static Diem2 D(double x, double y) => new(x, y);

    /// <summary>
    /// Bản vẽ AC1: một tuyến trục từ điểm nguồn (0;0) có một cút 90° tại (10000;0), hai nhánh chạm
    /// vào trục tại (4000;0) và (7000;0) — nhánh sau còn một co 45° tại (7000;-2000). Ba đầu cuối
    /// đều có block thiết bị đúng hệ HVAC.
    /// </summary>
    internal static (IReadOnlyList<TuyenDauVao> Tuyen, IReadOnlyList<ThietBiDatSan> ThietBi) BanVeAc1(
        string size = "300x200", double caoDo = 3000)
    {
        var truc = new TuyenDauVao(
            "TRUC", [D(0, 0), D(10000, 0), D(10000, 5000)], "HVAC", size, caoDo, "tdc");
        var nhanhA = new TuyenDauVao(
            "NHANH-A", [D(4000, 0), D(4000, -3000)], "HVAC", size, caoDo, "tdc");
        var nhanhB = new TuyenDauVao(
            "NHANH-B", [D(7000, 0), D(7000, -2000), D(9000, -4000)], "HVAC", size, caoDo, "tdc");

        var thietBi = new List<ThietBiDatSan>
        {
            new("FCU-1", D(10000, 5000), "equipment", "HVAC", "FCU-01"),
            new("FCU-2", D(4000, -3000), "equipment", "HVAC", "FCU-02"),
            new("FCU-3", D(9000, -4000), "equipment", "HVAC", "FCU-03"),
        };
        return ([truc, nhanhA, nhanhB], thietBi);
    }

    internal static TuyenGraph DungAc1(string size = "300x200", double caoDo = 3000)
    {
        var (tuyen, thietBi) = BanVeAc1(size, caoDo);
        return TuyenGraph.Dung(tuyen, thietBi, D(0, 0), ThamSoPhatHanh());
    }

    // ===== AC1 =====

    [Fact]
    public void Ac1_hai_te_ba_ket_noi_thiet_bi_va_co_cut_dung()
    {
        var g = DungAc1();
        var phanLoai = NutPhanLoai.PhanLoai(g);

        // Đúng 2 nút tê, tại chính 2 chỗ nhánh chạm trục.
        var te = phanLoai.Where(n => n.Loai == LoaiNut.Te).ToList();
        Assert.Equal(2, te.Count);
        var xTe = te.Select(n => g.Nut[n.Nut].ViTri.X).OrderBy(x => x).ToList();
        Assert.Equal(4000, xTe[0], 3);
        Assert.Equal(7000, xTe[1], 3);
        Assert.All(te, n => Assert.Equal(0, g.Nut[n.Nut].ViTri.Y, 3));
        Assert.All(te, n => Assert.Equal(3, n.SoNhanh));
        Assert.All(te, n => Assert.Equal(90, n.GocDoiHuongDeg, 6)); // tê vuông góc

        // 3 kết nối thiết bị, đều khớp hệ.
        Assert.Equal(3, g.ThietBi.Count);
        Assert.All(g.ThietBi, t => Assert.True(t.KhopHe));
        Assert.Equal(3, phanLoai.Count(n => n.Loai == LoaiNut.KetNoiThietBi));

        // Điểm nguồn là nút riêng, KHÔNG bị coi là đầu tự do.
        Assert.Equal(LoaiNut.Nguon, phanLoai[g.NutNguon].Loai);
        Assert.Equal(D(0, 0), g.Nut[g.NutNguon].ViTri);
        Assert.DoesNotContain(phanLoai, n => n.Loai == LoaiNut.DauTuDo);

        // 2 nút đổi hướng: cút 90° trên trục, co 45° trên nhánh B.
        var doiHuong = phanLoai.Where(n => n.Loai == LoaiNut.DoiHuong)
            .OrderBy(n => g.Nut[n.Nut].ViTri.X)
            .ToList();
        Assert.Equal(2, doiHuong.Count);
        Assert.Equal(45, doiHuong[0].GocDoiHuongDeg, 6);   // (7000; -2000)
        Assert.Equal(90, doiHuong[1].GocDoiHuongDeg, 6);   // (10000; 0)

        // Bảng luật của bản phát hành chọn đúng co (góc nhỏ) và cút (góc lớn).
        var cp = CompletionPhatHanh();
        var phuKien = SuyPhuKien.Suy(phanLoai, cp);
        var co = phuKien.First(p => p.Nut == doiHuong[0].Nut);
        var cut = phuKien.First(p => p.Nut == doiHuong[1].Nut);
        Assert.Equal("co", co.NodeKind);
        Assert.Equal("cut", cut.NodeKind);
        Assert.Equal("elbow-duct", co.BlockId);
        Assert.All(te, n => Assert.Equal("tee-duct", phuKien.First(p => p.Nut == n.Nut).BlockId));

        // 0 lỗi chặn.
        var kiem = KiemTuyen.Kiem(g, phanLoai);
        Assert.True(kiem.Dat, string.Join(" | ", kiem.Chan.Select(l => l.ThongDiep)));
        Assert.Empty(kiem.CanhBao);
    }

    [Fact]
    public void Ac1_chieu_dong_di_ra_xa_dan_khoi_diem_nguon()
    {
        var g = DungAc1();

        // Mọi cạnh đều được BFS chạm tới, và cạnh nào cũng đi từ nút gần nguồn hơn sang nút xa hơn
        // (đo theo số cạnh, không theo khoảng cách hình học).
        Assert.Empty(g.CanhChuaDinhChieu);
        var buoc = BuocTuNguon(g);
        Assert.All(g.Canh, c => Assert.True(buoc[c.Tu] < buoc[c.Den], $"Cạnh {c.ChiSo} sai chiều dòng"));
    }

    private static int[] BuocTuNguon(TuyenGraph g)
    {
        var buoc = Enumerable.Repeat(int.MaxValue, g.Nut.Count).ToArray();
        buoc[g.NutNguon] = 0;
        var hang = new Queue<int>();
        hang.Enqueue(g.NutNguon);
        while (hang.Count > 0)
        {
            var u = hang.Dequeue();
            foreach (var e in g.CanhTaiNut(u))
            {
                var kia = g.DauKia(e, u);
                if (buoc[kia] != int.MaxValue) continue;
                buoc[kia] = buoc[u] + 1;
                hang.Enqueue(kia);
            }
        }
        return buoc;
    }

    // ===== Dung sai gộp nút =====

    [Fact]
    public void Hai_diem_gan_hon_dung_sai_gop_thanh_MOT_nut()
    {
        var ts = ThamSoPhatHanh();
        var lech = ts.DungSaiNut / 2; // 12,5 mm — kỹ sư bấm hụt

        var g = TuyenGraph.Dung(
            [
                new TuyenDauVao("A", [D(0, 0), D(5000, 0)], "HVAC", "300x200", 3000),
                new TuyenDauVao("B", [D(5000 + lech, 0), D(5000 + lech, 4000)], "HVAC", "300x200", 3000),
            ],
            [],
            D(0, 0),
            ts);

        // 3 nút: đầu A, chỗ nối đã gộp, đầu B — KHÔNG có nút thứ 4 cách nút nối 12,5 mm.
        Assert.Equal(3, g.Nut.Count);
        var noi = g.Nut.Single(n => g.Bac(n.ChiSo) == 2);
        Assert.Equal(2, g.CanhTaiNut(noi.ChiSo).Count);
        Assert.Empty(g.CanhChuaDinhChieu); // hai tuyến liên thông
    }

    [Fact]
    public void Hai_diem_xa_hon_dung_sai_KHONG_gop_va_thanh_hai_manh_roi()
    {
        var ts = ThamSoPhatHanh();
        var lech = ts.DungSaiNut * 4; // 100 mm — hụt thật, không phải sai số chuột

        var g = TuyenGraph.Dung(
            [
                new TuyenDauVao("A", [D(0, 0), D(5000, 0)], "HVAC", "300x200", 3000),
                new TuyenDauVao("B", [D(5000 + lech, 0), D(5000 + lech, 4000)], "HVAC", "300x200", 3000),
            ],
            [],
            D(0, 0),
            ts);

        Assert.Equal(4, g.Nut.Count);
        Assert.All(g.Nut, n => Assert.Equal(1, g.Bac(n.ChiSo)));
        // Tuyến B không nối được về nguồn → cảnh báo, và 2 đầu của nó là tuyến hở (lỗi chặn).
        Assert.Single(g.CanhChuaDinhChieu);
        var kiem = KiemTuyen.Kiem(g);
        Assert.False(kiem.Dat);
        Assert.Contains(kiem.CanhBao, l => l.Loai == LoaiLoiTuyen.KhongNoiVeNguon);
    }

    [Fact]
    public void Nhanh_cham_hut_vao_giua_tuyen_chinh_van_ra_te()
    {
        var ts = ThamSoPhatHanh();

        // Nhánh dừng cách tuyến chính 10 mm (< 25 mm dung sai) — không có giao điểm hình học nào.
        var g = TuyenGraph.Dung(
            [
                new TuyenDauVao("TRUC", [D(0, 0), D(10000, 0)], "HVAC", "300x200", 3000),
                new TuyenDauVao("NHANH", [D(5000, -10), D(5000, -4000)], "HVAC", "300x200", 3000),
            ],
            [],
            D(0, 0),
            ts);

        var te = NutPhanLoai.PhanLoai(g).Where(n => n.Loai == LoaiNut.Te).ToList();
        Assert.Single(te);
        Assert.Equal(3, te[0].SoNhanh);
    }
}
