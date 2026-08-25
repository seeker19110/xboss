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

    /// <summary>
    /// M101 PR4: dự án mà bản pack này đã gán mã BOQ (<c>takeoff.items[].boqCode</c>). CHỈ có mặt
    /// khi plugin hỏi kèm <c>?project=</c>; <c>null</c> = bản toàn cục (mã BOQ như trong tệp gốc).
    /// Đây là DẤU của máy chủ, dùng làm khoá cất cache — plugin không tự gán theo cái nó hỏi.
    /// </summary>
    [JsonPropertyName("projectId")] public long? ProjectId { get; init; }

    [JsonPropertyName("layerMap")] public LayerMapSection LayerMap { get; init; } = new();
    [JsonPropertyName("fontMap")] public FontMapSection FontMap { get; init; } = new();
    [JsonPropertyName("purgePolicy")] public PurgePolicySection PurgePolicy { get; init; } = new();
    [JsonPropertyName("lineweightMap")] public LineweightMapSection LineweightMap { get; init; } = new();
    [JsonPropertyName("flattenPolicy")] public FlattenPolicySection FlattenPolicy { get; init; } = new();
    [JsonPropertyName("takeoff")] public TakeoffSection Takeoff { get; init; } = new();
    [JsonPropertyName("inspectionPolicy")] public InspectionPolicySection InspectionPolicy { get; init; } = new();

    /// <summary>
    /// v5: bộ style chuẩn (M101 §6.1 phép kiểm 14 + §6.2 bước chuẩn hóa 8) — khai một lần, dùng
    /// chung cho kiểm lẫn sửa. Rule pack ≤ v4 không có khối này → tên chuẩn rỗng → phép kiểm 14
    /// tự tắt (hành vi y hệt v4).
    /// </summary>
    [JsonPropertyName("styleMap")] public StyleMapSection StyleMap { get; init; } = new();

    // ===== v7 (M101 §6.2) — chính sách 3 bước chuẩn hóa mới 9/10/11. Bước 8 KHÔNG có khối riêng:
    // nó dùng lại chính StyleMap ở trên (khai một lần, kiểm và sửa không thể trôi khỏi nhau).
    // Rule pack ≤ v6 không có các khối này → mọi Enabled = false → pipeline chạy y hệt v6.

    /// <summary>Bước 9 — chính sách xref (mặc định chỉ BÁO, không bind).</summary>
    [JsonPropertyName("xrefPolicy")] public XrefPolicySection XrefPolicy { get; init; } = new();

    /// <summary>Bước 10 — mẫu hatch + tỉ lệ theo layer.</summary>
    [JsonPropertyName("hatchMap")] public HatchMapSection HatchMap { get; init; } = new();

    /// <summary>Bước 11 — dọn layout rỗng / đặt lại tên layout.</summary>
    [JsonPropertyName("layoutPolicy")] public LayoutPolicySection LayoutPolicy { get; init; } = new();

    // ===== v8 (M102 §6.1/§6.2) — chính sách 2 bước chuẩn hóa mới 12/13.
    // Rule pack ≤ v7 không có các khối này → mọi Enabled = false → pipeline chạy y hệt v7.

    /// <summary>Bước 12 — đóng polyline gần kín (khe ≤ ngưỡng).</summary>
    [JsonPropertyName("polylineClosePolicy")] public PolylineClosePolicySection PolylineClosePolicy { get; init; } = new();

    /// <summary>Bước 13 — quy block lạc chuẩn về thư viện block (mặc định chỉ BÁO).</summary>
    [JsonPropertyName("blockMap")] public BlockMapSection BlockMap { get; init; } = new();

    /// Phần <c>drawTools</c> (v4+) mà lớp ánh xạ layer cần biết. <c>null</c> với rule pack v1–v3.
    /// Model ĐẦY ĐỦ của khối này nằm ở <c>Draw/DrawToolsConfig.cs</c> (bộ lệnh vẽ M100) — ở đây
    /// chỉ đọc đúng field mà <see cref="Layers.LayerMapper"/> dùng, để nạp rule pack cũ không vỡ.
    /// </summary>
    [JsonPropertyName("drawTools")] public DrawToolsLayerNaming? DrawTools { get; init; }
}

/// <summary>Tên layer sinh ra từ bộ lệnh vẽ (M100 §11) — phần liên quan tới ánh xạ layer.</summary>
public sealed class DrawToolsLayerNaming
{
    /// <summary>Hậu tố layer nét biên: layer biên = layer tim + hậu tố này (M100 FR4).</summary>
    [JsonPropertyName("edgeLayerSuffix")] public string? EdgeLayerSuffix { get; init; }
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

    // ===== v6 (M101 §6.3) — mọi khóa dưới đây TÙY CHỌN, vắng mặt = tắt/0 = bóc y hệt v5 =====

    /// <summary>Tách kết quả thành nhiều dòng theo size từng đoạn (nguồn: XData XBOSS_VE hoặc nhãn gần tuyến).</summary>
    [JsonPropertyName("groupBySize")] public bool GroupBySize { get; init; }

    /// <summary>Đọc size từ nhãn text gần tuyến khi đoạn không có XData size — bán tự động, có ghi nguồn.</summary>
    [JsonPropertyName("sizeFromNearbyText")] public SizeFromTextPolicy? SizeFromNearbyText { get; init; }

    /// <summary>% hao hụt thi công (item đo dài/diện tích) — chỉ ra cột KL QUY ĐỔI, không trộn vào KL đo.</summary>
    [JsonPropertyName("wastagePct")] public double WastagePct { get; init; }

    /// <summary>Số mét tương đương cộng thêm mỗi đơn vị đếm (item measure=count) — cũng chỉ ra cột KL QUY ĐỔI.</summary>
    [JsonPropertyName("perCountAdd")] public double PerCountAdd { get; init; }

    /// <summary>Id item nguồn — item này được TÍNH RA từ item đó (cách nhiệt), không khớp đối tượng nào.</summary>
    [JsonPropertyName("derivedFrom")] public string DerivedFrom { get; init; } = "";

    /// <summary>Công thức dẫn xuất: <c>perimeter*length</c> (ống gió chữ nhật) hoặc <c>pi*dn*length</c> (ống tròn).</summary>
    [JsonPropertyName("formula")] public string Formula { get; init; } = "";

    /// <summary>Item được tính ra từ item khác (không quét bản vẽ).</summary>
    [JsonIgnore]
    public bool LaDanXuat => !string.IsNullOrWhiteSpace(DerivedFrom);

    [JsonIgnore]
    public CongThucDanXuat FormulaKind => Formula switch
    {
        "perimeter*length" => CongThucDanXuat.ChuViNhanDai,
        "pi*dn*length" => CongThucDanXuat.PiDnNhanDai,
        _ => throw new RulePackException(
            $"takeoff item \"{Id}\": formula lạ \"{Formula}\" (chỉ nhận perimeter*length / pi*dn*length)"),
    };

    [JsonIgnore]
    public TakeoffMeasure MeasureKind => Measure switch
    {
        "length" => TakeoffMeasure.Length,
        "area" => TakeoffMeasure.Area,
        "count" => TakeoffMeasure.Count,
        _ => throw new RulePackException($"takeoff item \"{Id}\": measure lạ \"{Measure}\" (chỉ nhận length/area/count)"),
    };
}

/// <summary>Công thức của item dẫn xuất (cách nhiệt) — M101 §6.3.</summary>
public enum CongThucDanXuat
{
    /// <summary>Ống gió chữ nhật: 2×(W+H) × chiều dài.</summary>
    ChuViNhanDai,
    /// <summary>Ống tròn: π × DN × chiều dài.</summary>
    PiDnNhanDai,
}

/// <summary>Đọc size từ nhãn text gần tuyến (v6) — bán tự động, ngưỡng khoảng cách chặt.</summary>
public sealed class SizeFromTextPolicy
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
    /// <summary>Bán kính tìm nhãn (mm thật của bản vẽ, đã quy đổi từ INSUNITS).</summary>
    [JsonPropertyName("maxDistanceMm")] public double MaxDistanceMm { get; init; }
    /// <summary>Regex .NET; có nhóm bắt thì lấy nhóm 1, không thì lấy cả chuỗi khớp.</summary>
    [JsonPropertyName("sizePatterns")] public IReadOnlyList<string> SizePatterns { get; init; } = [];
}

public sealed class InspectionPolicySection
{
    [JsonPropertyName("zToleranceMm")] public double ZToleranceMm { get; init; }
    [JsonPropertyName("openPolyline")] public OpenPolylinePolicy OpenPolyline { get; init; } = new();

    // v5 (M101 §6.1) — 7 phép kiểm mới, MỖI phép một khối có cờ enabled riêng, mặc định false.
    // Rule pack ≤ v4 không có các khối này → mọi Enabled = false → Inspector chạy y hệt v4.
    [JsonPropertyName("overlapSameSystem")] public OverlapCheckPolicy OverlapSameSystem { get; init; } = new();
    [JsonPropertyName("clash2d")] public Clash2dCheckPolicy Clash2d { get; init; } = new();
    [JsonPropertyName("titleblockFields")] public TitleblockCheckPolicy TitleblockFields { get; init; } = new();
    [JsonPropertyName("viewportScale")] public ViewportCheckPolicy ViewportScale { get; init; } = new();
    [JsonPropertyName("styleDeviation")] public ToggleCheckPolicy StyleDeviation { get; init; } = new();
    [JsonPropertyName("labelSizeMismatch")] public ToggleCheckPolicy LabelSizeMismatch { get; init; } = new();
    [JsonPropertyName("strayObjects")] public StrayCheckPolicy StrayObjects { get; init; } = new();

    // v8 (M102 §6.4/§6.5) — 2 phép kiểm mới, cùng quy ước: cờ enabled riêng, mặc định false,
    // và còn TỰ TẮT khi thiếu dữ liệu đầu vào (tag XData M100 / boqCode rule pack theo dự án).
    [JsonPropertyName("tagDuplicate")] public ToggleCheckPolicy TagDuplicate { get; init; } = new();
    [JsonPropertyName("boqCodeMissing")] public ToggleCheckPolicy BoqCodeMissing { get; init; } = new();
}

/// <summary>Phép kiểm chỉ có cờ bật/tắt (tham số nằm ở khối khác — vd styleMap).</summary>
public class ToggleCheckPolicy
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
}

/// <summary>Phép kiểm 10 — chồng lấn tuyến cùng hệ.</summary>
public sealed class OverlapCheckPolicy : ToggleCheckPolicy
{
    /// <summary>Bề rộng dải coi là "song song trùng nhau" (mm).</summary>
    [JsonPropertyName("overlapToleranceMm")] public double OverlapToleranceMm { get; init; }
    /// <summary>Chiều dài chồng lấn tối thiểu mới báo (mm) — chống báo oan chỗ hai tuyến chỉ chạm nhau.</summary>
    [JsonPropertyName("overlapMinLengthMm")] public double OverlapMinLengthMm { get; init; }
}

/// <summary>Phép kiểm 11 — giao cắt khác hệ trên mặt bằng (KHÔNG thay được clash 3D).</summary>
public sealed class Clash2dCheckPolicy : ToggleCheckPolicy
{
    /// <summary>Các cặp id hệ (layerMap.groups[].id) cần soi giao cắt; rỗng = không kiểm cặp nào.</summary>
    [JsonPropertyName("clashPairs")] public IReadOnlyList<IReadOnlyList<string>> ClashPairs { get; init; } = [];
}

/// <summary>Phép kiểm 12 — khung tên thiếu/sai trường.</summary>
public sealed class TitleblockCheckPolicy : ToggleCheckPolicy
{
    /// <summary>Nhận diện khung tên theo tên block khi chưa có manifest M100 (khớp ranh giới token).</summary>
    [JsonPropertyName("titleblockNameMatchAny")] public IReadOnlyList<string> TitleblockNameMatchAny { get; init; } = [];
    /// <summary>Tag attribute bắt buộc phải có và khác rỗng.</summary>
    [JsonPropertyName("requiredAttributes")] public IReadOnlyList<string> RequiredAttributes { get; init; } = [];
}

/// <summary>Phép kiểm 13 — viewport không khóa / tỉ lệ lạ.</summary>
public sealed class ViewportCheckPolicy : ToggleCheckPolicy
{
    [JsonPropertyName("requireLocked")] public bool RequireLocked { get; init; }
    /// <summary>Mẫu số tỉ lệ 1:X hợp lệ; rỗng = không kiểm tỉ lệ (chỉ kiểm khóa).</summary>
    [JsonPropertyName("scales")] public IReadOnlyList<double> Scales { get; init; } = [];
}

/// <summary>Phép kiểm 16 — đối tượng ngoài khung.</summary>
public sealed class StrayCheckPolicy : ToggleCheckPolicy
{
    /// <summary>Ngưỡng = hệ số này × đường chéo bao chính.</summary>
    [JsonPropertyName("strayDistanceFactor")] public double StrayDistanceFactor { get; init; }
    /// <summary>Ít hơn ngần này thực thể có hình bao thì bỏ qua (không đủ dữ liệu để dựng bao chính).</summary>
    [JsonPropertyName("minEntitiesForExtents")] public int MinEntitiesForExtents { get; init; }
}

/// <summary>
/// Bộ style chuẩn (v5) — dùng chung giữa phép kiểm 14 và bước chuẩn hóa 8 (PR2).
/// Tên chuẩn rỗng = chưa chốt bộ chuẩn → cả hai bên bỏ qua.
/// </summary>
public sealed class StyleMapSection
{
    [JsonPropertyName("textStyle")] public TextStyleStandard TextStyle { get; init; } = new();
    [JsonPropertyName("dimStyle")] public DimStyleStandard DimStyle { get; init; } = new();
}

public sealed class TextStyleStandard
{
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("fontFile")] public string FontFile { get; init; } = "";
    /// <summary>0 = kiểu chữ không cố định chiều cao (chiều cao đặt trên từng đối tượng).</summary>
    [JsonPropertyName("fixedHeightMm")] public double FixedHeightMm { get; init; }
    [JsonPropertyName("widthFactor")] public double WidthFactor { get; init; }
    /// <summary>Style chấp nhận được ngoài style chuẩn — không báo lệch, không đổi khi chuẩn hóa.</summary>
    [JsonPropertyName("acceptAlso")] public IReadOnlyList<string> AcceptAlso { get; init; } = [];
}

public sealed class DimStyleStandard
{
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    /// <summary>Kiểu chữ mà dimstyle chuẩn dùng — phải nằm trong textStyle.name/acceptAlso.</summary>
    [JsonPropertyName("textStyleName")] public string TextStyleName { get; init; } = "";
    [JsonPropertyName("acceptAlso")] public IReadOnlyList<string> AcceptAlso { get; init; } = [];
}

/// <summary>Bước chuẩn hóa 9 (v7) — tham chiếu ngoài. Mặc định tắt; bật lên vẫn KHÔNG bind
/// trừ khi <see cref="BindMatchAny"/> khai tên xref cụ thể (M101 §6.2).</summary>
public sealed class XrefPolicySection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
    /// <summary><c>relative</c> = tương đối hóa đường dẫn tuyệt đối; <c>keep</c> = giữ nguyên, chỉ báo.</summary>
    [JsonPropertyName("pathPolicy")] public string PathPolicy { get; init; } = "";
    /// <summary>Từ khóa tên xref được phép bind (ranh giới token). Rỗng = không bind xref nào.</summary>
    [JsonPropertyName("bindMatchAny")] public IReadOnlyList<string> BindMatchAny { get; init; } = [];

    /// <summary>Có tương đối hóa đường dẫn không (chính sách đã bật và pathPolicy = relative).</summary>
    [JsonIgnore]
    public bool TuongDoiHoa => Enabled && string.Equals(PathPolicy, "relative", StringComparison.Ordinal);
}

/// <summary>Bước chuẩn hóa 10 (v7) — mẫu hatch + tỉ lệ theo layer.</summary>
public sealed class HatchMapSection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
    /// <summary>First-match theo thứ tự khai (cùng triết lý layerMap/takeoff).</summary>
    [JsonPropertyName("byLayer")] public IReadOnlyList<HatchRule> ByLayer { get; init; } = [];
}

public sealed class HatchRule
{
    [JsonPropertyName("layerMatchAny")] public IReadOnlyList<string> LayerMatchAny { get; init; } = [];
    [JsonPropertyName("pattern")] public string Pattern { get; init; } = "";
    [JsonPropertyName("scale")] public double Scale { get; init; }
}

/// <summary>Bước chuẩn hóa 11 (v7) — dọn layout.</summary>
public sealed class LayoutPolicySection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
    /// <summary>Xóa layout không viewport thật và không đối tượng nào.</summary>
    [JsonPropertyName("removeEmpty")] public bool RemoveEmpty { get; init; }
    /// <summary>Đặt lại tên layout theo <see cref="NamePattern"/> — mặc định TẮT (tên layout đi vào hồ sơ đã nộp).</summary>
    [JsonPropertyName("renameLayouts")] public bool RenameLayouts { get; init; }
    /// <summary>Bắt buộc chứa <c>{seq}</c> (đánh 2 chữ số) khi <see cref="RenameLayouts"/> bật.</summary>
    [JsonPropertyName("namePattern")] public string NamePattern { get; init; } = "";
}

/// <summary>
/// Bước chuẩn hóa 12 (v8) — đóng polyline gần kín. Khe LỚN hơn ngưỡng cố ý KHÔNG đụng tới:
/// đó thường là thiếu hẳn một đoạn tuyến chứ không phải thiếu một cú click, đoán bừa là sai hình học
/// (phép kiểm 3 vẫn báo như cũ để kỹ sư tự xử).
/// </summary>
public sealed class PolylineClosePolicySection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>Khe đầu–cuối tối đa (mm) còn được tự đóng.</summary>
    [JsonPropertyName("gapCloseToleranceMm")] public double GapCloseToleranceMm { get; init; }

    /// <summary>Giới hạn theo layer (ranh giới token). Rỗng = mọi layer.</summary>
    [JsonPropertyName("onlyOnLayersMatchAny")] public IReadOnlyList<string> OnlyOnLayersMatchAny { get; init; } = [];

    /// <summary>Chỉ liệt kê vào báo cáo, không sửa entity nào.</summary>
    [JsonPropertyName("reportOnly")] public bool ReportOnly { get; init; }
}

/// <summary>
/// Bước chuẩn hóa 13 (v8) — quy block lạc chuẩn về thư viện block. Mặc định <see cref="ReportOnly"/>
/// = true kể cả khi bật: thay định nghĩa block là thao tác phá hủy (attribute lệch tag, hình học
/// khác), bản đầu chỉ BÁO để kỹ sư quyết (M102 §6.2).
/// </summary>
public sealed class BlockMapSection
{
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }
    [JsonPropertyName("reportOnly")] public bool ReportOnly { get; init; } = true;
    [JsonPropertyName("rules")] public IReadOnlyList<BlockMapRule> Rules { get; init; } = [];
}

public sealed class BlockMapRule
{
    /// <summary>Tên block đích — phải là block CÓ THẬT trong thư viện đã phát hành (M100 PR2).</summary>
    [JsonPropertyName("target")] public string Target { get; init; } = "";

    /// <summary>Từ khóa tên block cũ, khớp theo ranh giới token (không substring thô).</summary>
    [JsonPropertyName("aliasMatchAny")] public IReadOnlyList<string> AliasMatchAny { get; init; } = [];
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
