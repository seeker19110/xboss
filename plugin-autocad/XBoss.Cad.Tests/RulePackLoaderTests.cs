using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

public class RulePackLoaderTests
{
    [Fact]
    public void Nap_duoc_rule_pack_dang_phat_hanh_tu_repo()
    {
        var pack = RepoPaths.LoadRulePack();
        Assert.Equal("v7", pack.Version);
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
    public void Rule_pack_v4_van_nap_duoc_sau_khi_phat_hanh_v5()
    {
        // M101 §7 FR1 — v5 mở rộng thuần: máy chưa cập nhật vẫn dùng được v4, và các khối v5
        // (7 phép kiểm mới + styleMap) vắng mặt thì về mặc định TẮT/rỗng chứ không ném lỗi.
        var pack = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v4.json")));
        Assert.Equal("v4", pack.Version);
        Assert.False(pack.InspectionPolicy.OverlapSameSystem.Enabled);
        Assert.False(pack.InspectionPolicy.Clash2d.Enabled);
        Assert.False(pack.InspectionPolicy.TitleblockFields.Enabled);
        Assert.False(pack.InspectionPolicy.ViewportScale.Enabled);
        Assert.False(pack.InspectionPolicy.StyleDeviation.Enabled);
        Assert.False(pack.InspectionPolicy.LabelSizeMismatch.Enabled);
        Assert.False(pack.InspectionPolicy.StrayObjects.Enabled);
        Assert.Equal("", pack.StyleMap.TextStyle.Name);
    }

    [Fact]
    public void V5_khai_du_7_phep_kiem_moi_va_moi_phep_deu_TAT_mac_dinh()
    {
        // Bằng chứng cho AC(a) M101: phát hành v5 không tự ý bật thêm phép kiểm nào.
        var ip = RepoPaths.LoadRulePack().InspectionPolicy;
        Assert.All(
            new[]
            {
                ip.OverlapSameSystem.Enabled, ip.Clash2d.Enabled, ip.TitleblockFields.Enabled,
                ip.ViewportScale.Enabled, ip.StyleDeviation.Enabled, ip.LabelSizeMismatch.Enabled,
                ip.StrayObjects.Enabled,
            },
            bat => Assert.False(bat));

        // Tham số vẫn phải khai sẵn (bật lên là dùng được ngay, không phải phát hành lại).
        Assert.True(ip.OverlapSameSystem.OverlapToleranceMm > 0);
        Assert.True(ip.OverlapSameSystem.OverlapMinLengthMm > 0);
        Assert.Empty(ip.Clash2d.ClashPairs); // mặc định an toàn: chưa soi cặp hệ nào
        Assert.NotEmpty(ip.TitleblockFields.RequiredAttributes);
        Assert.NotEmpty(ip.ViewportScale.Scales);
        Assert.True(ip.StrayObjects.StrayDistanceFactor > 0);
        Assert.Equal("XBOSS-TEXT", RepoPaths.LoadRulePack().StyleMap.TextStyle.Name);
    }

    [Fact]
    public void Tu_choi_clashPairs_khai_he_khong_co_trong_layerMap()
    {
        // Tên hệ trôi khỏi layerMap phải lộ ngay lúc nạp, kể cả khi phép kiểm đang tắt.
        var json = File.ReadAllText(RepoPaths.RulePackPath)
            .Replace("\"clashPairs\": [],", "\"clashPairs\": [[\"HVAC\", \"KHONG_CO_HE_NAY\"]],");
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load(json));
        Assert.Contains("KHONG_CO_HE_NAY", loi.Message);
    }

    [Fact]
    public void Tu_choi_phep_kiem_bat_ma_thieu_tham_so()
    {
        // overlapSameSystem bật nhưng dung sai = 0 → chặn ngay, không chạy im lặng.
        var json = File.ReadAllText(RepoPaths.RulePackPath)
            .Replace("\"enabled\": false,\n      \"overlapToleranceMm\": 50,", "\"enabled\": true,\n      \"overlapToleranceMm\": 0,");
        var loi = Assert.Throws<RulePackException>(() => RulePackLoader.Load(json));
        Assert.Contains("overlapSameSystem", loi.Message);
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
            .Replace("\"version\": \"v6\",", "\"version\": \"v6\", \"fieldTuongLai\": { \"x\": 1 },");
        var pack = RulePackLoader.Load(json);
        Assert.Equal("v7", pack.Version);
    }
}
