using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M110 §5 — validator khối <c>drawTools.revisionPolicy</c> (rule pack v11), tầng C# của
/// "validator 2 tầng" (tầng TS: <c>lib/ky-thuat/cad/rule-pack-revision.ts</c>). Cùng nguyên tắc
/// v5–v9: bản phát hành KHÔNG bật khối mới; khai bật thì phải khai đủ và đúng, thiếu/vô nghĩa là
/// chặn ngay lúc nạp chứ không để kỹ sư phát hiện khi đứng trước AutoCAD.
/// </summary>
public class RulePackV11Tests
{
    private static DrawToolsPack Nap(Action<JsonObject> chinhRevision)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinhRevision(goc["drawTools"]!["revisionPolicy"]!.AsObject());
        return DrawToolsConfig.Load(goc.ToJsonString());
    }

    private static RulePackException Loi(Action<JsonObject> chinhRevision) =>
        Assert.Throws<RulePackException>(() => Nap(chinhRevision));

    // ===== Bản phát hành =====

    [Fact]
    public void Ban_phat_hanh_khai_du_tham_so_revision_va_van_TAT()
    {
        var rev = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.RevisionPolicy;

        Assert.NotNull(rev);
        Assert.False(rev!.Enabled); // AC8 — mặc định tắt, 3 lệnh revision dừng kèm thông báo cách bật
        Assert.True(rev.CloudArcMm > 0);
        Assert.False(string.IsNullOrWhiteSpace(rev.Layer));
        Assert.False(string.IsNullOrWhiteSpace(rev.TriangleBlockId));
        Assert.Contains(RevisionPolicySection.OTrongSo, rev.NumberFormat, StringComparison.Ordinal);
        Assert.True(rev.MaxRows >= 1);
        Assert.True(rev.BoundingPaddingMm >= 0);
    }

    [Fact]
    public void Rule_pack_cu_khong_co_revisionPolicy_van_nap_duoc()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v9.json")));

        Assert.Null(pack.DrawTools.RevisionPolicy); // → 3 lệnh revision từ chối chạy, không đoán mặc định
    }

    // ===== Sinh chuỗi theo mẫu =====

    [Fact]
    public void So_revision_va_ten_attribute_khung_ten_thay_cho_o_trong_n()
    {
        var rev = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.RevisionPolicy!;

        Assert.Equal("R2", rev.SoRevision(2));
        Assert.Equal(15000, rev.CungTheoTiLe(50)); // cloudArcMm 300 × tỉ lệ 1:50

        var dong = rev.TitleblockAttrPattern.ChoDong(3);
        Assert.Equal("REV3_NO", dong.So);
        Assert.Equal("REV3_DATE", dong.Ngay);
        Assert.Equal("REV3_DESC", dong.NoiDung);
        Assert.Equal("REV3_BY", dong.Nguoi);
    }

    // ===== Validator (M110 §5) =====

    [Fact]
    public void NumberFormat_thieu_o_trong_n_bi_chan()
    {
        var loi = Loi(rev => rev["numberFormat"] = "REV");

        Assert.Contains("numberFormat", loi.Message, StringComparison.Ordinal);
        Assert.Contains("{n}", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void CloudArcMm_khong_duong_bi_chan()
    {
        Assert.Contains("cloudArcMm", Loi(rev => rev["cloudArcMm"] = 0).Message, StringComparison.Ordinal);
        Assert.Contains("cloudArcMm", Loi(rev => rev["cloudArcMm"] = -5).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void TriangleBlockId_rong_chi_bi_chan_khi_khoi_dang_BAT()
    {
        // Tắt thì khai rỗng vẫn nạp được — công ty chưa dùng revision thì chưa cần block tam giác.
        var tat = Nap(rev => rev["triangleBlockId"] = "");
        Assert.Equal("", tat.DrawTools.RevisionPolicy!.TriangleBlockId);

        var loi = Loi(rev =>
        {
            rev["enabled"] = true;
            rev["triangleBlockId"] = "";
        });
        Assert.Contains("triangleBlockId", loi.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void MaxRows_nho_hon_1_bi_chan()
    {
        Assert.Contains("maxRows", Loi(rev => rev["maxRows"] = 0).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Layer_rong_va_boundingPadding_am_bi_chan()
    {
        Assert.Contains("layer", Loi(rev => rev["layer"] = "  ").Message, StringComparison.Ordinal);
        Assert.Contains(
            "boundingPaddingMm", Loi(rev => rev["boundingPaddingMm"] = -1).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Mau_ten_attribute_khung_ten_thieu_o_trong_n_hoac_rong_bi_chan()
    {
        var loi = Loi(rev => rev["titleblockAttrPattern"]!["ngay"] = "REV_DATE");
        Assert.Contains("titleblockAttrPattern.ngay", loi.Message, StringComparison.Ordinal);

        var loiRong = Loi(rev => rev["titleblockAttrPattern"]!["noiDung"] = "");
        Assert.Contains("titleblockAttrPattern.noiDung", loiRong.Message, StringComparison.Ordinal);
    }
}
