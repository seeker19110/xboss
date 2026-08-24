using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

public class RulePackLoaderTests
{
    [Fact]
    public void Nap_duoc_rule_pack_v2_that_tu_repo()
    {
        var pack = RepoPaths.LoadRulePackV2();
        Assert.Equal("v2", pack.Version);
        Assert.Equal(7, pack.LayerMap.Groups.Count);
        Assert.Equal("XBOSS_BOCKL", pack.Takeoff.XdataAppName);
        Assert.True(pack.Takeoff.Items.Count > 0);
        Assert.True(pack.InspectionPolicy.OpenPolyline.ReportNearClosedOnAllLayers);
    }

    [Fact]
    public void Tu_choi_json_hong_voi_thong_diep_tieng_viet()
    {
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load("{ hong"));
        Assert.Contains("JSON", loi.Message);
    }

    [Fact]
    public void Tu_choi_field_sai_kieu()
    {
        Assert.Throws<RulePackException>(() => RulePackLoader.Load("""{ "version": 2 }"""));
    }

    [Fact]
    public void Tu_choi_khi_thieu_noi_dung_bat_buoc()
    {
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load("""{ "version": "v9" }"""));
        Assert.Contains("layerMap", loi.Message);
    }

    [Fact]
    public void Tu_choi_takeoff_item_measure_la()
    {
        var json = File.ReadAllText(RepoPaths.RulePackV2Path)
            .Replace("\"measure\": \"length\"", "\"measure\": \"weight\"");
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load(json));
        Assert.Contains("measure lạ", loi.Message);
    }

    [Fact]
    public void Bo_qua_field_khong_biet_de_v3_mo_rong_thuan_khong_lam_vo_plugin()
    {
        var json = File.ReadAllText(RepoPaths.RulePackV2Path)
            .Replace("\"version\": \"v2\",", "\"version\": \"v2\", \"fieldTuongLai\": { \"x\": 1 },");
        var pack = RulePackLoader.Load(json);
        Assert.Equal("v2", pack.Version);
    }
}
