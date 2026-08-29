using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M109 §5 — khối <c>drawTools.crossingPolicy</c> của rule pack v13: bản phát hành khai đủ nhưng
/// TẮT (AC8), và validator chặn đủ 3 lớp lỗi khai báo ngay lúc nạp (đi qua đường
/// <see cref="DrawToolsConfig.Load"/> thật, không chỉ gọi thẳng hàm kiểm).
/// </summary>
public class RulePackV13Tests
{
    private static string JsonHienHanh() => File.ReadAllText(RepoPaths.RulePackPath);

    private static RulePackException LoiKhiChinh(Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(JsonHienHanh())!.AsObject();
        chinh(goc["drawTools"]!["crossingPolicy"]!.AsObject());
        return Assert.Throws<RulePackException>(() => DrawToolsConfig.Load(goc.ToJsonString()));
    }

    [Fact]
    public void Ban_phat_hanh_khai_du_nhung_tat_san()
    {
        var cp = DrawToolsConfig.Load(JsonHienHanh()).DrawTools.CrossingPolicy;

        Assert.NotNull(cp);
        Assert.False(cp!.Enabled); // AC8 — lệnh dừng kèm thông báo, không vẽ gì
        Assert.Equal(new[] { "HVAC", "PIPING", "FIREFIGHTING", "ELECTRICAL", "ELV" }, cp.Priority);
        Assert.Equal("wipeout", cp.GapMode);
        Assert.Equal(50, cp.ClearanceMm);
        Assert.Equal(150, cp.JogRadiusMm);
        Assert.Equal("XING", cp.LayerSuffix);
        Assert.Equal(15, cp.MinAngleDeg);
    }

    [Fact]
    public void Priority_chi_chua_id_he_co_that_trong_drawTools()
    {
        var pack = DrawToolsConfig.Load(JsonHienHanh());
        var heThat = pack.DrawTools.Systems.Select(s => s.Id).ToHashSet(StringComparer.Ordinal);
        Assert.All(pack.DrawTools.CrossingPolicy!.Priority, id => Assert.Contains(id, heThat));
    }

    [Fact]
    public void Rule_pack_v9_cu_van_nap_duoc_va_khong_co_crossingPolicy()
    {
        // Plugin cũ/rule pack cũ không biết khóa mới ⇒ nạp bình thường, lệnh ngắt nét chỉ đơn giản
        // không chạy được (không đoán mặc định ngầm — cùng luật với jointRules của M105).
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));
        Assert.Equal("v9", pack.RulePack.Version);
        Assert.Null(pack.DrawTools.CrossingPolicy);
    }

    // ===== 3 lớp lỗi khai báo phải BỊ BẮT (M109 §5) =====

    [Fact]
    public void Bat_loi_priority_chua_id_he_la()
    {
        var loi = LoiKhiChinh(cp => cp["priority"] = new JsonArray("duct", "PIPING"));
        Assert.Contains("duct", loi.Message);
        Assert.Contains("systems[].id", loi.Message);
    }

    [Fact]
    public void Bat_loi_clearance_va_jogRadius_khong_duong()
    {
        Assert.Contains("clearanceMm", LoiKhiChinh(cp => cp["clearanceMm"] = 0).Message);
        Assert.Contains("jogRadiusMm", LoiKhiChinh(cp => cp["jogRadiusMm"] = -1).Message);
    }

    [Fact]
    public void Bat_loi_minAngleDeg_ngoai_khoang_0_90()
    {
        // DuGocDeNgat() dùng thẳng ngưỡng này: số âm/NaN làm MỌI góc giao đều bị coi là đủ lớn.
        Assert.Contains("minAngleDeg", LoiKhiChinh(cp => cp["minAngleDeg"] = -5).Message);
        Assert.Contains("minAngleDeg", LoiKhiChinh(cp => cp["minAngleDeg"] = 0).Message);
        Assert.Contains("minAngleDeg", LoiKhiChinh(cp => cp["minAngleDeg"] = 91).Message);
    }

    [Fact]
    public void Bat_loi_gapMode_la()
    {
        var loi = LoiKhiChinh(cp => cp["gapMode"] = "xoa-net");
        Assert.Contains("gapMode", loi.Message);
        Assert.Contains("wipeout", loi.Message);

        // Hai giá trị hợp lệ thì nạp được bình thường.
        foreach (var hopLe in new[] { "wipeout", "jog" })
        {
            var goc = JsonNode.Parse(JsonHienHanh())!.AsObject();
            goc["drawTools"]!["crossingPolicy"]!["gapMode"] = hopLe;
            Assert.NotNull(DrawToolsConfig.Load(goc.ToJsonString()));
        }
    }

    [Fact]
    public void Bat_loi_layerSuffix_rong_khi_bat()
    {
        var loi = LoiKhiChinh(cp =>
        {
            cp["enabled"] = true;
            cp["layerSuffix"] = "";
        });
        Assert.Contains("layerSuffix", loi.Message);

        // Còn TẮT thì layerSuffix rỗng chưa gây hại — không chặn.
        var goc = JsonNode.Parse(JsonHienHanh())!.AsObject();
        goc["drawTools"]!["crossingPolicy"]!["layerSuffix"] = "";
        Assert.NotNull(DrawToolsConfig.Load(goc.ToJsonString()));
    }
}
