using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M109 §9 — đối chứng 2 tầng cho validator <c>drawTools.crossingPolicy</c>: tầng 2 (C#, tệp này)
/// và tầng 3 (TS, <c>tests/cad-crossing-doi-chung.test.ts</c>) chạy CÙNG bộ ca trong
/// <c>plugin-autocad/doi-chung/crossing-doi-chung.json</c>. Một tầng nới lỏng/siết chặt luật mà
/// tầng kia không đổi theo là đỏ ngay — rủi ro số 1 của M99 (trôi quy tắc giữa 2 tầng).
/// </summary>
public class CrossingDoiChungTests
{
    private sealed record BoDoiChung(
        [property: JsonPropertyName("rulePackVersion")] string RulePackVersion,
        [property: JsonPropertyName("systemIds")] IReadOnlyList<string> SystemIds,
        [property: JsonPropertyName("cases")] IReadOnlyList<CaDoiChung> Cases);

    private sealed record CaDoiChung(
        [property: JsonPropertyName("ma")] string Ma,
        [property: JsonPropertyName("khoaLoi")] string? KhoaLoi,
        [property: JsonPropertyName("crossingPolicy")] CrossingPolicySection CrossingPolicy);

    private static BoDoiChung Doc()
    {
        var duongDan = Path.Combine(RepoPaths.DoiChungDir, "crossing-doi-chung.json");
        return JsonSerializer.Deserialize<BoDoiChung>(File.ReadAllText(duongDan))!;
    }

    [Fact]
    public void Bo_doi_chung_bam_dung_rule_pack_dang_phat_hanh()
    {
        var bo = Doc();
        Assert.Equal(RepoPaths.VersionHienHanh, bo.RulePackVersion);

        // systemIds của bộ đối chứng phải đúng là tập hệ THẬT của rule pack đang phát hành.
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        Assert.Equal(
            pack.DrawTools.Systems.Select(s => s.Id).OrderBy(s => s, StringComparer.Ordinal),
            bo.SystemIds.OrderBy(s => s, StringComparer.Ordinal));
    }

    [Fact]
    public void Moi_ca_doi_chung_cho_ket_qua_dung_nhu_khai()
    {
        var bo = Doc();
        Assert.NotEmpty(bo.Cases);

        foreach (var ca in bo.Cases)
        {
            var kiem = () => DrawToolsConfig.ValidateCrossingPolicy(ca.CrossingPolicy, bo.SystemIds);
            if (ca.KhoaLoi is null)
            {
                kiem(); // hợp lệ ⇒ không được ném
                continue;
            }

            var loi = Assert.Throws<RulePackException>(kiem);
            Assert.Contains(ca.KhoaLoi, loi.Message);
        }
    }
}
