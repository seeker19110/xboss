using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Reporting;

/// <summary>Một dòng diff của pipeline chuẩn hóa (M99 §6.6/FR8).</summary>
public sealed record StepDiff
{
    [JsonPropertyName("buoc")] public required string Buoc { get; init; }
    [JsonPropertyName("hangMuc")] public required string HangMuc { get; init; }
    [JsonPropertyName("truoc")] public required string Truoc { get; init; }
    [JsonPropertyName("sau")] public required string Sau { get; init; }
    [JsonPropertyName("soLuong")] public required int SoLuong { get; init; }
}

/// <summary>
/// Báo cáo diff chuẩn hóa — có cấu trúc (JSON, gửi kèm upload PR5) + bản tiếng Việt
/// hiện trong AutoCAD. Version rule pack ghi trong MỌI báo cáo (FR1).
/// </summary>
public sealed class StandardizeReport
{
    [JsonPropertyName("rulePackVersion")] public required string RulePackVersion { get; init; }
    [JsonPropertyName("tenBanVe")] public required string TenBanVe { get; init; }
    [JsonPropertyName("ngayIso")] public required string NgayIso { get; init; }
    [JsonPropertyName("cheDo")] public required string CheDo { get; init; } // "chi-kiem" | "chuan-hoa"
    [JsonPropertyName("steps")] public required IReadOnlyList<StepDiff> Steps { get; init; }
    [JsonPropertyName("canhBao")] public required IReadOnlyList<string> CanhBao { get; init; }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);

    /// <summary>Bản đọc được cho command line/hộp thoại AutoCAD.</summary>
    public string ToVietnameseText()
    {
        var sb = new StringBuilder();
        sb.AppendLine($"=== Báo cáo {(CheDo == "chi-kiem" ? "KIỂM TRA" : "CHUẨN HÓA")} — {TenBanVe} ===");
        sb.AppendLine($"Rule pack: {RulePackVersion} · {NgayIso}");
        foreach (var nhom in Steps.GroupBy(s => s.Buoc))
        {
            sb.AppendLine($"[{nhom.Key}]");
            foreach (var s in nhom)
                sb.AppendLine($"  - {s.HangMuc}: {s.Truoc} → {s.Sau} ({s.SoLuong})");
        }
        foreach (var c in CanhBao) sb.AppendLine($"⚠ {c}");
        return sb.ToString();
    }
}
