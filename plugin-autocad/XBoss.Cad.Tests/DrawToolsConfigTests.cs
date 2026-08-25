using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR1 — nạp rule pack ĐANG PHÁT HÀNH (v5) THẬT trong repo (cùng nguồn với test TS, chống trôi 2 tầng)
/// và chứng minh validator bắt được các lớp lỗi khai báo (M100 §15, §18 rủi ro số 1).
/// </summary>
public class DrawToolsConfigTests
{
    private static string JsonHienHanh() => File.ReadAllText(RepoPaths.RulePackPath);

    [Fact]
    public void Nap_duoc_drawTools_cua_rule_pack_dang_phat_hanh()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        Assert.Equal("v6", pack.RulePack.Version);
        Assert.Equal(5, pack.DrawTools.Systems.Count); // HVAC/PIPING/FIREFIGHTING/ELECTRICAL/ELV
        Assert.Equal("G-ANNO-TEXT", pack.DrawTools.LabelStyle.Layer);
        Assert.Equal("titleblock-a1", pack.SheetSetup.TitleblockId);
        Assert.Contains("A1", pack.SheetSetup.PaperSizes);
        Assert.Contains(50d, pack.SheetSetup.Scales);
        Assert.NotEmpty(pack.SheetSetup.Slopes);
    }

    [Fact]
    public void Khoa_phuc_vu_GIADO_LOCHO_slope_khai_du_va_doc_duoc()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var ductSupp = hvac.Lines.Single(l => l.ItemId == "duct-supp");
        Assert.Equal("double", ductSupp.EdgeStyle);
        Assert.Equal(2400, ductSupp.SupportSpacingMmCho("300x200")); // số chung cho mọi size
        Assert.Equal(50, ductSupp.SleeveClearanceMm);

        var piping = pack.DrawTools.Systems.Single(s => s.Id == "PIPING");
        var chw = piping.Lines.Single(l => l.ItemId == "chw-pipe");
        Assert.Equal("none", chw.EdgeStyle);
        Assert.Equal(2000, chw.SupportSpacingMmCho("DN50")); // bảng theo từng size
        Assert.Null(chw.SupportSpacingMmCho("DN999"));

        // Ống thoát bắt buộc hỏi độ dốc (M100 §6.9), các tuyến khác thì không.
        Assert.True(piping.Lines.Single(l => l.ItemId == "pipe-sanr").SlopeRequired);
        Assert.False(chw.SlopeRequired);
    }

    [Fact]
    public void Cross_check_takeoff_khong_canh_bao_tren_rule_pack_that()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        Assert.Empty(TakeoffCrossCheck.Kiem(pack.DrawTools, pack.RulePack.Takeoff));
    }

    [Fact]
    public void Cross_check_bat_thiet_bi_khong_dem_duoc()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        // "duct-supp" là item measure=length → không thể đếm theo block; "ma-quy" không tồn tại.
        var hong = new DrawToolsSection
        {
            Systems = [new DrawSystem { Id = "HVAC", Equipment = ["duct-supp", "ma-quy"] }],
        };
        var canhBao = TakeoffCrossCheck.Kiem(hong, pack.RulePack.Takeoff);
        Assert.Equal(2, canhBao.Count);
        Assert.Contains(canhBao, c => c.Contains("duct-supp") && c.Contains("count"));
        Assert.Contains(canhBao, c => c.Contains("ma-quy"));
    }

    // ===== 3 lớp lỗi khai báo phải BỊ BẮT (đỏ → xanh) =====

    [Fact]
    public void Bat_loi_layer_khong_thuoc_nhom_cua_he()
    {
        // M-CHW-PIPE là target của nhóm PIPING, không phải HVAC → khai nhầm hệ phải bị chặn.
        var json = JsonHienHanh().Replace("\"layer\": \"M-DUCT-SUPP\"", "\"layer\": \"M-CHW-PIPE\"");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("M-CHW-PIPE", loi.Message);
        Assert.Contains("HVAC", loi.Message);
    }

    [Fact]
    public void Bat_loi_layer_net_bien_dung_takeoff()
    {
        // Hậu tố "-EDGE" (phác thảo M100 §11) làm "M-DUCT-SUPP-EDGE" VẪN khớp token "M-DUCT-SUPP"
        // → nét biên bị bóc trùng khối lượng (vỡ FR4/AC3). Validator phải chặn.
        var json = JsonHienHanh().Replace("\"edgeLayerSuffix\": \"EDGE\"", "\"edgeLayerSuffix\": \"-EDGE\"");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("M-DUCT-SUPP-EDGE", loi.Message);
        Assert.Contains("duct-supp", loi.Message);
    }

    [Fact]
    public void Bat_loi_itemId_ma()
    {
        var json = JsonHienHanh().Replace("\"itemId\": \"duct-retn\"", "\"itemId\": \"duct-ma\"");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("duct-ma", loi.Message);
        Assert.Contains("takeoff.items", loi.Message);
    }

    [Fact]
    public void Bat_loi_he_khong_co_trong_layerMap()
    {
        var json = JsonHienHanh().Replace("\"id\": \"HVAC\",\n        \"name\": \"Điều hòa thông gió\"",
            "\"id\": \"HVAC-CU\",\n        \"name\": \"Điều hòa thông gió\"");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("HVAC-CU", loi.Message);
        Assert.Contains("layerMap", loi.Message);
    }

    [Fact]
    public void Bat_loi_titleblockId_khai_nua_voi()
    {
        var json = JsonHienHanh().Replace("\"titleblockId\": \"titleblock-a1\"", "\"titleblockId\": \"  \"");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("titleblockId", loi.Message);
    }

    [Fact]
    public void Tu_choi_rule_pack_v3_vi_chua_co_drawTools()
    {
        var loi = Assert.Throws<RulePackException>(
            () => DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v3.json"))));
        Assert.Contains("drawTools", loi.Message);
        Assert.Contains("v4", loi.Message);
    }

    [Fact]
    public void Bat_loi_supportSpacingMm_map_thieu_size()
    {
        // chw-pipe khai supportSpacingMm dạng map cho DN20..DN200, nhưng xoá entry DN50
        // → sizes[] chứa DN50 nhưng map thiếu entry → validator phải ném RulePackException
        var json = JsonHienHanh().Replace("\"DN50\": 2000,", "");
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("supportSpacingMm", loi.Message);
        Assert.Contains("DN50", loi.Message);
        Assert.Contains("chw-pipe", loi.Message);
    }

    [Fact]
    public void Pass_khi_khong_khai_supportSpacingMm_va_sleeveClearanceMm()
    {
        // Line không khai supportSpacingMm cũng không khai sleeveClearanceMm → hợp lệ
        // (validator chỉ kiểm nếu khai)
        var json = JsonHienHanh()
            .Replace(",\n            \"supportSpacingMm\": 2400,\n            \"sleeveClearanceMm\": 50", "");
        var pack = DrawToolsConfig.Load(json);
        Assert.NotNull(pack);
        Assert.Equal("v6", pack.RulePack.Version);
    }
}
