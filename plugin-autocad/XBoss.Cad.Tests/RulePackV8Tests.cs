using System.Text.Json.Nodes;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M102 §6.1/§6.2 — validator 2 khối chính sách của bước chuẩn hóa 12/13 (rule pack v8), cùng
/// nguyên tắc với v5/v6/v7: bản phát hành KHÔNG bật bước nào; khai bật thì phải khai đủ và đúng,
/// thiếu/vô nghĩa là chặn ngay lúc nạp.
/// </summary>
public class RulePackV8Tests
{
    private static CadRulePack Nap(string khoi, Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc[khoi]!.AsObject());
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(string khoi, Action<JsonObject> chinh) =>
        Assert.Throws<RulePackException>(() => Nap(khoi, chinh));

    // ===== Bản phát hành: mọi thứ mới đều TẮT (AC7 — v8 cho kết quả y hệt v7) =====

    [Fact]
    public void V8_phat_hanh_tat_moi_buoc_moi_va_moi_phep_kiem_moi()
    {
        var pack = RepoPaths.LoadRulePack();
        Assert.Equal("v8", pack.Version);

        Assert.False(pack.PolylineClosePolicy.Enabled);
        Assert.True(pack.PolylineClosePolicy.GapCloseToleranceMm > 0); // khai sẵn để bật là dùng được ngay
        Assert.False(pack.BlockMap.Enabled);
        Assert.True(pack.BlockMap.ReportOnly); // bản đầu chỉ BÁO kể cả khi bật
        Assert.Empty(pack.BlockMap.Rules);

        Assert.False(pack.InspectionPolicy.TagDuplicate.Enabled);
        Assert.False(pack.InspectionPolicy.BoqCodeMissing.Enabled);
    }

    [Fact]
    public void Rule_pack_v7_cu_van_nap_duoc_va_moi_khoi_v8_ve_mac_dinh_tat()
    {
        var pack = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v7.json")));

        Assert.Equal("v7", pack.Version);
        Assert.False(pack.PolylineClosePolicy.Enabled);
        Assert.False(pack.BlockMap.Enabled);
        Assert.False(pack.InspectionPolicy.TagDuplicate.Enabled);
        Assert.False(pack.InspectionPolicy.BoqCodeMissing.Enabled);
    }

    [Fact]
    public void Layer_map_khong_con_ghi_no_khong_idempotent_da_dong_o_M101_PR2()
    {
        var json = File.ReadAllText(RepoPaths.RulePackPath);
        Assert.DoesNotContain("Không idempotent", json, StringComparison.Ordinal);
    }

    // ===== Bước 12 — đóng polyline gần kín =====

    [Fact]
    public void Bat_buoc_12_ma_nguong_bang_0_thi_chan_ngay()
    {
        var loi = Loi("polylineClosePolicy", o =>
        {
            o["enabled"] = true;
            o["gapCloseToleranceMm"] = 0;
        });
        Assert.Contains("gapCloseToleranceMm", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Nguong_am_thi_chan_ke_ca_khi_dang_tat()
    {
        var loi = Loi("polylineClosePolicy", o => o["gapCloseToleranceMm"] = -1);
        Assert.Contains("không được âm", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Layer_loc_rong_thi_chan_vi_se_khop_moi_layer()
    {
        var loi = Loi("polylineClosePolicy", o => o["onlyOnLayersMatchAny"] = new JsonArray("  "));
        Assert.Contains("onlyOnLayersMatchAny", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Bat_buoc_12_khai_du_thi_nap_duoc()
    {
        var pack = Nap("polylineClosePolicy", o =>
        {
            o["enabled"] = true;
            o["gapCloseToleranceMm"] = 5;
        });
        Assert.True(pack.PolylineClosePolicy.Enabled);
        Assert.Equal(5, pack.PolylineClosePolicy.GapCloseToleranceMm);
    }

    // ===== Bước 13 — quy block lạc chuẩn =====

    [Fact]
    public void Bat_buoc_13_ma_rules_rong_thi_chan()
    {
        var loi = Loi("blockMap", o => o["enabled"] = true);
        Assert.Contains("rules rỗng", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Quy_dinh_thieu_target_hoac_alias_thi_chan_ke_ca_khi_dang_tat()
    {
        var thieuTarget = Loi("blockMap", o => o["rules"] = new JsonArray(
            new JsonObject { ["aliasMatchAny"] = new JsonArray("FCU_OLD") }));
        Assert.Contains("target", thieuTarget.Message, StringComparison.Ordinal);

        var thieuAlias = Loi("blockMap", o => o["rules"] = new JsonArray(
            new JsonObject { ["target"] = "FCU-STD" }));
        Assert.Contains("aliasMatchAny", thieuAlias.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Alias_trung_chinh_ten_dich_thi_chan_vi_block_da_chuan_se_bi_bao_lac_chuan()
    {
        var loi = Loi("blockMap", o => o["rules"] = new JsonArray(
            new JsonObject { ["target"] = "FCU-STD", ["aliasMatchAny"] = new JsonArray("fcu-std") }));
        Assert.Contains("trùng chính tên đích", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Khai_trung_target_thi_chan()
    {
        var loi = Loi("blockMap", o => o["rules"] = new JsonArray(
            new JsonObject { ["target"] = "FCU-STD", ["aliasMatchAny"] = new JsonArray("FCU_OLD") },
            new JsonObject { ["target"] = "FCU-STD", ["aliasMatchAny"] = new JsonArray("FCU_CU") }));
        Assert.Contains("trùng target", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Alias_trung_nhau_giua_hai_quy_dinh_thi_chan_vi_dich_phu_thuoc_thu_tu_khai()
    {
        var loi = Loi("blockMap", o => o["rules"] = new JsonArray(
            new JsonObject { ["target"] = "FCU-STD", ["aliasMatchAny"] = new JsonArray("FCU_OLD") },
            new JsonObject { ["target"] = "FCU-ALT", ["aliasMatchAny"] = new JsonArray("fcu_old") }));
        Assert.Contains("do thứ tự khai", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Bat_buoc_13_khai_du_thi_nap_duoc_va_van_mac_dinh_chi_bao()
    {
        var pack = Nap("blockMap", o =>
        {
            o["enabled"] = true;
            o["rules"] = new JsonArray(
                new JsonObject { ["target"] = "FCU-STD", ["aliasMatchAny"] = new JsonArray("FCU_OLD") });
        });
        Assert.True(pack.BlockMap.Enabled);
        Assert.True(pack.BlockMap.ReportOnly);
        Assert.Single(pack.BlockMap.Rules);
    }
}
