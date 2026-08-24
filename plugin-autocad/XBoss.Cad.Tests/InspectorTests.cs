using XBoss.Cad.Core.Inspection;
using Xunit;

namespace XBoss.Cad.Tests;

public class InspectorTests
{
    private static readonly Inspector Bo = new(RepoPaths.LoadRulePackV2());

    private static DrawingSnapshot Snapshot(
        IReadOnlyList<EntityInfo>? entities = null,
        IReadOnlyList<LayerInfo>? layers = null,
        int insUnits = 4) =>
        new() { Layers = layers ?? [], Entities = entities ?? [], InsUnits = insUnits };

    private static InspectionFinding? Tim(InspectionReport bc, string id) =>
        bc.Findings.FirstOrDefault(f => f.Id == id);

    [Fact]
    public void Phat_hien_layer_sai_chuan_kem_ten_dich()
    {
        var bc = Bo.Run(Snapshot(layers:
        [
            new LayerInfo { Name = "01_M_ONG_GIO_CAP_CHINH" },
            new LayerInfo { Name = "M-DUCT-SUPP" },
            new LayerInfo { Name = "0" },
        ]));
        var f = Tim(bc, "layer-sai");
        Assert.NotNull(f);
        Assert.Equal(["01_M_ONG_GIO_CAP_CHINH → M-DUCT-SUPP"], f.ChiTiet);
    }

    [Fact]
    public void Phat_hien_lech_z_theo_dung_sai_quy_doi_don_vi()
    {
        var lech = new EntityInfo { Handle = "Z1", Layer = "0", Kind = EntityKind.Curve, MaxAbsZ = 5 };
        var chuan = new EntityInfo { Handle = "Z0", Layer = "0", Kind = EntityKind.Curve, MaxAbsZ = 0 };
        var bc = Bo.Run(Snapshot([lech, chuan]));
        Assert.Equal(["Z1"], Tim(bc, "lech-z")!.Handles);
    }

    [Fact]
    public void AC9_polyline_gan_kin_bao_tren_moi_layer()
    {
        // 2 đầu cách 3mm ≤ nearGapToleranceMm=5 → "gần kín" dù layer không thuộc diện đo diện tích.
        var ganKin = new EntityInfo
        {
            Handle = "P1", Layer = "ZZZ_BAT_KY", Kind = EntityKind.Curve,
            IsPolyline = true, IsClosed = false, EndGapDistance = 3, RawLength = 900,
        };
        // Hở toang (gap 500mm) trên layer thường → không báo (v2 chưa có layer đo diện tích).
        var hoToang = new EntityInfo
        {
            Handle = "P2", Layer = "ZZZ_BAT_KY", Kind = EntityKind.Curve,
            IsPolyline = true, IsClosed = false, EndGapDistance = 500, RawLength = 900,
        };
        var bc = Bo.Run(Snapshot([ganKin, hoToang]));
        Assert.Equal(["P1"], Tim(bc, "polyline-gan-kin")!.Handles);
        Assert.Null(Tim(bc, "polyline-ho"));
    }

    [Fact]
    public void Phat_hien_font_cu_theo_bang_ma_cua_text_style()
    {
        var tcvn3 = new EntityInfo { Handle = "T1", Layer = "0", Kind = EntityKind.Text, TextContent = "èng giã", TextStyleFontName = ".VnTime" };
        var maHang = new EntityInfo { Handle = "T2", Layer = "0", Kind = EntityKind.Text, TextContent = "Khu A1", TextStyleFontName = "Arial" };
        var vni = new EntityInfo { Handle = "T3", Layer = "0", Kind = EntityKind.Text, TextContent = "Khu A1", TextStyleFontName = "VNI-Times" };
        var bc = Bo.Run(Snapshot([tcvn3, maHang, vni]));
        // "Khu A1" font Arial KHÔNG được coi là font cũ (bảo vệ mã hàng); font VNI thật thì có.
        Assert.Equal(["T1", "T3"], Tim(bc, "font-cu")!.Handles);
    }

    [Fact]
    public void Phat_hien_lineweight_lech_bang_ctb()
    {
        var bc = Bo.Run(Snapshot(layers:
        [
            new LayerInfo { Name = "M-DUCT-SUPP", Aci = 1, LineweightMm = 0.25 }, // quy định ACI 1 = 0.5mm
            new LayerInfo { Name = "M-DUCT-RETN", Aci = 1, LineweightMm = 0.5 },  // đúng
            new LayerInfo { Name = "G-ANNO-TEXT", Aci = 30, LineweightMm = 0.13 }, // ACI 30 không có quy định — bỏ qua
        ]));
        var f = Tim(bc, "lineweight-lech");
        Assert.NotNull(f);
        var chiTiet = Assert.Single(f.ChiTiet);
        Assert.StartsWith("M-DUCT-SUPP", chiTiet);
    }

    [Fact]
    public void Phat_hien_dim_override_va_rac_hinh_hoc()
    {
        var dim = new EntityInfo { Handle = "D1", Layer = "0", Kind = EntityKind.Dimension, HasDimOverride = true };
        var zero = new EntityInfo { Handle = "L0", Layer = "0", Kind = EntityKind.Curve, RawLength = 0.5 }; // ≤ 1mm
        var a = new EntityInfo { Handle = "L1", Layer = "0", Kind = EntityKind.Curve, RawLength = 100, Start = (0, 0), End = (100, 0) };
        var b = new EntityInfo { Handle = "L2", Layer = "0", Kind = EntityKind.Curve, RawLength = 100, Start = (100.2, 0.3), End = (-0.4, 0.1) }; // trùng chồng (ngược chiều, làm tròn mm)
        var bc = Bo.Run(Snapshot([dim, zero, a, b]));
        Assert.Equal(["D1"], Tim(bc, "dim-override")!.Handles);
        var rac = Tim(bc, "rac-hinh-hoc");
        Assert.NotNull(rac);
        Assert.Contains("L0", rac.Handles);
        Assert.Contains("L2", rac.Handles);
        Assert.DoesNotContain("L1", rac.Handles);
    }

    [Fact]
    public void AC4_khong_loi_thi_khong_co_finding_va_co_canh_bao_don_vi_khi_khac_mm()
    {
        var bc = Bo.Run(Snapshot(insUnits: 6));
        Assert.Empty(bc.Findings);
        Assert.Single(bc.CanhBao, c => c.Contains("INSUNITS=6"));
        Assert.Empty(Bo.Run(Snapshot()).CanhBao);
    }
}
