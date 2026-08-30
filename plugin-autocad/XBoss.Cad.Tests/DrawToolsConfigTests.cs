using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;
using System.Text.Json.Nodes;
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
        Assert.Equal(RepoPaths.VersionHienHanh, pack.RulePack.Version);
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
        var goc = JsonNode.Parse(JsonHienHanh())!.AsObject();
        var systems = goc["drawTools"]!["systems"]!.AsArray();
        var hvac = systems.Select(x => x!.AsObject()).Single(x => x["id"]!.GetValue<string>() == "HVAC");
        hvac["id"] = "HVAC-CU";
        var json = goc.ToJsonString();
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
        Assert.Equal(RepoPaths.VersionHienHanh, pack.RulePack.Version);
    }

    // ===== v7 (M100 PR5): phụ kiện nặng khai trong rule pack thay cho hỏi kỹ sư =====

    [Fact]
    public void V7_khai_phu_kien_nang_va_doc_duoc()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        Assert.True(pack.DrawTools.CoKhaiPhuKienNang);
        Assert.True(pack.DrawTools.LaPhuKienNang("valve-gate"));
        Assert.True(pack.DrawTools.LaPhuKienNang("damper-vcd"));
        // Co/tê là phụ kiện nhẹ — không được đòi giá đỡ riêng.
        Assert.False(pack.DrawTools.LaPhuKienNang("elbow-duct"));
        Assert.False(pack.DrawTools.LaPhuKienNang(null));
    }

    [Fact]
    public void Rule_pack_cu_khong_khai_phu_kien_nang_van_nap_duoc()
    {
        // v6 (và v4/v5) không có heavyFittingIds ⇒ danh sách rỗng, lệnh giữ đường hỏi kỹ sư.
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v6.json")));
        Assert.Equal("v6", pack.RulePack.Version);
        Assert.False(pack.DrawTools.CoKhaiPhuKienNang);
        Assert.False(pack.DrawTools.LaPhuKienNang("valve-gate"));
    }

    [Fact]
    public void He_co_tuyen_bat_buoc_do_doc_phai_khai_block_mui_ten_huong_doc()
    {
        // FR9g: XBOSS_VE_NHAN chèn block slope-arrow kèm nhãn "i=…%" — hệ có tuyến slopeRequired
        // mà không khai id đó trong fittings thì mũi tên KHÔNG BAO GIỜ chèn được (trôi tên lặng lẽ).
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        foreach (var he in pack.DrawTools.Systems.Where(s => s.Lines.Any(l => l.SlopeRequired)))
            Assert.Contains(BlockManifest.IdMuiTenDoDoc, he.Fittings);
    }

    [Fact]
    public void Bat_loi_phu_kien_nang_troi_khoi_fittings()
    {
        // Sửa qua JsonNode, KHÔNG Replace chuỗi thô (prettier format lại tệp là chuỗi tìm gãy im
        // lặng — v9 đã làm gãy đúng như vậy, test tưởng xanh mà không đổi được gì).
        var goc = JsonNode.Parse(JsonHienHanh())!.AsObject();
        goc["drawTools"]!["heavyFittingIds"] = new JsonArray("van-ma");
        var json = goc.ToJsonString();
        var loi = Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(json));
        Assert.Contains("van-ma", loi.Message);
        Assert.Contains("fittings", loi.Message);
    }

    [Fact]
    public void V7_khai_item_dem_giado_va_locho_khop_ten_block_thu_vien()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        var takeoff = pack.RulePack.Takeoff;

        var giaDo = takeoff.Items.Single(i => i.Id == "support-hanger");
        var loCho = takeoff.Items.Single(i => i.Id == "sleeve-opening");
        Assert.Equal(TakeoffMeasure.Count, giaDo.MeasureKind);
        Assert.Equal(TakeoffMeasure.Count, loCho.MeasureKind);
        // layerMatchAny PHẢI rỗng: giá đỡ nằm trên chính layer tuyến, khai layer sẽ đếm nhầm cả tuyến.
        Assert.Empty(giaDo.LayerMatchAny);
        Assert.Empty(loCho.LayerMatchAny);

        // Khớp đúng tên block của manifest mẫu (M100 AC12/§6.8) — đây là chốt chặn chống trôi tên.
        Assert.True(TokenMatcher.MatchesAny("XB-SUP-DUCT", giaDo.BlockNameMatchAny!));
        Assert.True(TokenMatcher.MatchesAny("XB-SLEEVE-W", loCho.BlockNameMatchAny!));
        // …và KHÔNG khớp oan tên phụ kiện khác (token "SUP" cụt sẽ khớp "XB-GRL-SUP").
        Assert.False(TokenMatcher.MatchesAny("XB-GRL-SUP", giaDo.BlockNameMatchAny!));
        Assert.False(TokenMatcher.MatchesAny("XB-DUCT-ELBOW", giaDo.BlockNameMatchAny!));
        Assert.False(TokenMatcher.MatchesAny("FCU", loCho.BlockNameMatchAny!));

        // Đặt CUỐI danh sách ⇒ first-match không giành mất đối tượng của item cũ.
        Assert.Equal("sleeve-opening", takeoff.Items[^1].Id);
        Assert.Equal("support-hanger", takeoff.Items[^2].Id);
    }
}
