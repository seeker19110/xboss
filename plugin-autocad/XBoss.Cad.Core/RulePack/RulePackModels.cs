using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.RulePack;

/// <summary>
/// Model rule pack v2 (hợp đồng M99 §10/§11). Chỉ model các field plugin DÙNG;
/// các field mô tả (source/note/…) được bỏ qua khi parse — v3 thêm field mới
/// sẽ không làm vỡ plugin v2 (mở rộng thuần). Field đã model thì kiểu phải đúng,
/// sai kiểu → JsonException, thiếu/vô nghĩa → RulePackException khi Validate().
/// </summary>
public sealed class CadRulePack
{
    [JsonPropertyName("version")] public string Version { get; init; } = "";
    [JsonPropertyName("layerMap")] public LayerMapSection LayerMap { get; init; } = new();
    [JsonPropertyName("fontMap")] public FontMapSection FontMap { get; init; } = new();
    [JsonPropertyName("purgePolicy")] public PurgePolicySection PurgePolicy { get; init; } = new();
    [JsonPropertyName("lineweightMap")] public LineweightMapSection LineweightMap { get; init; } = new();
    [JsonPropertyName("flattenPolicy")] public FlattenPolicySection FlattenPolicy { get; init; } = new();
    [JsonPropertyName("takeoff")] public TakeoffSection Takeoff { get; init; } = new();
    [JsonPropertyName("inspectionPolicy")] public InspectionPolicySection InspectionPolicy { get; init; } = new();
}

public sealed class LayerMapSection
{
    [JsonPropertyName("matching")] public string Matching { get; init; } = "";
    [JsonPropertyName("strategy")] public string Strategy { get; init; } = "";
    [JsonPropertyName("fallback")] public string Fallback { get; init; } = "";
    [JsonPropertyName("groups")] public IReadOnlyList<LayerGroup> Groups { get; init; } = [];
}

public sealed class LayerGroup
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("matchAny")] public IReadOnlyList<string> MatchAny { get; init; } = [];
    [JsonPropertyName("branches")] public IReadOnlyList<LayerBranch> Branches { get; init; } = [];
}

public sealed class LayerBranch
{
    /// <summary>Null = nhánh mặc định (default=true trong JSON).</summary>
    [JsonPropertyName("matchAny")] public IReadOnlyList<string>? MatchAny { get; init; }
    [JsonPropertyName("default")] public bool Default { get; init; }
    [JsonPropertyName("target")] public string Target { get; init; } = "";
}

public sealed class FontMapSection
{
    [JsonPropertyName("tcvn3")] public Tcvn3Section Tcvn3 { get; init; } = new();
    [JsonPropertyName("vni")] public VniSection Vni { get; init; } = new();
    [JsonPropertyName("cadSymbols")] public IReadOnlyList<IReadOnlyList<string>> CadSymbols { get; init; } = [];
    [JsonPropertyName("normalization")] public string Normalization { get; init; } = "NFC";

    /// <summary>
    /// v3: font Unicode đích cho kiểu chữ ĐÃ giải mã. Rule pack v2 không có field này —
    /// khi đó <see cref="TargetFontSection.TypeFace"/> rỗng và plugin bỏ qua bước đổi font
    /// (giữ nguyên hành vi cũ, không tự chế font).
    /// </summary>
    [JsonPropertyName("targetFont")] public TargetFontSection TargetFont { get; init; } = new();
}

public sealed class TargetFontSection
{
    [JsonPropertyName("typeFace")] public string TypeFace { get; init; } = "";
    [JsonPropertyName("note")] public string Note { get; init; } = "";
}

public sealed class Tcvn3Section
{
    [JsonPropertyName("mode")] public string Mode { get; init; } = "";
    [JsonPropertyName("chars")] public IReadOnlyDictionary<string, string> Chars { get; init; } =
        new Dictionary<string, string>();
}

public sealed class VniSection
{
    [JsonPropertyName("mode")] public string Mode { get; init; } = "";
    /// <summary>Cặp [chuỗi cũ, chuỗi Unicode] — THỨ TỰ là hợp đồng (a61 phải đứng trước a6).</summary>
    [JsonPropertyName("pairs")] public IReadOnlyList<IReadOnlyList<string>> Pairs { get; init; } = [];
}

public sealed class PurgePolicySection
{
    [JsonPropertyName("purgeUnusedLayers")] public bool PurgeUnusedLayers { get; init; }
    [JsonPropertyName("purgeUnusedBlocks")] public bool PurgeUnusedBlocks { get; init; }
    [JsonPropertyName("audit")] public bool Audit { get; init; }
    [JsonPropertyName("keepReferenced")] public bool KeepReferenced { get; init; }
    [JsonPropertyName("deepPurge")] public DeepPurgePolicy DeepPurge { get; init; } = new();
}

public sealed class DeepPurgePolicy
{
    [JsonPropertyName("removeZeroLengthLines")] public bool RemoveZeroLengthLines { get; init; }
    [JsonPropertyName("zeroLengthToleranceMm")] public double ZeroLengthToleranceMm { get; init; }
    [JsonPropertyName("removeDuplicateOverlappingLines")] public bool RemoveDuplicateOverlappingLines { get; init; }
    [JsonPropertyName("reportEmptyLayers")] public bool ReportEmptyLayers { get; init; }
    [JsonPropertyName("reportAnonymousBlocks")] public bool ReportAnonymousBlocks { get; init; }
}

public sealed class LineweightMapSection
{
    [JsonPropertyName("unit")] public string Unit { get; init; } = "";
    [JsonPropertyName("byAci")] public IReadOnlyList<AciLineweight> ByAci { get; init; } = [];
}

public sealed class AciLineweight
{
    [JsonPropertyName("aci")] public int Aci { get; init; }
    [JsonPropertyName("colorHex")] public string ColorHex { get; init; } = "";
    [JsonPropertyName("lineweightMm")] public double LineweightMm { get; init; }
    [JsonPropertyName("screeningPct")] public int ScreeningPct { get; init; }
}

public sealed class FlattenPolicySection
{
    [JsonPropertyName("targetElevation")] public double TargetElevation { get; init; }
    [JsonPropertyName("preserveXyProjection")] public bool PreserveXyProjection { get; init; }
    [JsonPropertyName("coordinateSystem")] public string CoordinateSystem { get; init; } = "";
    [JsonPropertyName("unit")] public string Unit { get; init; } = "";
}

public sealed class TakeoffSection
{
    [JsonPropertyName("drawingUnitAssumption")] public string DrawingUnitAssumption { get; init; } = "";
    [JsonPropertyName("markColorAci")] public int MarkColorAci { get; init; }
    [JsonPropertyName("xdataAppName")] public string XdataAppName { get; init; } = "";
    [JsonPropertyName("rounding")] public TakeoffRounding Rounding { get; init; } = new();
    [JsonPropertyName("items")] public IReadOnlyList<TakeoffItem> Items { get; init; } = [];
}

public sealed class TakeoffRounding
{
    [JsonPropertyName("length")] public int Length { get; init; }
    [JsonPropertyName("area")] public int Area { get; init; }
    [JsonPropertyName("count")] public int Count { get; init; }
}

/// <summary>Loại phép đo của một item bóc tách.</summary>
public enum TakeoffMeasure
{
    Length,
    Area,
    Count,
}

public sealed class TakeoffItem
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("group")] public string Group { get; init; } = "";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("spec")] public string Spec { get; init; } = "";
    [JsonPropertyName("unit")] public string Unit { get; init; } = "";
    [JsonPropertyName("measure")] public string Measure { get; init; } = "";
    /// <summary>Rỗng = mọi layer (chỉ hợp lệ cho count có blockNameMatchAny — loader kiểm).</summary>
    [JsonPropertyName("layerMatchAny")] public IReadOnlyList<string> LayerMatchAny { get; init; } = [];
    [JsonPropertyName("blockNameMatchAny")] public IReadOnlyList<string>? BlockNameMatchAny { get; init; }
    [JsonPropertyName("factor")] public double Factor { get; init; }
    [JsonPropertyName("boqCode")] public string BoqCode { get; init; } = "";

    [JsonIgnore]
    public TakeoffMeasure MeasureKind => Measure switch
    {
        "length" => TakeoffMeasure.Length,
        "area" => TakeoffMeasure.Area,
        "count" => TakeoffMeasure.Count,
        _ => throw new RulePackException($"takeoff item \"{Id}\": measure lạ \"{Measure}\" (chỉ nhận length/area/count)"),
    };
}

public sealed class InspectionPolicySection
{
    [JsonPropertyName("zToleranceMm")] public double ZToleranceMm { get; init; }
    [JsonPropertyName("openPolyline")] public OpenPolylinePolicy OpenPolyline { get; init; } = new();
}

public sealed class OpenPolylinePolicy
{
    [JsonPropertyName("checkLayersFromAreaTakeoff")] public bool CheckLayersFromAreaTakeoff { get; init; }
    [JsonPropertyName("extraLayersMatchAny")] public IReadOnlyList<string> ExtraLayersMatchAny { get; init; } = [];
    [JsonPropertyName("nearGapToleranceMm")] public double NearGapToleranceMm { get; init; }
    [JsonPropertyName("reportNearClosedOnAllLayers")] public bool ReportNearClosedOnAllLayers { get; init; }
}

/// <summary>Rule pack không hợp lệ — thông điệp tiếng Việt, hiện thẳng cho kỹ sư trong AutoCAD.</summary>
public sealed class RulePackException(string message) : Exception(message);
