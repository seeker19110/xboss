using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 §6 — validator khối <c>drawTools.routingPolicy</c> (rule pack v15), tầng C# của
/// "validator 2 tầng" (tầng TS: <c>kiemRoutingPolicy</c> trong <c>lib/ky-thuat/cad/rule-pack.ts</c>).
/// Cùng nguyên tắc các khối chính sách v5–v14: bản phát hành KHÔNG bật khối mới, nhưng khai rồi thì
/// phải khai ĐÚNG — sai là chặn lúc nạp, không để kỹ sư phát hiện khi đứng trước AutoCAD.
/// </summary>
public class RulePackV15RoutingTests
{
    private static DrawToolsPack Nap(Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc["drawTools"]!["routingPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(chinh));

    // ===== Bản phát hành =====

    [Fact]
    public void Ban_phat_hanh_khai_du_tham_so_di_tuyen_va_van_TAT()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        var rp = pack.DrawTools.RoutingPolicy;

        Assert.NotNull(rp);
        Assert.False(rp!.Enabled); // AC14 — 2 lệnh đi tuyến dừng kèm thông báo cách bật
        Assert.True(rp.SnapRadiusMm > 0);
        Assert.False(string.IsNullOrWhiteSpace(rp.CorridorLayer));
        Assert.True(rp.Cost.ReuseFactor is > 0 and < 1, "γ < 1 mới có gom trục");
        Assert.True(rp.Cost.ElbowMm >= 0 && rp.Cost.CongestionMm >= 0);
        Assert.True(rp.LaneGapMm.ElecToHot >= rp.LaneGapMm.Default);

        // Id hệ trong tiers/systemOrder phải là id CÓ THẬT của drawTools.systems.
        var heThat = pack.DrawTools.Systems.Select(s => s.Id).ToHashSet(StringComparer.Ordinal);
        foreach (var tier in rp.Tiers)
        {
            Assert.All(tier.Systems, id => Assert.Contains(id, heThat));
        }
        Assert.All(rp.SystemOrder, id => Assert.Contains(id, heThat));

        // Mỗi hệ chỉ ở đúng một tier, và mọi hệ vẽ được đều có tier để cấp tầng.
        Assert.All(heThat, id => Assert.NotNull(rp.TierCuaHe(id)));
    }

    [Fact]
    public void Rule_pack_cu_khong_co_routingPolicy_van_nap_duoc()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v14.json")));

        Assert.Null(pack.DrawTools.RoutingPolicy); // → 2 lệnh đi tuyến từ chối chạy, không đoán ngầm
    }

    // ===== 4 lỗi §6 =====

    [Fact]
    public void Bat_snapRadiusMm_khong_duong()
    {
        Assert.Contains("snapRadiusMm", Loi(rp => rp["snapRadiusMm"] = 0).Message);
        Assert.Contains("snapRadiusMm", Loi(rp => rp["snapRadiusMm"] = -1).Message);
    }

    [Fact]
    public void Bat_reuseFactor_ngoai_khoang_0_1()
    {
        Assert.Contains("reuseFactor", Loi(rp => rp["cost"]!["reuseFactor"] = 0).Message);
        Assert.Contains("reuseFactor", Loi(rp => rp["cost"]!["reuseFactor"] = 1.5).Message);
        // γ = 1 là hợp lệ: tắt gom trục có chủ đích (AC2).
        Assert.NotNull(Nap(rp => rp["cost"]!["reuseFactor"] = 1));
    }

    [Fact]
    public void Bat_id_he_la_trong_tiers_va_systemOrder()
    {
        var loiTier = Loi(rp => rp["tiers"]![0]!["systems"] = new JsonArray("PLUMB"));
        Assert.Contains("PLUMB", loiTier.Message);

        var loiThuTu = Loi(rp => rp["systemOrder"] = new JsonArray("HVAC", "PLUMB_DRAIN"));
        Assert.Contains("PLUMB_DRAIN", loiThuTu.Message);
    }

    [Fact]
    public void Bat_mot_he_nam_o_2_tier()
    {
        // HVAC vốn ở tier1 — nhét thêm vào tier2 thì cấp tầng phụ thuộc thứ tự duyệt, 2 tầng trôi nhau.
        var loi = Loi(rp => rp["tiers"]![1]!["systems"] = new JsonArray("ELECTRICAL", "ELV", "HVAC"));

        Assert.Contains("HVAC", loi.Message);
        Assert.Contains("2 tier", loi.Message);
    }

    // ===== Ràng buộc phụ =====

    [Fact]
    public void Bat_he_so_chi_phi_am_va_khe_ho_lan_khong_duong()
    {
        Assert.Contains("elbowMm", Loi(rp => rp["cost"]!["elbowMm"] = -1).Message);
        Assert.Contains("congestionMm", Loi(rp => rp["cost"]!["congestionMm"] = -0.5).Message);
        Assert.Contains("laneGapMm.default", Loi(rp => rp["laneGapMm"]!["default"] = 0).Message);
        Assert.Contains("laneGapMm.elecToHot", Loi(rp => rp["laneGapMm"]!["elecToHot"] = -1).Message);
    }

    [Fact]
    public void Bat_corridorLayer_trong_khi_khoi_dang_bat()
    {
        Assert.Contains("corridorLayer", Loi(rp =>
        {
            rp["enabled"] = true;
            rp["corridorLayer"] = "   ";
        }).Message);

        // Còn tắt thì chưa gây hại — chặn ở đây chỉ làm rule pack cũ không nạp được.
        Assert.NotNull(Nap(rp => rp["corridorLayer"] = ""));
    }
}
