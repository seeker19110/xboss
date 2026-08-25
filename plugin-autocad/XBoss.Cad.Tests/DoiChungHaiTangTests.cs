using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Fonts;
using XBoss.Cad.Core.Layers;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M99 AC6 — đối chứng QUY TẮC giữa 2 tầng, phần chạy được trên CI Linux (không cần AutoCAD).
///
/// Corpus `plugin-autocad/doi-chung/corpus.json` là dữ liệu VÀO duy nhất cho cả hai tầng; kết quả
/// kỳ vọng `ket-qua-mong-doi.json` do chính tầng 3 (server TS) sinh ra qua `npm run cad:doi-chung`.
/// Tầng 2 (plugin) phải ra y hệt — lệch nghĩa là plugin đã trôi khỏi rule pack (ADR-0006 nguyên tắc 1).
/// Phần AC6 về hình học cần AutoCAD thật → kiểm tích hợp accoreconsole trên runner có license.
/// </summary>
public class DoiChungHaiTangTests
{
    private sealed record Corpus(
        string RulePackVersion,
        List<string> Layers,
        List<string> Tcvn3,
        List<string> Vni);

    private sealed record KetQuaMongDoi(
        string RulePackVersion,
        Dictionary<string, string> Layers,
        Dictionary<string, string> Tcvn3,
        Dictionary<string, string> Vni);

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private static string ThuMucDoiChung
    {
        get
        {
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null)
            {
                var ungVien = Path.Combine(dir.FullName, "plugin-autocad", "doi-chung");
                if (Directory.Exists(ungVien)) return ungVien;
                dir = dir.Parent;
            }
            throw new DirectoryNotFoundException(
                "Không tìm thấy plugin-autocad/doi-chung — test phải chạy trong repo XBoss.");
        }
    }

    private static T Doc<T>(string tenTep)
    {
        var json = File.ReadAllText(Path.Combine(ThuMucDoiChung, tenTep));
        return JsonSerializer.Deserialize<T>(json, JsonOpts)
               ?? throw new InvalidDataException($"Không đọc được {tenTep}");
    }

    private static readonly Corpus TapVao = Doc<Corpus>("corpus.json");
    private static readonly KetQuaMongDoi MongDoi = Doc<KetQuaMongDoi>("ket-qua-mong-doi.json");

    [Fact]
    public void Corpus_bam_dung_rule_pack_dang_phat_hanh()
    {
        var pack = RepoPaths.LoadRulePack();
        Assert.Equal(pack.Version, TapVao.RulePackVersion);
        Assert.Equal(pack.Version, MongDoi.RulePackVersion);
        Assert.Equal(TapVao.Layers.Count, MongDoi.Layers.Count);
    }

    [Fact]
    public void Tang_2_anh_xa_layer_y_het_ket_qua_doi_chung()
    {
        var mapper = new LayerMapper(RepoPaths.LoadRulePack().LayerMap);
        foreach (var ten in TapVao.Layers)
        {
            Assert.Equal(MongDoi.Layers[ten], mapper.Map(ten));
        }
    }

    [Fact]
    public void Tang_2_giai_ma_TCVN3_va_VNI_y_het_ket_qua_doi_chung()
    {
        var converter = new VietnameseTextConverter(RepoPaths.LoadRulePack().FontMap);
        foreach (var s in TapVao.Tcvn3)
        {
            Assert.Equal(
                MongDoi.Tcvn3[s].Normalize(NormalizationForm.FormC),
                converter.Convert(s, LegacyFontKind.Tcvn3));
        }
        foreach (var s in TapVao.Vni)
        {
            Assert.Equal(
                MongDoi.Vni[s].Normalize(NormalizationForm.FormC),
                converter.Convert(s, LegacyFontKind.Vni));
        }
    }
}
