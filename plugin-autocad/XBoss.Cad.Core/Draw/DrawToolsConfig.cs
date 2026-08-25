using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Model + bộ kiểm khối <c>drawTools</c>/<c>sheetSetup</c> của rule pack v4 (M100 §11, FR1/FR4).
/// Thuần — KHÔNG tham chiếu assembly AutoCAD (M99 FR17), chạy test trên CI Linux.
///
/// Nguyên tắc "một nguồn tên": tên layer đích CHỈ khai trong <c>layerMap</c>, drawTools chỉ trỏ
/// tới nó; itemId chỉ khai trong <c>takeoff.items</c>. Validator ở đây là chốt chặn chống trôi tên
/// giữa 4 nguồn (layerMap ↔ drawTools ↔ manifest ↔ takeoff — M100 §18 rủi ro số 1).
/// </summary>
public sealed class DrawToolsSection
{
    [JsonPropertyName("baseFadePct")] public int BaseFadePct { get; init; }

    /// <summary>Hậu tố layer nét biên: layer biên = layer tim + hậu tố này (FR4).</summary>
    [JsonPropertyName("edgeLayerSuffix")] public string EdgeLayerSuffix { get; init; } = "";

    [JsonPropertyName("labelStyle")] public LabelStyleSection LabelStyle { get; init; } = new();
    [JsonPropertyName("systems")] public IReadOnlyList<DrawSystem> Systems { get; init; } = [];

    /// <summary>
    /// Id block phụ kiện được coi là PHỤ KIỆN NẶNG — <c>XBOSS_VE_GIADO</c> luôn đặt thêm giá đỡ
    /// ngay tại đó (M100 §6.7). Rule pack v4–v6 KHÔNG có khóa này ⇒ danh sách rỗng, lệnh giữ
    /// nguyên đường hỏi kỹ sư (hành vi cũ không đổi). Khai từ v7.
    /// </summary>
    [JsonPropertyName("heavyFittingIds")] public IReadOnlyList<string> HeavyFittingIds { get; init; } = [];

    /// <summary>Rule pack có khai (dù rỗng) danh sách phụ kiện nặng chưa — phân biệt "khai rỗng
    /// = không phụ kiện nào nặng" với "chưa khai = phải hỏi kỹ sư".</summary>
    [JsonIgnore] public bool CoKhaiPhuKienNang => HeavyFittingIds.Count > 0;

    /// <summary>Block phụ kiện (theo id manifest) có phải phụ kiện nặng không.</summary>
    public bool LaPhuKienNang(string? blockId) =>
        blockId is { Length: > 0 } id &&
        HeavyFittingIds.Any(h => string.Equals(h, id, StringComparison.Ordinal));
}

public sealed class LabelStyleSection
{
    [JsonPropertyName("textHeightMm")] public double TextHeightMm { get; init; }
    [JsonPropertyName("layer")] public string Layer { get; init; } = "";
}

public sealed class DrawSystem
{
    /// <summary>Khớp <c>layerMap.groups[].id</c>.</summary>
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("lines")] public IReadOnlyList<DrawLine> Lines { get; init; } = [];
    /// <summary>Id block phụ kiện trong manifest thư viện (M100 PR2).</summary>
    [JsonPropertyName("fittings")] public IReadOnlyList<string> Fittings { get; init; } = [];
    /// <summary>Id item takeoff <c>measure=count</c> của thiết bị hệ này.</summary>
    [JsonPropertyName("equipment")] public IReadOnlyList<string> Equipment { get; init; } = [];
}

public sealed class DrawLine
{
    /// <summary>Khớp <c>takeoff.items[].id</c>.</summary>
    [JsonPropertyName("itemId")] public string ItemId { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    /// <summary>Khớp <c>branches[].target</c> của ĐÚNG group cùng id với hệ.</summary>
    [JsonPropertyName("layer")] public string Layer { get; init; } = "";
    /// <summary><c>double</c> = sinh 2 nét biên (ống gió, máng cáp); <c>none</c> = chỉ tim (ống tròn).</summary>
    [JsonPropertyName("edgeStyle")] public string EdgeStyle { get; init; } = "";
    [JsonPropertyName("sizeKind")] public string SizeKind { get; init; } = "";
    [JsonPropertyName("sizes")] public IReadOnlyList<string> Sizes { get; init; } = [];

    /// <summary>
    /// Khoảng cách giá đỡ (M100 §6.7): số chung cho mọi size, hoặc object theo từng size.
    /// Giữ dạng JsonElement để nhận cả hai kiểu — đọc qua <see cref="SupportSpacingMmCho"/>.
    /// </summary>
    [JsonPropertyName("supportSpacingMm")] public JsonElement? SupportSpacingMm { get; init; }

    /// <summary>Khe hở sleeve so với size ống (M100 §6.8).</summary>
    [JsonPropertyName("sleeveClearanceMm")] public double? SleeveClearanceMm { get; init; }

    /// <summary>Tuyến bắt buộc hỏi độ dốc khi vẽ (M100 §6.9) — mặc định false.</summary>
    [JsonPropertyName("slopeRequired")] public bool SlopeRequired { get; init; }

    /// <summary>Khoảng cách giá đỡ cho một size cụ thể; null = không khai (lệnh vẽ phải hỏi/ bỏ qua).</summary>
    public double? SupportSpacingMmCho(string size)
    {
        if (SupportSpacingMm is not { } el) return null;
        switch (el.ValueKind)
        {
            case JsonValueKind.Number:
                return el.GetDouble();
            case JsonValueKind.Object:
                if (el.TryGetProperty(size, out var v) && v.ValueKind == JsonValueKind.Number) return v.GetDouble();
                return null;
            default:
                return null;
        }
    }
}

public sealed class SheetSetupSection
{
    [JsonPropertyName("plotter")] public string Plotter { get; init; } = "";
    [JsonPropertyName("paperSizes")] public IReadOnlyList<string> PaperSizes { get; init; } = [];
    [JsonPropertyName("scales")] public IReadOnlyList<double> Scales { get; init; } = [];
    [JsonPropertyName("layoutNamePattern")] public string LayoutNamePattern { get; init; } = "";
    /// <summary>Id block kind=titleblock trong manifest thư viện; rỗng = chưa khai (chưa dùng TRANGIN).</summary>
    [JsonPropertyName("titleblockId")] public string? TitleblockId { get; init; }
    [JsonPropertyName("defaultElevations")] public IReadOnlyList<double> DefaultElevations { get; init; } = [];
    [JsonPropertyName("sectionNamePattern")] public string SectionNamePattern { get; init; } = "";
    [JsonPropertyName("tagPattern")] public string TagPattern { get; init; } = "";
    [JsonPropertyName("tableStyle")] public TableStyleSection TableStyle { get; init; } = new();
    [JsonPropertyName("slopes")] public IReadOnlyList<string> Slopes { get; init; } = [];
}

public sealed class TableStyleSection
{
    [JsonPropertyName("textHeightMm")] public double TextHeightMm { get; init; }
}

/// <summary>Rule pack v4 nhìn từ bộ lệnh vẽ: rule pack gốc + 2 khối mới đã kiểm chéo.</summary>
public sealed class DrawToolsPack
{
    public required CadRulePack RulePack { get; init; }
    public required DrawToolsSection DrawTools { get; init; }
    public required SheetSetupSection SheetSetup { get; init; }
}

/// <summary>Nạp + kiểm khối drawTools/sheetSetup (M100 FR1/FR4).</summary>
public static class DrawToolsConfig
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
    };

    private sealed class GocV4
    {
        [JsonPropertyName("drawTools")] public DrawToolsSection? DrawTools { get; init; }
        [JsonPropertyName("sheetSetup")] public SheetSetupSection? SheetSetup { get; init; }
    }

    /// <summary>
    /// Nạp rule pack v4 từ JSON: kiểm phần v2/v3 bằng <see cref="RulePackLoader"/> rồi kiểm tiếp
    /// 2 khối mới. Rule pack không có drawTools (v2/v3) → lỗi rõ ràng: lệnh vẽ cần tối thiểu v4.
    /// </summary>
    public static DrawToolsPack Load(string json)
    {
        var pack = RulePackLoader.Load(json);
        GocV4? goc;
        try
        {
            goc = JsonSerializer.Deserialize<GocV4>(json, Options);
        }
        catch (JsonException e)
        {
            throw new RulePackException($"Khối drawTools/sheetSetup sai kiểu dữ liệu: {e.Message}");
        }
        if (goc?.DrawTools is null)
        {
            throw new RulePackException(
                $"Rule pack \"{pack.Version}\" không có khối drawTools — bộ lệnh XBOSS_VE_* cần rule pack từ v4 trở lên.");
        }
        var sheetSetup = goc.SheetSetup ?? new SheetSetupSection();
        Validate(pack, goc.DrawTools, sheetSetup);
        return new DrawToolsPack { RulePack = pack, DrawTools = goc.DrawTools, SheetSetup = sheetSetup };
    }

    /// <summary>Kiểm chéo drawTools/sheetSetup với layerMap + takeoff. Sai → RulePackException tiếng Việt.</summary>
    public static void Validate(CadRulePack pack, DrawToolsSection drawTools, SheetSetupSection sheetSetup)
    {
        if (drawTools.BaseFadePct is < 0 or > 100)
            throw new RulePackException($"drawTools.baseFadePct = {drawTools.BaseFadePct} phải nằm trong 0..100.");
        if (string.IsNullOrWhiteSpace(drawTools.EdgeLayerSuffix))
            throw new RulePackException("drawTools.edgeLayerSuffix trống — không biết đặt nét biên vào layer nào.");
        if (drawTools.LabelStyle.TextHeightMm <= 0 || string.IsNullOrWhiteSpace(drawTools.LabelStyle.Layer))
            throw new RulePackException("drawTools.labelStyle thiếu textHeightMm dương hoặc layer annotation.");
        if (drawTools.Systems.Count == 0)
            throw new RulePackException("drawTools.systems rỗng — không hệ nào vẽ được.");

        var itemIds = new HashSet<string>(pack.Takeoff.Items.Select(i => i.Id), StringComparer.Ordinal);
        var systemIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var sys in drawTools.Systems)
        {
            if (string.IsNullOrWhiteSpace(sys.Id))
                throw new RulePackException("drawTools.systems có hệ thiếu id.");
            if (!systemIds.Add(sys.Id))
                throw new RulePackException($"drawTools.systems trùng id \"{sys.Id}\".");

            // (a) hệ phải là một nhóm có thật trong layerMap.
            var group = pack.LayerMap.Groups.FirstOrDefault(g => string.Equals(g.Id, sys.Id, StringComparison.Ordinal))
                ?? throw new RulePackException(
                    $"drawTools.systems[\"{sys.Id}\"] không khớp layerMap.groups[].id nào — tên hệ đã trôi khỏi layerMap.");

            var targets = new HashSet<string>(group.Branches.Select(b => b.Target), StringComparer.Ordinal);
            if (sys.Lines.Count == 0)
                throw new RulePackException($"drawTools.systems[\"{sys.Id}\"] không khai loại tuyến nào (lines rỗng).");

            foreach (var line in sys.Lines)
            {
                // (b) layer tim phải là target của ĐÚNG nhóm này — không khai trùng tên layer ở drawTools.
                if (!targets.Contains(line.Layer))
                {
                    throw new RulePackException(
                        $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: layer \"{line.Layer}\" không phải " +
                        $"branches[].target của nhóm layerMap \"{sys.Id}\" (hợp lệ: {string.Join(", ", targets)}).");
                }

                // (c) itemId phải có thật trong takeoff.
                if (!itemIds.Contains(line.ItemId))
                {
                    throw new RulePackException(
                        $"drawTools.systems[\"{sys.Id}\"]: itemId \"{line.ItemId}\" không có trong takeoff.items — " +
                        "tuyến vẽ ra sẽ không bóc được khối lượng.");
                }

                if (line.EdgeStyle is not ("double" or "none"))
                {
                    throw new RulePackException(
                        $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: edgeStyle lạ \"{line.EdgeStyle}\" " +
                        "(chỉ nhận \"double\" hoặc \"none\").");
                }
                if (line.Sizes.Count == 0)
                {
                    throw new RulePackException(
                        $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: sizes rỗng — không có size nào để chọn.");
                }
                if (line.SleeveClearanceMm is <= 0)
                {
                    throw new RulePackException(
                        $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: sleeveClearanceMm phải dương.");
                }

                // Nếu khai supportSpacingMm thì kiểm: số chung phải > 0; map phải có entry > 0 cho mỗi size
                if (line.SupportSpacingMm is { } el)
                {
                    switch (el.ValueKind)
                    {
                        case JsonValueKind.Number:
                            var commonValue = el.GetDouble();
                            if (commonValue <= 0)
                            {
                                throw new RulePackException(
                                    $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: supportSpacingMm (số chung) phải dương.");
                            }
                            break;
                        case JsonValueKind.Object:
                            foreach (var size in line.Sizes)
                            {
                                if (!el.TryGetProperty(size, out var val) || val.ValueKind != JsonValueKind.Number || val.GetDouble() <= 0)
                                {
                                    throw new RulePackException(
                                        $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"]: supportSpacingMm thiếu hoặc ≤ 0 với size \"{size}\".");
                                }
                            }
                            break;
                    }
                }

                // (d) layer biên KHÔNG được khớp bất kỳ takeoff.layerMatchAny nào (FR4) — nếu khớp thì
                // nét biên bị bóc thành khối lượng, tuyến đếm đôi. Dùng CHÍNH TokenMatcher của takeoff.
                var layerBien = line.Layer + drawTools.EdgeLayerSuffix;
                foreach (var item in pack.Takeoff.Items)
                {
                    if (item.LayerMatchAny.Count > 0 && TokenMatcher.MatchesAny(layerBien, item.LayerMatchAny))
                    {
                        throw new RulePackException(
                            $"Layer nét biên \"{layerBien}\" khớp takeoff item \"{item.Id}\" (layerMatchAny) — " +
                            "nét biên sẽ bị bóc trùng khối lượng. Đổi drawTools.edgeLayerSuffix (M100 FR4).");
                    }
                }
            }
        }

        // (e) phụ kiện nặng (v7) phải là id có thật trong fittings của một hệ nào đó — khai lệch
        // thì XBOSS_VE_GIADO lặng lẽ không đặt giá đỡ ở van (đúng chỗ nguy hiểm nhất), không ai biết.
        var moiPhuKien = new HashSet<string>(
            drawTools.Systems.SelectMany(s => s.Fittings), StringComparer.Ordinal);
        foreach (var id in drawTools.HeavyFittingIds)
        {
            if (string.IsNullOrWhiteSpace(id))
                throw new RulePackException("drawTools.heavyFittingIds có phần tử rỗng.");
            if (!moiPhuKien.Contains(id))
            {
                throw new RulePackException(
                    $"drawTools.heavyFittingIds[\"{id}\"] không có trong fittings của hệ nào — " +
                    "id phụ kiện đã trôi khỏi drawTools.systems[].fittings (M100 §6.7).");
            }
        }

        // (f) titleblockId khai thì phải khác rỗng (khai nửa vời = XBOSS_VE_TRANGIN chèn khung tên rỗng).
        if (sheetSetup.TitleblockId is { } tb && string.IsNullOrWhiteSpace(tb))
            throw new RulePackException("sheetSetup.titleblockId khai rồi nhưng để rỗng.");
    }
}
