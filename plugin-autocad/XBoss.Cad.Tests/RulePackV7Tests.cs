using System.Text.Json.Nodes;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.2 — validator 3 khối chính sách của 4 bước chuẩn hóa mới (rule pack v7). Nguyên tắc như
/// v5/v6: bản phát hành KHÔNG bật bước nào; khai bật thì phải khai đủ và đúng, thiếu/vô nghĩa là
/// chặn ngay lúc nạp — một bước chuẩn hóa chạy im lặng (hoặc sửa sai cả bản vẽ) nguy hiểm hơn nhiều
/// so với việc rule pack không nạp được.
/// </summary>
public class RulePackV7Tests
{
    private static CadRulePack Nap(string khoi, Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc[khoi]!.AsObject());
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(string khoi, Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(khoi, chinh));

    // ===== Bản phát hành =====

    [Fact]
    public void V7_nap_duoc_va_khai_du_tham_so_de_bat_len_la_dung_ngay()
    {
        var pack = RepoPaths.LoadRulePack();
        Assert.Equal("v7", pack.Version);
        Assert.Equal("relative", pack.XrefPolicy.PathPolicy);
        Assert.Empty(pack.XrefPolicy.BindMatchAny); // mặc định an toàn: không bind xref nào
        Assert.True(pack.LayoutPolicy.RemoveEmpty);
        Assert.False(pack.LayoutPolicy.RenameLayouts);
        Assert.Contains("{seq}", pack.LayoutPolicy.NamePattern);
    }

    // ===== Bước 9 — xref =====

    [Fact]
    public void Tu_choi_pathPolicy_la()
    {
        Assert.Contains("pathPolicy", Loi("xrefPolicy", xp => xp["pathPolicy"] = "tuyet-doi").Message);
    }

    [Fact]
    public void Tu_choi_xrefPolicy_bat_ma_thieu_pathPolicy()
    {
        var loi = Loi("xrefPolicy", xp =>
        {
            xp["enabled"] = true;
            xp["pathPolicy"] = "";
        });
        Assert.Contains("pathPolicy", loi.Message);
    }

    [Fact]
    public void Tu_choi_bindMatchAny_co_tu_khoa_rong()
    {
        // Từ khóa rỗng khớp mọi tên xref → bind sạch cả bản vẽ, không hoàn tác nổi. Chặn CẢ KHI TẮT.
        Assert.Contains("bindMatchAny", Loi("xrefPolicy", xp => xp["bindMatchAny"] = new JsonArray(" ")).Message);
    }

    // ===== Bước 10 — hatch =====

    [Fact]
    public void Tu_choi_hatchMap_bat_ma_byLayer_rong()
    {
        Assert.Contains("byLayer rỗng", Loi("hatchMap", hm => hm["enabled"] = true).Message);
    }

    [Theory]
    [InlineData("layerMatchAny")]
    [InlineData("pattern")]
    [InlineData("scale")]
    public void Tu_choi_quy_dinh_hatch_khai_thieu(string khoaHong)
    {
        var loi = Loi("hatchMap", hm =>
        {
            var quyDinh = new JsonObject
            {
                ["layerMatchAny"] = new JsonArray("M-DUCT-SUPP"),
                ["pattern"] = "ANSI31",
                ["scale"] = 25,
            };
            quyDinh[khoaHong] = khoaHong switch
            {
                "layerMatchAny" => new JsonArray(),
                "pattern" => "",
                _ => 0,
            };
            hm["byLayer"] = new JsonArray(quyDinh);
        });
        Assert.Contains("hatchMap", loi.Message);
    }

    [Fact]
    public void Khai_dung_bo_mau_hatch_thi_nap_duoc()
    {
        var pack = Nap("hatchMap", hm =>
        {
            hm["enabled"] = true;
            hm["byLayer"] = new JsonArray(new JsonObject
            {
                ["layerMatchAny"] = new JsonArray("M-DUCT-SUPP"),
                ["pattern"] = "ANSI31",
                ["scale"] = 25,
            });
        });
        Assert.True(pack.HatchMap.Enabled);
        Assert.Equal(25, Assert.Single(pack.HatchMap.ByLayer).Scale);
    }

    // ===== Bước 11 — layout =====

    [Fact]
    public void Tu_choi_layoutPolicy_bat_ma_khong_lam_gi()
    {
        var loi = Loi("layoutPolicy", lp =>
        {
            lp["enabled"] = true;
            lp["removeEmpty"] = false;
            lp["renameLayouts"] = false;
        });
        Assert.Contains("không làm gì", loi.Message);
    }

    [Fact]
    public void Tu_choi_doi_ten_layout_ma_namePattern_thieu_seq()
    {
        var loi = Loi("layoutPolicy", lp =>
        {
            lp["enabled"] = true;
            lp["renameLayouts"] = true;
            lp["namePattern"] = "TRANG";
        });
        Assert.Contains("{seq}", loi.Message);
    }
}
