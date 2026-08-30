using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using XBoss.Cad.Core.Zoning;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 PR3 (§6.3) — bóc theo size, theo vùng, hệ số quy đổi và item dẫn xuất cách nhiệt.
/// Bằng chứng then chốt: AC (c) vùng 6/4, AC (d) cách nhiệt 300x200 dài 10 m = 10.00 m²,
/// và "v6 mặc định cho kết quả y HỆT v5" trên cùng bộ đối tượng.
/// </summary>
public class TakeoffV6Tests
{
    private static TakeoffSection Bo(params TakeoffItem[] items) => new()
    {
        DrawingUnitAssumption = "mm",
        MarkColorAci = 92,
        XdataAppName = "XBOSS_BOCKL",
        Rounding = new TakeoffRounding { Length = 2, Area = 2, Count = 0 },
        Items = items,
    };

    private static TakeoffItem Ong(
        bool theoSize = false, double haoHut = 0, SizeFromTextPolicy? tuNhan = null) => new()
    {
        Id = "duct-supp", Group = "HVAC", Name = "Ống gió cấp", Spec = "Tôn tráng kẽm", Unit = "m",
        Measure = "length", LayerMatchAny = ["M-DUCT-SUPP"], Factor = 0.001, BoqCode = "",
        GroupBySize = theoSize, WastagePct = haoHut, SizeFromNearbyText = tuNhan,
    };

    private static TakeoffItem CachNhiet(string congThuc = "perimeter*length") => new()
    {
        Id = "duct-insu", Group = "HVAC", Name = "Cách nhiệt ống gió cấp", Spec = "Bảo ôn", Unit = "m2",
        Measure = "area", LayerMatchAny = [], Factor = 1, BoqCode = "",
        DerivedFrom = "duct-supp", Formula = congThuc,
    };

    private static MeasuredObject Tuyen(
        string handle, double daiMm, string? size = null, string vung = "",
        IReadOnlyList<NhanGan>? nhan = null, IReadOnlyList<PhanVungDoiTuong>? phanVung = null) => new()
    {
        Handle = handle, Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = daiMm,
        SizeXData = size, Vung = vung, NhanGan = nhan ?? [], PhanVung = phanVung ?? [],
    };

    // ===== Bóc theo size =====

    [Fact]
    public void GroupBySize_tach_moi_size_mot_dong_nguon_XData()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true)), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 20_000, "300x200"),
            Tuyen("B", 25_200, "300x200"),
            Tuyen("C", 12_000, "400x300"),
        ], insUnits: 4);

        Assert.Equal(2, kq.Lines.Count);
        Assert.Equal("300x200", kq.Lines[0].Size);
        Assert.Equal(45.2, kq.Lines[0].Quantity);
        Assert.Equal(2, kq.Lines[0].ObjectCount);
        Assert.Equal(NguonSize.XData, kq.Lines[0].NguonSize);
        Assert.Equal("400x300", kq.Lines[1].Size);
        Assert.Equal(12.0, kq.Lines[1].Quantity);
    }

    [Fact]
    public void Khong_bat_groupBySize_thi_van_gop_mot_dong_du_co_XData_size()
    {
        var may = new TakeoffCalculator(Bo(Ong()), "test");
        var kq = may.Compute([Tuyen("A", 20_000, "300x200"), Tuyen("B", 12_000, "400x300")], 4);

        var line = Assert.Single(kq.Lines);
        Assert.Equal("", line.Size);
        Assert.Equal(32.0, line.Quantity);
        Assert.Equal(NguonSize.KhongCo, line.NguonSize);
    }

    [Fact]
    public void Doc_size_tu_nhan_gan_nhat_trong_nguong_va_ghi_ro_nguon()
    {
        var chinhSach = new SizeFromTextPolicy
        {
            Enabled = true,
            MaxDistanceMm = 500,
            SizePatterns = [@"(\d{2,4}\s*[xX*]\s*\d{2,4})", @"(DN\s*\d{2,4})"],
        };
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true, tuNhan: chinhSach)), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 10_000, nhan: [new NhanGan("400x300", 900), new NhanGan("300x200 i=2%", 250)]),
        ], 4);

        var line = Assert.Single(kq.Lines);
        Assert.Equal("300x200", line.Size); // nhãn GẦN NHẤT trong ngưỡng, không phải nhãn xa hơn
        Assert.Equal(NguonSize.Nhan, line.NguonSize);
        Assert.Contains(kq.Warnings, w => w.Kind == TakeoffWarningKind.SizeDocTuNhan);
    }

    [Fact]
    public void XData_uu_tien_hon_nhan_gan_tuyen()
    {
        var chinhSach = new SizeFromTextPolicy
        {
            Enabled = true, MaxDistanceMm = 500, SizePatterns = [@"(\d{2,4}[xX]\d{2,4})"],
        };
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true, tuNhan: chinhSach)), "test");

        var kq = may.Compute([Tuyen("A", 10_000, "300x200", nhan: [new NhanGan("999x999", 10)])], 4);

        Assert.Equal("300x200", Assert.Single(kq.Lines).Size);
        Assert.Equal(NguonSize.XData, kq.Lines[0].NguonSize);
        Assert.DoesNotContain(kq.Warnings, w => w.Kind == TakeoffWarningKind.SizeDocTuNhan);
    }

    [Fact]
    public void Nhan_xa_qua_nguong_hoac_khong_khop_mau_thi_KHONG_doan_size()
    {
        var chinhSach = new SizeFromTextPolicy
        {
            Enabled = true, MaxDistanceMm = 300, SizePatterns = [@"(\d{2,4}[xX]\d{2,4})"],
        };
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true, tuNhan: chinhSach)), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 10_000, nhan: [new NhanGan("300x200", 900)]),            // xa quá ngưỡng
            Tuyen("B", 5_000, nhan: [new NhanGan("GHI CHÚ: thay ống", 50)]),    // không khớp mẫu
        ], 4);

        var line = Assert.Single(kq.Lines);
        Assert.Equal("", line.Size);
        Assert.Equal(NguonSize.KhongCo, line.NguonSize);
        Assert.Equal(15.0, line.Quantity); // vẫn tính đủ mét, chỉ là chưa biết size
        Assert.DoesNotContain(kq.Warnings, w => w.Kind == TakeoffWarningKind.SizeDocTuNhan);
    }

    [Fact]
    public void Size_viet_kieu_khac_nhau_van_gop_cung_mot_dong()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true)), "test");
        var kq = may.Compute(
        [
            Tuyen("A", 10_000, "300x200"),
            Tuyen("B", 10_000, " 300 X 200 "),
            Tuyen("C", 10_000, "300*200"),
        ], 4);

        var line = Assert.Single(kq.Lines);
        Assert.Equal("300x200", line.Size);
        Assert.Equal(30.0, line.Quantity);
    }

    // ===== Bóc theo vùng =====

    [Fact]
    public void AC_c_tuyen_cat_ranh_gioi_ra_hai_dong_vung_6m_va_4m()
    {
        var may = new TakeoffCalculator(Bo(Ong()), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 10_000, phanVung: [new PhanVungDoiTuong("Vùng A", 6000), new PhanVungDoiTuong("Vùng B", 4000)]),
        ], 4);

        Assert.Equal(2, kq.Lines.Count);
        Assert.Equal("Vùng A", kq.Lines[0].Vung);
        Assert.Equal(6.0, kq.Lines[0].Quantity);
        Assert.Equal("Vùng B", kq.Lines[1].Vung);
        Assert.Equal(4.0, kq.Lines[1].Quantity);
        // Cùng một đối tượng nên mỗi dòng đếm 1 và giữ handle để tô/gỡ đánh dấu.
        Assert.All(kq.Lines, l => Assert.Equal(1, l.ObjectCount));
        Assert.All(kq.Lines, l => Assert.Equal(["A"], l.Handles));
    }

    [Fact]
    public void Vung_va_size_tach_dong_dong_thoi_phan_ngoai_vung_xep_cuoi()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true)), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 10_000, "300x200", phanVung: [new PhanVungDoiTuong("Tầng 5", 6000), new PhanVungDoiTuong("", 4000)]),
            Tuyen("B", 5_000, "250x150", vung: "Tầng 5"),
        ], 4);

        Assert.Equal(
            [("Tầng 5", "250x150"), ("Tầng 5", "300x200"), ("", "300x200")],
            kq.Lines.Select(l => (l.Vung, l.Size)).ToArray());
        Assert.Equal(5.0, kq.Lines[0].Quantity);
        Assert.Equal(6.0, kq.Lines[1].Quantity);
        Assert.Equal(4.0, kq.Lines[2].Quantity);
    }

    // ===== Cách nhiệt (item dẫn xuất) =====

    [Fact]
    public void AC_d_cach_nhiet_ong_gio_300x200_dai_10m_ra_10m2()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true), CachNhiet()), "test");

        var kq = may.Compute([Tuyen("A", 10_000, "300x200")], insUnits: 4);

        Assert.Equal(2, kq.Lines.Count);
        var cn = kq.Lines[1];
        Assert.Equal("duct-insu", cn.Item.Id);
        Assert.True(cn.LaDanXuat);
        Assert.Equal("300x200", cn.Size);
        Assert.Equal(10.0, cn.Quantity); // 10 × (0.3+0.2) × 2 = 10.00 m²
        Assert.Equal("m2", cn.Item.Unit);
    }

    [Fact]
    public void Cach_nhiet_ong_tron_dung_cong_thuc_pi_dn()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true), CachNhiet("pi*dn*length")), "test");

        var kq = may.Compute([Tuyen("A", 10_000, "DN200")], 4);

        Assert.Equal(Math.Round(Math.PI * 0.2 * 10, 2), kq.Lines[1].Quantity);
    }

    [Fact]
    public void Cach_nhiet_bo_qua_doan_thieu_size_va_bao_so_met_chua_tinh()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true), CachNhiet()), "test");

        var kq = may.Compute([Tuyen("A", 10_000, "300x200"), Tuyen("B", 4_500)], 4);

        // Dòng cách nhiệt CHỈ tính phần có size; phần chưa biết size không bị đoán bừa.
        var cachNhiet = kq.Lines.Where(l => l.LaDanXuat).ToList();
        Assert.Single(cachNhiet);
        Assert.Equal(10.0, cachNhiet[0].Quantity);
        var canhBao = Assert.Single(kq.Warnings, w => w.Kind == TakeoffWarningKind.DanXuatThieuSize);
        Assert.Contains("4.50 m", canhBao.ThongDiep);
    }

    [Fact]
    public void Cach_nhiet_size_khong_hop_cong_thuc_thi_bo_qua_chu_khong_doan()
    {
        // Công thức chu vi ống chữ nhật gặp size DN (ống tròn) → không tính, báo mét chưa tính.
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true), CachNhiet()), "test");

        var kq = may.Compute([Tuyen("A", 7_000, "DN100")], 4);

        Assert.DoesNotContain(kq.Lines, l => l.LaDanXuat);
        Assert.Contains("7.00 m", Assert.Single(kq.Warnings, w => w.Kind == TakeoffWarningKind.DanXuatThieuSize).ThongDiep);
    }

    [Fact]
    public void Cach_nhiet_tach_theo_vung_giong_tuyen_nguon()
    {
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true), CachNhiet()), "test");

        var kq = may.Compute(
        [
            Tuyen("A", 10_000, "300x200", phanVung: [new PhanVungDoiTuong("Vùng A", 6000), new PhanVungDoiTuong("Vùng B", 4000)]),
        ], 4);

        var cn = kq.Lines.Where(l => l.LaDanXuat).ToList();
        Assert.Equal(2, cn.Count);
        Assert.Equal(("Vùng A", 6.0), (cn[0].Vung, cn[0].Quantity));
        Assert.Equal(("Vùng B", 4.0), (cn[1].Vung, cn[1].Quantity));
    }

    // ===== Hệ số quy đổi — CỘT RIÊNG, không trộn vào KL đo =====

    [Fact]
    public void WastagePct_khong_lam_thay_doi_KL_do_chi_hien_o_KL_quy_doi()
    {
        var may = new TakeoffCalculator(Bo(Ong(haoHut: 5)), "test");

        var line = Assert.Single(may.Compute([Tuyen("A", 10_000)], 4).Lines);

        Assert.Equal(10.0, line.Quantity);      // KL ĐO nguyên vẹn
        Assert.Equal(10.5, line.KlQuyDoi);      // KL QUY ĐỔI ở cột riêng
        Assert.Equal(1.05, line.HeSoQuyDoi);
        Assert.Equal("hao hụt 5%", line.MoTaQuyDoi);
    }

    [Fact]
    public void PerCountAdd_quy_doi_so_luong_dem_ra_met_tuong_duong()
    {
        var co = new TakeoffItem
        {
            Id = "duct-elbow", Group = "HVAC", Name = "Co ống gió", Spec = "", Unit = "Cái",
            Measure = "count", LayerMatchAny = [], BlockNameMatchAny = ["ELBOW"], Factor = 1,
            BoqCode = "", PerCountAdd = 0.5,
        };
        var may = new TakeoffCalculator(Bo(co), "test");
        MeasuredObject Block(string h) => new()
        {
            Handle = h, Layer = "0", Kind = MeasuredKind.Block, BlockName = "ELBOW-90",
        };

        var line = Assert.Single(may.Compute([Block("A"), Block("B"), Block("C"), Block("D")], 4).Lines);

        Assert.Equal(4, line.Quantity);
        Assert.Equal(2.0, line.KlQuyDoi);
        Assert.Equal("+0.5 m tương đương/Cái", line.MoTaQuyDoi);
    }

    [Fact]
    public void Khong_khai_he_so_thi_khong_co_KL_quy_doi()
    {
        var line = Assert.Single(new TakeoffCalculator(Bo(Ong()), "test").Compute([Tuyen("A", 10_000)], 4).Lines);
        Assert.Equal(0, line.HeSoQuyDoi);
        Assert.Equal(0, line.KlQuyDoi);
        Assert.Equal("", line.MoTaQuyDoi);
    }

    // ===== AC: v6 mặc định = v5 =====

    [Fact]
    public void AC_v6_mac_dinh_cho_ket_qua_y_het_v5_tren_cung_bo_doi_tuong()
    {
        var v5 = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v5.json")));
        // v6 nạp theo TÊN TỆP (không qua RepoPaths.LoadRulePack) vì bản đang phát hành đã là v7 —
        // ca này vẫn phải chứng minh đúng điều nó nói: v6 so với v5.
        // Ghim thẳng vào v6.json: bản đang phát hành đã sang version sau (v7 — M101 PR2) nhưng AC
        // này nói về v6, phải so đúng hai version đó.
        var v6 = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v6.json")));
        Assert.Equal("v6", v6.Version);

        // Cố ý đưa cả dữ liệu size/nhãn của M100 vào: v6 KHÔNG bật groupBySize cho item nào nên
        // toàn bộ dữ liệu đó phải bị bỏ qua y như v5.
        MeasuredObject[] doiTuong =
        [
            Tuyen("A", 12_345.6, "300x200", nhan: [new NhanGan("300x200", 100)]),
            Tuyen("B", 7_654.4, "400x300"),
            new() { Handle = "P1", Layer = "P-PIPE-DOMW", Kind = MeasuredKind.Curve, RawLength = 5_000, SizeXData = "DN50" },
            new() { Handle = "F1", Layer = "0", Kind = MeasuredKind.Block, BlockName = "FCU-12" },
        ];

        var kq5 = new TakeoffCalculator(v5.Takeoff, v5.Version).Compute(doiTuong, 4, xrefSkippedCount: 2);
        var kq6 = new TakeoffCalculator(v6.Takeoff, v6.Version).Compute(doiTuong, 4, xrefSkippedCount: 2);

        Assert.Equal(
            kq5.Lines.Select(l => (l.Item.Id, l.ObjectCount, l.Quantity, l.Size, l.Vung, l.KlQuyDoi)).ToArray(),
            kq6.Lines.Select(l => (l.Item.Id, l.ObjectCount, l.Quantity, l.Size, l.Vung, l.KlQuyDoi)).ToArray());
        Assert.Equal(
            kq5.Warnings.Select(w => w.ThongDiep).ToArray(),
            kq6.Warnings.Select(w => w.ThongDiep).ToArray());
        Assert.All(kq6.Lines, l =>
        {
            Assert.Equal("", l.Size);
            Assert.Equal(NguonSize.KhongCo, l.NguonSize);
            Assert.Equal(0, l.HeSoQuyDoi);
            Assert.False(l.LaDanXuat);
        });
    }

    // ===== Cầu nối Adapter ↔ Core (TakeoffZoning) =====

    [Fact]
    public void ChiaTuyen_khong_khai_vung_thi_tra_rong_de_bo_giu_nguyen_hanh_vi_M99()
    {
        var tuyen = new[] { new DoanTuyen(new Diem2(0, 0), new Diem2(10_000, 0)) };
        Assert.Empty(TakeoffZoning.ChiaTuyen(tuyen, []));
    }

    [Fact]
    public void VungTheoHandle_doi_tuong_cat_nhieu_vung_ghi_ro_la_cat_nhieu_vung()
    {
        var may = new TakeoffCalculator(Bo(Ong()), "test");
        var kq = may.Compute(
        [
            Tuyen("A", 10_000, phanVung: [new PhanVungDoiTuong("Vùng A", 6000), new PhanVungDoiTuong("Vùng B", 4000)]),
            Tuyen("B", 3_000, vung: "Vùng A"),
        ], 4);

        var vung = TakeoffZoning.VungTheoHandle(kq);
        Assert.Equal(TakeoffZoning.NhieuVung, vung["A"]); // XUAT không dựng lại được phần chia → nói thật
        Assert.Equal("Vùng A", vung["B"]);
    }

    [Fact]
    public void NguongNhanLonNhatMm_bang_0_khi_khong_item_nao_bat_doc_nhan()
    {
        Assert.Equal(0, TakeoffZoning.NguongNhanLonNhatMm(Bo(Ong(theoSize: true))));
        Assert.Equal(0, TakeoffZoning.NguongNhanLonNhatMm(RepoPaths.LoadRulePack().Takeoff));

        var co = new SizeFromTextPolicy { Enabled = true, MaxDistanceMm = 750, SizePatterns = ["(x)"] };
        Assert.Equal(750, TakeoffZoning.NguongNhanLonNhatMm(Bo(Ong(theoSize: true, tuNhan: co))));
    }

    [Fact]
    public void ComputeAssigned_cung_tach_theo_size_va_vung()
    {
        // XBOSS_BOCKL_XUAT dựng lại từ XData: size/vùng vẫn phải tách dòng như lúc bóc.
        var may = new TakeoffCalculator(Bo(Ong(theoSize: true)), "test");

        var kq = may.ComputeAssigned(
        [
            (Tuyen("A", 10_000, "300x200", vung: "Tầng 5"), "duct-supp"),
            (Tuyen("B", 5_000, "300x200", vung: "Tầng 6"), "duct-supp"),
        ], 4);

        Assert.Equal([("Tầng 5", 10.0), ("Tầng 6", 5.0)], kq.Lines.Select(l => (l.Vung, l.Quantity)).ToArray());
    }
}
