using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR4 — hình học chèn phụ kiện/thiết bị (AC5: góc xoay sai số ≤0.1°; AC4: layer thiết bị
/// vẫn bóc đếm được). Adapter chỉ còn gọi API AutoCAD nên toàn bộ công thức bị kẹp ở đây.
/// </summary>
public class FittingPlacementTests
{
    private const double Do = Math.PI / 180;

    /// <summary>Sai số cho phép của AC5, quy về radian.</summary>
    private const double SaiSoAc5 = 0.1 * Do;

    private static void GocGan(double mongDoiRad, double thatRad)
    {
        var lech = Math.Abs(BulgeMath.ChuanHoaGoc(mongDoiRad - thatRad));
        Assert.True(lech <= SaiSoAc5, $"lệch {lech / Do:0.####}° > 0.1° (mong đợi {mongDoiRad / Do:0.###}°, thật {thatRad / Do:0.###}°)");
    }

    private static List<DinhPolyline> TuyenGay() =>
    [
        new(0, 0, 0),       // đoạn 0: (0,0) → (1000,0), ngang
        new(1000, 0, 0),    // đoạn 1: (1000,0) → (1000,800), dọc lên
        new(1000, 800, 0),
    ];

    // ===== Góc tiếp tuyến =====

    [Fact]
    public void Giua_doan_thang_xien_lay_dung_goc_doan()
    {
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 1000 * Math.Tan(30 * Do), 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(500, 500 * Math.Tan(30 * Do)));

        Assert.NotNull(kq);
        GocGan(30 * Do, kq!.Goc);
        Assert.Equal(0, kq.ChiSoDoan);
        Assert.False(kq.TaiDinh);
        Assert.Equal(0, kq.KhoangCach, 6);
    }

    [Fact]
    public void Diem_bam_lech_khoi_tim_duoc_hit_vao_hinh_chieu()
    {
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(400, 75));

        Assert.NotNull(kq);
        Assert.Equal(400, kq!.Diem.X, 6);
        Assert.Equal(0, kq.Diem.Y, 6);
        Assert.Equal(75, kq.KhoangCach, 6);
        GocGan(0, kq.Goc);
    }

    [Fact]
    public void Tai_dinh_gay_lay_huong_DI_VAO_dinh()
    {
        // Bấm đúng đỉnh (1000,0) nối đoạn ngang → đoạn dọc: hướng vào = 0°, không phải 90°.
        var kq = FittingPlacement.TrenTuyen(TuyenGay(), new Diem2(1000, 0));

        Assert.NotNull(kq);
        Assert.True(kq!.TaiDinh);
        Assert.Equal(0, kq.ChiSoDoan); // đoạn ĐI VÀO đỉnh
        GocGan(0, kq.Goc);
    }

    [Fact]
    public void Bam_qua_dinh_thi_thuoc_doan_sau_chu_khong_ep_ve_dinh()
    {
        // Bấm quá đỉnh 5 đơn vị về phía đoạn dọc: điểm hít nằm TRÊN đoạn sau (không phải đỉnh)
        // nên góc là 90° — quy ước "hướng đi vào" chỉ áp dụng khi hít ĐÚNG đỉnh (OSNAP endpoint).
        var kq = FittingPlacement.TrenTuyen(TuyenGay(), new Diem2(1010, 5));

        Assert.NotNull(kq);
        Assert.False(kq!.TaiDinh);
        Assert.Equal(1, kq.ChiSoDoan);
        Assert.Equal(1000, kq.Diem.X, 6);
        Assert.Equal(5, kq.Diem.Y, 6);
        GocGan(90 * Do, kq.Goc);
    }

    [Fact]
    public void Giua_doan_thu_hai_lay_goc_doan_do()
    {
        var kq = FittingPlacement.TrenTuyen(TuyenGay(), new Diem2(1000, 400));

        Assert.NotNull(kq);
        Assert.Equal(1, kq!.ChiSoDoan);
        Assert.False(kq.TaiDinh);
        GocGan(90 * Do, kq.Goc);
    }

    [Fact]
    public void Tren_cung_goc_tiep_tuyen_vuong_goc_ban_kinh()
    {
        // Cung 1/4 ngược kim từ (1000,0) tới (0,1000), tâm gốc toạ độ.
        var tim = new List<DinhPolyline> { new(1000, 0, Math.Tan(22.5 * Do)), new(0, 1000, 0) };

        // Điểm bấm ở 45° ngoài bán kính → hít về (r·cos45, r·sin45), tiếp tuyến = 45° + 90° = 135°.
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(1500 * Math.Cos(45 * Do), 1500 * Math.Sin(45 * Do)));

        Assert.NotNull(kq);
        Assert.Equal(1000 * Math.Cos(45 * Do), kq!.Diem.X, 6);
        Assert.Equal(1000 * Math.Sin(45 * Do), kq.Diem.Y, 6);
        Assert.Equal(500, kq.KhoangCach, 6);
        GocGan(135 * Do, kq.Goc);
    }

    [Fact]
    public void Tren_cung_thuan_kim_tiep_tuyen_doi_chieu()
    {
        // Cung 1/4 THUẬN kim từ (0,1000) tới (1000,0), tâm gốc toạ độ.
        var tim = new List<DinhPolyline> { new(0, 1000, -Math.Tan(22.5 * Do)), new(1000, 0, 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(800 * Math.Cos(45 * Do), 800 * Math.Sin(45 * Do)));

        Assert.NotNull(kq);
        GocGan(45 * Do - 90 * Do, kq!.Goc);
    }

    [Fact]
    public void Bam_ngoai_pham_vi_cung_kep_ve_dau_mut_gan_hon()
    {
        var tim = new List<DinhPolyline> { new(1000, 0, Math.Tan(22.5 * Do)), new(0, 1000, 0) };
        // Điểm nằm ở góc -45° (ngoài cung 0..90°) → kẹp về đầu mút (1000,0), tiếp tuyến đầu = 90°.
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(1000 * Math.Cos(-45 * Do), 1000 * Math.Sin(-45 * Do)));

        Assert.NotNull(kq);
        Assert.Equal(1000, kq!.Diem.X, 6);
        Assert.Equal(0, kq.Diem.Y, 6);
        GocGan(90 * Do, kq.Goc);
    }

    [Fact]
    public void Dau_cuoi_tuyen_ho_khong_bi_coi_la_dinh_noi()
    {
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0) };
        var dauTuyen = FittingPlacement.TrenTuyen(tim, new Diem2(-500, 0));
        var cuoiTuyen = FittingPlacement.TrenTuyen(tim, new Diem2(1500, 0));

        Assert.False(dauTuyen!.TaiDinh);
        Assert.Equal(0, dauTuyen.Diem.X, 6);
        Assert.False(cuoiTuyen!.TaiDinh);
        Assert.Equal(1000, cuoiTuyen.Diem.X, 6);
    }

    [Fact]
    public void Tuyen_kin_coi_doan_khep_la_mot_doan_that()
    {
        // Tam giác kín: đỉnh cuối nối về đỉnh đầu.
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0), new(1000, 1000, 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(400, 400), kin: true);

        Assert.NotNull(kq);
        Assert.Equal(2, kq!.ChiSoDoan); // đoạn khép (1000,1000) → (0,0)
        GocGan(225 * Do, kq.Goc);
    }

    [Fact]
    public void Tuyen_kin_bam_dung_dinh_dau_lay_huong_doan_khep_di_vao()
    {
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0), new(1000, 1000, 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(0, 0), kin: true);

        Assert.NotNull(kq);
        Assert.True(kq!.TaiDinh);
        // Hướng đi vào đỉnh đầu = hướng đoạn khép (1000,1000) → (0,0) = 225°.
        GocGan(225 * Do, kq.Goc);
    }

    [Fact]
    public void Dinh_trung_nhau_khong_lam_lech_huong_chen()
    {
        // Polyline có đỉnh trùng (hay gặp khi vẽ tay): đoạn suy biến bị bỏ, hướng vẫn đúng.
        var tim = new List<DinhPolyline> { new(0, 0, 0), new(1000, 0, 0), new(1000, 0, 0), new(1000, 800, 0) };
        var kq = FittingPlacement.TrenTuyen(tim, new Diem2(1000, 0));

        Assert.NotNull(kq);
        Assert.True(kq!.TaiDinh);
        GocGan(0, kq.Goc);
    }

    [Fact]
    public void Tuyen_it_hon_hai_dinh_khong_chen_duoc()
    {
        Assert.Null(FittingPlacement.TrenTuyen([], new Diem2(0, 0)));
        Assert.Null(FittingPlacement.TrenTuyen([new DinhPolyline(0, 0, 0)], new Diem2(0, 0)));
        Assert.Null(FittingPlacement.TrenTuyen(
            [new DinhPolyline(5, 5, 0), new DinhPolyline(5, 5, 0)], new Diem2(0, 0)));
    }

    // ===== Tỉ lệ theo size =====

    [Fact]
    public void Ty_le_lay_be_rong_nhin_thay_tren_mat_bang()
    {
        Assert.Equal(300, FittingPlacement.TyLeTheoSize("300x200")!.Value, 9);
        Assert.Equal(50, FittingPlacement.TyLeTheoSize("DN50")!.Value, 9);
        Assert.Equal(150, FittingPlacement.TyLeTheoSize("150")!.Value, 9);
    }

    [Fact]
    public void Ty_le_quy_doi_theo_don_vi_ban_ve()
    {
        // Bản vẽ vẽ bằng inch (1 đơn vị = 25.4mm): ống 300mm ra 11.81 đơn vị.
        Assert.Equal(300 / 25.4, FittingPlacement.TyLeTheoSize("300x200", 25.4)!.Value, 9);
    }

    [Fact]
    public void Size_khong_doc_duoc_thi_khong_bia_ty_le()
    {
        Assert.Null(FittingPlacement.TyLeTheoSize(null));
        Assert.Null(FittingPlacement.TyLeTheoSize(""));
        Assert.Null(FittingPlacement.TyLeTheoSize("ống to"));
        Assert.Null(FittingPlacement.TyLeTheoSize("300x200", toMm: 0));
    }

    // ===== Layer thiết bị (AC4) =====

    private static DrawSystem HeMau(params string[] layer) => new()
    {
        Id = "FIREFIGHTING",
        Name = "Chữa cháy",
        Lines = layer.Select(l => new DrawLine { ItemId = "x", Layer = l, Sizes = ["DN25"] }).ToList(),
    };

    [Fact]
    public void Layer_thiet_bi_uu_tien_layer_khop_takeoff()
    {
        var kq = FittingPlacement.LayerChoThietBi(HeMau("F-SPRN-DRAI", "F-SPRN-PIPE"), ["F-SPRN-PIPE"]);

        Assert.NotNull(kq);
        Assert.Equal("F-SPRN-PIPE", kq!.Layer);
        Assert.Null(kq.CanhBao);
    }

    [Fact]
    public void Layer_thiet_bi_khong_khop_thi_canh_bao_boc_hut()
    {
        var kq = FittingPlacement.LayerChoThietBi(HeMau("M-DUCT-SUPP"), ["M-HVAC-EQPM"]);

        Assert.NotNull(kq);
        Assert.Equal("M-DUCT-SUPP", kq!.Layer);
        Assert.Contains("KHÔNG đếm", kq.CanhBao);
    }

    [Fact]
    public void Layer_thiet_bi_khi_item_dem_moi_layer()
    {
        var kq = FittingPlacement.LayerChoThietBi(HeMau("M-DUCT-SUPP", "M-DUCT-RETN"), []);

        Assert.NotNull(kq);
        Assert.Equal("M-DUCT-SUPP", kq!.Layer);
        Assert.Null(kq.CanhBao);
        Assert.Null(FittingPlacement.LayerChoThietBi(HeMau(), ["M-DUCT-SUPP"]));
    }

    [Fact]
    public void Layer_thiet_bi_tren_rule_pack_that_dung_cho_moi_thiet_bi_khai_trong_v4()
    {
        // Chống trôi: mọi equipment[] của v4 phải đặt được lên một layer khớp takeoff (AC4).
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        var theoId = pack.RulePack.Takeoff.Items.ToDictionary(i => i.Id, StringComparer.Ordinal);

        foreach (var he in pack.DrawTools.Systems)
        {
            foreach (var id in he.Equipment)
            {
                Assert.True(theoId.TryGetValue(id, out var item), $"thiết bị \"{id}\" không có trong takeoff.items");
                var kq = FittingPlacement.LayerChoThietBi(he, item!.LayerMatchAny);
                Assert.NotNull(kq);
                Assert.True(kq!.CanhBao is null, $"hệ {he.Id} / thiết bị {id}: {kq.CanhBao}");
            }
        }
    }
}
