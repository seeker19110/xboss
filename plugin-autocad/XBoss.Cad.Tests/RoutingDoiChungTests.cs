using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M114 §10 — đối chứng 2 tầng cho việc CẤP TẦNG/LÀN: tầng 2 (C#, <see cref="CapPhatLanTang"/>,
/// tệp này) và tầng 3 (TS, <c>planMultiTierCorridor</c> — <c>tests/cad-routing-doi-chung.test.ts</c>)
/// chạy CÙNG bộ ca trong <c>plugin-autocad/doi-chung/routing-doi-chung.json</c>. Một tầng đổi cách
/// cấp tầng/làn mà tầng kia không đổi theo là đỏ ngay (M114 §2 #2 — rủi ro số 1 của M99).
/// </summary>
public class RoutingDoiChungTests
{
    private sealed record BoDoiChung(
        [property: JsonPropertyName("rulePackVersion")] string RulePackVersion,
        [property: JsonPropertyName("tierAnhXaTs")] IReadOnlyDictionary<string, string> TierAnhXaTs,
        [property: JsonPropertyName("heDien")] IReadOnlyList<string> HeDien,
        [property: JsonPropertyName("cases")] IReadOnlyList<CaDoiChung> Cases);

    private sealed record CaDoiChung(
        [property: JsonPropertyName("ma")] string Ma,
        [property: JsonPropertyName("vao")] DauVao Vao,
        [property: JsonPropertyName("mongDoi")] IReadOnlyList<LanMongDoi> MongDoi);

    private sealed record DauVao(
        [property: JsonPropertyName("hanhLang")] HanhLangJson HanhLang,
        [property: JsonPropertyName("he")] IReadOnlyList<HeJson> He);

    private sealed record HanhLangJson(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("beRongMm")] double BeRongMm,
        [property: JsonPropertyName("cotDayDamMm")] double CotDayDamMm,
        [property: JsonPropertyName("cotTranMm")] double CotTranMm);

    private sealed record HeJson(
        [property: JsonPropertyName("heId")] string HeId,
        [property: JsonPropertyName("beRongMm")] double BeRongMm,
        [property: JsonPropertyName("caoThietDienMm")] double CaoThietDienMm);

    private sealed record LanMongDoi(
        [property: JsonPropertyName("heId")] string HeId,
        [property: JsonPropertyName("tierId")] string TierId,
        [property: JsonPropertyName("lanTuMm")] double LanTuMm,
        [property: JsonPropertyName("lanDenMm")] double LanDenMm,
        [property: JsonPropertyName("caoDoMm")] double CaoDoMm);

    private static BoDoiChung Doc()
    {
        var duongDan = Path.Combine(RepoPaths.DoiChungDir, "routing-doi-chung.json");
        return JsonSerializer.Deserialize<BoDoiChung>(File.ReadAllText(duongDan))!;
    }

    private static RoutingPolicySection ChinhSach()
    {
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));
        Assert.NotNull(pack.DrawTools.RoutingPolicy);
        return pack.DrawTools.RoutingPolicy!;
    }

    [Fact]
    public void Bo_doi_chung_bam_dung_rule_pack_dang_phat_hanh()
    {
        var bo = Doc();
        Assert.Equal(RepoPaths.VersionHienHanh, bo.RulePackVersion);
        Assert.NotEmpty(bo.Cases);

        // Ánh xạ tier của bộ đối chứng phải phủ đúng tập tier thật của rule pack.
        var tierThat = ChinhSach().Tiers.Select(t => t.Id).OrderBy(x => x, StringComparer.Ordinal);
        Assert.Equal(tierThat, bo.TierAnhXaTs.Values.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public void CapPhatLanTang_ra_dung_tang_cao_do_va_lan_nhu_tang_TS()
    {
        var bo = Doc();
        var chinhSach = ChinhSach();

        foreach (var ca in bo.Cases)
        {
            var hanhLang = new HanhLangCapLan(
                ca.Vao.HanhLang.Id,
                ca.Vao.HanhLang.BeRongMm,
                ca.Vao.HanhLang.CotDayDamMm,
                ca.Vao.HanhLang.CotTranMm);
            var yeuCau = ca.Vao.He
                .Select(h => new YeuCauLan(h.HeId, h.BeRongMm, h.CaoThietDienMm))
                .ToList();

            var ketQua = CapPhatLanTang.Cap(chinhSach, hanhLang, yeuCau, bo.HeDien);

            Assert.True(ketQua.KhongCap.Count == 0,
                $"ca \"{ca.Ma}\": tầng C# báo không cấp được trong khi tầng TS cấp đủ — " +
                string.Join(" | ", ketQua.KhongCap.Select(k => k.LyDo)));
            Assert.Equal(
                ca.MongDoi.Select(m => (m.HeId, m.TierId, m.LanTuMm, m.LanDenMm, m.CaoDoMm)),
                ketQua.LanMoi.Select(l => (l.HeId, l.TierId, l.LanTuMm, l.LanDenMm, l.CaoDoMm)));

            // Sổ chiếm chỗ ghi ngược vào XData hành lang phải đúng bằng các làn vừa cấp (FR9).
            Assert.Equal(ketQua.LanMoi, ketQua.SoSauKhiCap);
        }
    }
}
