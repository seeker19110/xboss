using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

public class RulePackLoaderTests
{
    [Fact]
    public void Nap_duoc_rule_pack_dang_phat_hanh_tu_repo()
    {
        var pack = RepoPaths.LoadRulePack();
        Assert.Equal("v4", pack.Version);
        Assert.Equal(7, pack.LayerMap.Groups.Count);
        Assert.Equal("XBOSS_BOCKL", pack.Takeoff.XdataAppName);
        Assert.True(pack.Takeoff.Items.Count > 0);
        Assert.True(pack.InspectionPolicy.OpenPolyline.ReportNearClosedOnAllLayers);
        // v3: font Unicode đích cho kiểu chữ đã giải mã (thiếu nó thì chuẩn hóa xong AutoCAD vẫn
        // hiển thị sai — xem StandardizePipeline.DoiFontKieuChu).
        Assert.Equal("Arial", pack.FontMap.TargetFont.TypeFace);
    }

    [Fact]
    public void Rule_pack_v2_khong_co_targetFont_van_nap_duoc()
    {
        // Mở rộng thuần: plugin phải chạy được với pack cũ, chỉ là bỏ qua bước đổi font.
        var pack = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v2.json")));
        Assert.Equal("v2", pack.Version);
        Assert.Equal("", pack.FontMap.TargetFont.TypeFace);
    }

    [Fact]
    public void Tu_choi_targetFont_khai_nua_voi()
    {
        var json = File.ReadAllText(RepoPaths.RulePackPath).Replace("\"typeFace\": \"Arial\"", "\"typeFace\": \"\"");
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load(json));
        Assert.Contains("targetFont", loi.Message);
    }

    [Fact]
    public void Rule_pack_v3_van_nap_duoc_sau_khi_phat_hanh_v4()
    {
        // AC9 — v4 là mở rộng thuần: bản cũ vẫn hợp lệ, plugin không bị khoá vào đúng một version.
        var pack = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v3.json")));
        Assert.Equal("v3", pack.Version);
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
        var json = File.ReadAllText(RepoPaths.RulePackPath)
            .Replace("\"measure\": \"length\"", "\"measure\": \"weight\"");
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load(json));
        Assert.Contains("measure lạ", loi.Message);
    }

    [Fact]
    public void Bo_qua_field_khong_biet_de_ban_moi_mo_rong_thuan_khong_lam_vo_plugin()
    {
        var json = File.ReadAllText(RepoPaths.RulePackPath)
            .Replace("\"version\": \"v4\",", "\"version\": \"v4\", \"fieldTuongLai\": { \"x\": 1 },");
        var pack = RulePackLoader.Load(json);
        Assert.Equal("v4", pack.Version);
    }
}
