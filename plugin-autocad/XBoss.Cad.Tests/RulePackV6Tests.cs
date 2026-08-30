using System.Text.Json.Nodes;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.3 — validator các khóa bóc tách nâng cao của rule pack v6. Nguyên tắc: v6 phát hành
/// KHÔNG bật khóa nào (bóc y hệt v5); khai bật thì phải khai đủ và đúng, thiếu/vô nghĩa là chặn
/// ngay lúc nạp — bóc sai khối lượng nguy hiểm hơn nhiều so với việc không nạp được rule pack.
/// Mọi ca đều đi qua tệp rule pack THẬT trong repo (không dựng pack giả trong bộ nhớ).
/// </summary>
public class RulePackV6Tests
{
    /// <summary>Nạp v6 sau khi chỉnh các item bằng JsonNode — vẫn qua validator thật.</summary>
    private static CadRulePack Nap(Action<JsonArray> chinhItems)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinhItems(goc["takeoff"]!["items"]!.AsArray());
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonArray> chinhItems) =>
        Assert.Throws<RulePackException>(() => Nap(chinhItems));

    private static JsonObject Item(JsonArray items, string id) =>
        items.First(i => (string?)i!["id"] == id)!.AsObject();

    private static JsonObject CachNhiet(string nguon = "duct-supp", string congThuc = "perimeter*length") => new()
    {
        ["id"] = "duct-insu",
        ["group"] = "HVAC",
        ["name"] = "Cách nhiệt ống gió cấp",
        ["spec"] = "Bảo ôn",
        ["unit"] = "m2",
        ["measure"] = "area",
        ["layerMatchAny"] = new JsonArray(),
        ["factor"] = 1,
        ["boqCode"] = "",
        ["derivedFrom"] = nguon,
        ["formula"] = congThuc,
    };

    // ===== v6 phát hành: mọi khóa mới vắng mặt =====

    [Fact]
    public void V6_phat_hanh_khong_item_nao_bat_khoa_moi()
    {
        var t = RepoPaths.LoadRulePack().Takeoff;
        Assert.All(t.Items, i =>
        {
            Assert.False(i.GroupBySize);
            Assert.Null(i.SizeFromNearbyText);
            Assert.Equal(0, i.WastagePct);
            Assert.Equal(0, i.PerCountAdd);
            Assert.False(i.LaDanXuat);
        });
    }

    [Fact]
    public void Rule_pack_v5_van_nap_duoc_sau_khi_phat_hanh_v6()
    {
        var pack = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v5.json")));
        Assert.Equal("v5", pack.Version);
        Assert.All(pack.Takeoff.Items, i => Assert.False(i.GroupBySize || i.LaDanXuat));
    }

    // ===== Khai đúng thì nạp được =====

    [Fact]
    public void Khai_du_bo_khoa_moi_thi_nap_duoc_va_doc_dung_gia_tri()
    {
        var pack = Nap(items =>
        {
            var ong = Item(items, "duct-supp");
            ong["groupBySize"] = true;
            ong["wastagePct"] = 5;
            ong["sizeFromNearbyText"] = new JsonObject
            {
                ["enabled"] = true,
                ["maxDistanceMm"] = 500,
                ["sizePatterns"] = new JsonArray(@"(\d{2,4}[xX]\d{2,4})", @"(DN\s*\d{2,4})"),
            };
            Item(items, "fcu-unit")["perCountAdd"] = 0.5;
            items.Add(CachNhiet());
        });

        var ong = pack.Takeoff.Items.First(i => i.Id == "duct-supp");
        Assert.True(ong.GroupBySize);
        Assert.Equal(5, ong.WastagePct);
        Assert.Equal(500, ong.SizeFromNearbyText!.MaxDistanceMm);
        Assert.Equal(2, ong.SizeFromNearbyText.SizePatterns.Count);
        Assert.Equal(0.5, pack.Takeoff.Items.First(i => i.Id == "fcu-unit").PerCountAdd);
        var cn = pack.Takeoff.Items.First(i => i.Id == "duct-insu");
        Assert.Equal("duct-supp", cn.DerivedFrom);
        Assert.Equal(CongThucDanXuat.ChuViNhanDai, cn.FormulaKind);
    }

    // ===== Khai sai thì chặn ngay =====

    [Fact]
    public void Tu_choi_derivedFrom_tro_item_khong_ton_tai()
    {
        var loi = Loi(items => items.Add(CachNhiet(nguon: "item-khong-co")));
        Assert.Contains("item-khong-co", loi.Message);
    }

    [Fact]
    public void Tu_choi_item_nguon_chua_bat_groupBySize()
    {
        var loi = Loi(items => items.Add(CachNhiet()));
        Assert.Contains("groupBySize", loi.Message);
    }

    [Fact]
    public void Tu_choi_formula_la()
    {
        var loi = Loi(items =>
        {
            Item(items, "duct-supp")["groupBySize"] = true;
            items.Add(CachNhiet(congThuc: "dai*rong*cao"));
        });
        Assert.Contains("formula", loi.Message);
    }

    [Fact]
    public void Tu_choi_derivedFrom_tro_item_dem_hoac_chuoi_dan_xuat()
    {
        var loiDem = Loi(items => items.Add(CachNhiet(nguon: "fcu-unit")));
        Assert.Contains("measure=length", loiDem.Message);

        var loiChuoi = Loi(items =>
        {
            Item(items, "duct-supp")["groupBySize"] = true;
            items.Add(CachNhiet());
            var tang2 = CachNhiet(nguon: "duct-insu");
            tang2["id"] = "duct-insu-2";
            items.Add(tang2);
        });
        Assert.Contains("chuỗi dẫn xuất", loiChuoi.Message);
    }

    [Fact]
    public void Tu_choi_he_so_quy_doi_sai_cho()
    {
        Assert.Contains("perCountAdd", Loi(items => Item(items, "duct-supp")["perCountAdd"] = 0.5).Message);
        Assert.Contains("wastagePct", Loi(items => Item(items, "fcu-unit")["wastagePct"] = 5).Message);
        Assert.Contains("không được âm", Loi(items => Item(items, "duct-supp")["wastagePct"] = -1).Message);
        Assert.Contains("groupBySize", Loi(items => Item(items, "fcu-unit")["groupBySize"] = true).Message);
    }

    [Fact]
    public void Tu_choi_sizeFromNearbyText_khai_nua_voi_hoac_regex_sai()
    {
        var thieuGroupBySize = Loi(items => Item(items, "duct-supp")["sizeFromNearbyText"] = new JsonObject
        {
            ["enabled"] = true, ["maxDistanceMm"] = 500, ["sizePatterns"] = new JsonArray("(x)"),
        });
        Assert.Contains("groupBySize tắt", thieuGroupBySize.Message);

        var thieuNguong = Loi(items =>
        {
            var ong = Item(items, "duct-supp");
            ong["groupBySize"] = true;
            ong["sizeFromNearbyText"] = new JsonObject
            {
                ["enabled"] = true, ["maxDistanceMm"] = 0, ["sizePatterns"] = new JsonArray("(x)"),
            };
        });
        Assert.Contains("maxDistanceMm", thieuNguong.Message);

        var regexSai = Loi(items =>
        {
            var ong = Item(items, "duct-supp");
            ong["groupBySize"] = true;
            ong["sizeFromNearbyText"] = new JsonObject
            {
                ["enabled"] = true, ["maxDistanceMm"] = 500, ["sizePatterns"] = new JsonArray("(chua dong ngoac"),
            };
        });
        Assert.Contains("regex sai", regexSai.Message);
    }

    [Fact]
    public void Tu_choi_formula_khai_ma_thieu_derivedFrom()
    {
        var loi = Loi(items => Item(items, "duct-supp")["formula"] = "perimeter*length");
        Assert.Contains("thiếu derivedFrom", loi.Message);
    }
}
