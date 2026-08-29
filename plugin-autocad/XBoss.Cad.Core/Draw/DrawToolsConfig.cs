using System.Globalization;
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

    /// <summary>
    /// Chính sách ngắt nét giao chéo (M109 §5, rule pack v13 trở đi). null = rule pack cũ chưa khai
    /// ⇒ lệnh <c>XBOSS_VE_NGATNET</c> TỪ CHỐI chạy kèm thông báo, không đoán mặc định ngầm.
    /// </summary>
    [JsonPropertyName("crossingPolicy")] public CrossingPolicySection? CrossingPolicy { get; init; }

    /// <summary>
    /// Tham số nhân bản tầng điển hình (M111 §4, rule pack v12 trở đi). null = rule pack cũ chưa
    /// khai ⇒ <c>XBOSS_VE_NHANTANG</c> từ chối chạy kèm thông báo, không đoán mặc định ngầm.
    /// </summary>
    [JsonPropertyName("floorPolicy")] public FloorPolicySection? FloorPolicy { get; init; }

    /// <summary>Rule pack có khai (dù rỗng) danh sách phụ kiện nặng chưa — phân biệt "khai rỗng
    /// = không phụ kiện nào nặng" với "chưa khai = phải hỏi kỹ sư".</summary>
    [JsonIgnore] public bool CoKhaiPhuKienNang => HeavyFittingIds.Count > 0;

    /// <summary>
    /// Tham số revision cloud (M110 §5, rule pack v12 trở đi). <c>null</c> = rule pack cũ chưa khai ⇒
    /// 3 lệnh <c>XBOSS_VE_REV*</c> dừng kèm thông báo, không đoán mặc định ngầm.
    /// </summary>
    [JsonPropertyName("revisionPolicy")] public RevisionPolicySection? RevisionPolicy { get; init; }

    /// <summary>Block phụ kiện (theo id manifest) có phải phụ kiện nặng không.</summary>
    public bool LaPhuKienNang(string? blockId) =>
        blockId is { Length: > 0 } id &&
        HeavyFittingIds.Any(h => string.Equals(h, id, StringComparison.Ordinal));
}

/// <summary>
/// Khối <c>drawTools.revisionPolicy</c> (M110 §5) — tham số revision cloud dùng chung cho 3 lệnh
/// <c>XBOSS_VE_REV</c>/<c>_CHOT</c>/<c>_HIENTHI</c>. Mặc định <see cref="Enabled"/> = false: rule pack
/// khai rồi nhưng chưa bật thì lệnh vẫn dừng kèm hướng dẫn cách bật (AC8).
/// </summary>
public sealed class RevisionPolicySection
{
    /// <summary>Chỗ giữ số revision trong mọi mẫu chuỗi của khối này.</summary>
    public const string OTrongSo = "{n}";

    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>Chiều dài cung cloud ở tỉ lệ 1:1 (mm) — nhân <c>VeContext.TiLeIn</c> khi vẽ.</summary>
    [JsonPropertyName("cloudArcMm")] public double CloudArcMm { get; init; }

    /// <summary>Layer đặt cloud + tam giác (mỗi revision còn một layer con <c>&lt;layer&gt;-R{n}</c> — FR6).</summary>
    [JsonPropertyName("layer")] public string Layer { get; init; } = "";

    /// <summary>Id block <c>kind=annotation</c> của tam giác revision trong manifest thư viện.</summary>
    [JsonPropertyName("triangleBlockId")] public string TriangleBlockId { get; init; } = "";

    /// <summary>Mẫu số revision, BẮT BUỘC chứa <see cref="OTrongSo"/> (vd <c>R{n}</c>).</summary>
    [JsonPropertyName("numberFormat")] public string NumberFormat { get; init; } = "";

    /// <summary>Mẫu tên attribute bảng revision trong khung tên.</summary>
    [JsonPropertyName("titleblockAttrPattern")]
    public TitleblockAttrPattern TitleblockAttrPattern { get; init; } = new();

    /// <summary>Số dòng revision khung tên chứa được — vượt thì DỪNG, không ghi đè dòng cũ (FR4).</summary>
    [JsonPropertyName("maxRows")] public int MaxRows { get; init; }

    /// <summary>Nới bao hình (mm) khi đề xuất vùng khoanh.</summary>
    [JsonPropertyName("boundingPaddingMm")] public double BoundingPaddingMm { get; init; }

    /// <summary>Số revision theo <see cref="NumberFormat"/> (vd <c>R2</c>).</summary>
    public string SoRevision(int n) => NumberFormat.Replace(OTrongSo, n.ToString(CultureInfo.InvariantCulture));

    /// <summary>Chiều dài cung cloud trong mô hình ở tỉ lệ in <paramref name="tiLeIn"/>.</summary>
    public double CungTheoTiLe(double tiLeIn) => CloudArcMm * tiLeIn;
}

/// <summary>Tên 4 attribute một DÒNG revision trong khung tên; <c>{n}</c> = số revision (M110 §5).</summary>
public sealed class TitleblockAttrPattern
{
    [JsonPropertyName("so")] public string So { get; init; } = "";
    [JsonPropertyName("ngay")] public string Ngay { get; init; } = "";
    [JsonPropertyName("noiDung")] public string NoiDung { get; init; } = "";
    [JsonPropertyName("nguoi")] public string Nguoi { get; init; } = "";

    /// <summary>Tên 4 attribute của dòng revision thứ <paramref name="n"/>.</summary>
    public (string So, string Ngay, string NoiDung, string Nguoi) ChoDong(int n)
    {
        var so = n.ToString(CultureInfo.InvariantCulture);
        return (
            So.Replace(RevisionPolicySection.OTrongSo, so),
            Ngay.Replace(RevisionPolicySection.OTrongSo, so),
            NoiDung.Replace(RevisionPolicySection.OTrongSo, so),
            Nguoi.Replace(RevisionPolicySection.OTrongSo, so));
    }
}

/// <summary>
/// Khối <c>drawTools.crossingPolicy</c> (M109 §5) — quy ước TRÌNH BÀY tuyến đi dưới bị ngắt nét tại
/// chỗ giao. KHÔNG phải cao độ thật (M109 §3 non-goals).
/// </summary>
public sealed class CrossingPolicySection
{
    /// <summary>Mặc định false — nạp rule pack mới không đổi hành vi trên máy kỹ sư (AC8).</summary>
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>Hạng trình bày: hệ đứng trước đi TRÊN. Id theo <c>drawTools.systems[].id</c>.</summary>
    [JsonPropertyName("priority")] public IReadOnlyList<string> Priority { get; init; } = [];

    /// <summary><c>wipeout</c> | <c>jog</c> — chỉ để ÉP; mặc định suy theo <c>edgeStyle</c>.</summary>
    [JsonPropertyName("gapMode")] public string GapMode { get; init; } = "";

    /// <summary>Bề rộng che cộng thêm mỗi bên mép biên tuyến đi trên (mm).</summary>
    [JsonPropertyName("clearanceMm")] public double ClearanceMm { get; init; }

    /// <summary>Bán kính cung cầu vượt cho tuyến đơn nét (mm).</summary>
    [JsonPropertyName("jogRadiusMm")] public double JogRadiusMm { get; init; }

    /// <summary>Layer đối tượng ngắt nét = <c>&lt;layer tim&gt;</c> + hậu tố này.</summary>
    [JsonPropertyName("layerSuffix")] public string LayerSuffix { get; init; } = "";

    /// <summary>Góc giao dưới ngưỡng này (độ) thì KHÔNG ngắt nét — báo cáo riêng (FR3).</summary>
    [JsonPropertyName("minAngleDeg")] public double MinAngleDeg { get; init; }
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

    /// <summary>
    /// Tham số chia đốt theo kiểu kết nối (M105 §12, rule pack v9 trở đi). null = tuyến chưa khai ⇒
    /// <c>XBOSS_VE_CHIADOT</c> BỎ QUA tuyến kèm thông báo, không đoán mặc định ngầm (M105 AC10).
    /// </summary>
    [JsonPropertyName("jointRules")] public JointRules? JointRules { get; init; }

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

                // (c2) khối chia đốt (v9) khai rồi thì phải hợp lệ — kể cả layer vạch chia không
                // đụng takeoff (M105 §12/FR5, cùng lớp lỗi với layer nét biên ở (d) bên dưới).
                if (line.JointRules is { } jointRules)
                {
                    var moTa = $"drawTools.systems[\"{sys.Id}\"].lines[\"{line.ItemId}\"].jointRules";
                    JointRulesConfig.Validate(jointRules, JointRulesConfig.DocKieuCo(line.SizeKind), moTa);
                    JointRulesConfig.KiemLayerVachChia(line.Layer, jointRules, pack.Takeoff.Items, moTa);
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

        // (f) khối nhân bản tầng (v12) khai rồi thì phải hợp lệ — kiểm cả khi đang TẮT, để bật lên
        // là dùng được ngay (cùng quy ước các khối chính sách v5–v9).
        if (drawTools.FloorPolicy is { } floorPolicy) FloorReplicator.Validate(floorPolicy);

        // (g) titleblockId khai thì phải khác rỗng (khai nửa vời = XBOSS_VE_TRANGIN chèn khung tên rỗng).
        if (sheetSetup.TitleblockId is { } tb && string.IsNullOrWhiteSpace(tb))
            throw new RulePackException("sheetSetup.titleblockId khai rồi nhưng để rỗng.");

        // (g) chính sách ngắt nét giao chéo (M109 §5) — khai rồi thì phải hợp lệ. Kiểm theo ĐÚNG
        // tập id hệ của drawTools: priority trỏ vào hệ không tồn tại nghĩa là thứ tự trên–dưới của
        // hệ đó lặng lẽ không có hiệu lực (rơi xuống "hệ không khai xếp sau cùng"), không ai biết.
        if (drawTools.CrossingPolicy is { } crossing)
            ValidateCrossingPolicy(crossing, systemIds);

        // (h) khối revision (v14) khai rồi thì phải hợp lệ — cùng bộ luật với validator TS
        // (lib/ky-thuat/cad/rule-pack-revision.ts), M110 §5.
        if (drawTools.RevisionPolicy is { } rev) KiemRevisionPolicy(rev);
    }

    /// <summary>Kiểm khối <c>drawTools.revisionPolicy</c> (M110 §5). Sai → RulePackException tiếng Việt.</summary>
    public static void KiemRevisionPolicy(RevisionPolicySection rev)
    {
        if (rev.CloudArcMm <= 0)
            throw new RulePackException($"drawTools.revisionPolicy.cloudArcMm = {rev.CloudArcMm.ToString(CultureInfo.InvariantCulture)} phải dương.");
        if (!rev.NumberFormat.Contains(RevisionPolicySection.OTrongSo, StringComparison.Ordinal))
        {
            throw new RulePackException(
                $"drawTools.revisionPolicy.numberFormat \"{rev.NumberFormat}\" thiếu {RevisionPolicySection.OTrongSo} — " +
                "mọi revision sẽ mang cùng một số.");
        }
        if (rev.Enabled && string.IsNullOrWhiteSpace(rev.TriangleBlockId))
        {
            throw new RulePackException(
                "drawTools.revisionPolicy.triangleBlockId trống trong khi khối đang bật — " +
                "không biết chèn block tam giác nào.");
        }
        if (rev.MaxRows < 1)
            throw new RulePackException($"drawTools.revisionPolicy.maxRows = {rev.MaxRows.ToString(CultureInfo.InvariantCulture)} phải ≥ 1.");
        if (string.IsNullOrWhiteSpace(rev.Layer))
            throw new RulePackException("drawTools.revisionPolicy.layer trống — không biết đặt cloud lên layer nào.");
        if (rev.BoundingPaddingMm < 0)
            throw new RulePackException($"drawTools.revisionPolicy.boundingPaddingMm = {rev.BoundingPaddingMm.ToString(CultureInfo.InvariantCulture)} không được âm.");

        var mau = rev.TitleblockAttrPattern;
        foreach (var (khoa, giaTri) in new[]
                 {
                     ("so", mau.So), ("ngay", mau.Ngay), ("noiDung", mau.NoiDung), ("nguoi", mau.Nguoi),
                 })
        {
            if (string.IsNullOrWhiteSpace(giaTri))
                throw new RulePackException($"drawTools.revisionPolicy.titleblockAttrPattern.{khoa} trống.");
            if (!giaTri.Contains(RevisionPolicySection.OTrongSo, StringComparison.Ordinal))
            {
                throw new RulePackException(
                    $"drawTools.revisionPolicy.titleblockAttrPattern.{khoa} \"{giaTri}\" thiếu " +
                    $"{RevisionPolicySection.OTrongSo} — mọi dòng revision sẽ ghi đè lên cùng một attribute.");
            }
        }
    }

    /// <summary>
    /// Kiểm riêng khối <c>crossingPolicy</c> (M109 §5) — tầng C# của validator 2 tầng, cặp với
    /// <c>kiemCrossingPolicy()</c> bên TS (<c>lib/ky-thuat/cad/rule-pack.ts</c>). Tách hàm public để
    /// bộ đối chứng <c>plugin-autocad/doi-chung/crossing-doi-chung.json</c> nạp thẳng từng ca mà
    /// không phải dựng cả một rule pack giả.
    /// </summary>
    /// <param name="heHopLe">Tập id hệ hợp lệ = <c>drawTools.systems[].id</c>.</param>
    public static void ValidateCrossingPolicy(CrossingPolicySection cp, IReadOnlyCollection<string> heHopLe)
    {
        foreach (var id in cp.Priority)
        {
            if (!heHopLe.Contains(id))
            {
                throw new RulePackException(
                    $"drawTools.crossingPolicy.priority chứa id hệ lạ \"{id}\" — phải là " +
                    $"drawTools.systems[].id (hợp lệ: {string.Join(", ", heHopLe)}).");
            }
        }

        if (cp.ClearanceMm <= 0 || double.IsNaN(cp.ClearanceMm))
            throw new RulePackException($"drawTools.crossingPolicy.clearanceMm = {cp.ClearanceMm} phải là số dương.");
        if (cp.JogRadiusMm <= 0 || double.IsNaN(cp.JogRadiusMm))
            throw new RulePackException($"drawTools.crossingPolicy.jogRadiusMm = {cp.JogRadiusMm} phải là số dương.");

        // Ngưỡng lọc góc giao — CrossingGeometry.DuGocDeNgat() dùng thẳng giá trị này, số âm/NaN
        // làm mọi góc giao đều "đủ lớn" (ngắt nét cả ca gần song song).
        if (double.IsNaN(cp.MinAngleDeg) || cp.MinAngleDeg <= 0 || cp.MinAngleDeg > 90)
        {
            throw new RulePackException(
                $"drawTools.crossingPolicy.minAngleDeg = {cp.MinAngleDeg} phải nằm trong khoảng (0; 90] — " +
                "đây là ngưỡng lọc góc giao (0..90°), giá trị âm/NaN làm mọi góc đều bị coi là đủ lớn.");
        }

        if (!string.IsNullOrEmpty(cp.GapMode) && cp.GapMode is not ("wipeout" or "jog"))
        {
            throw new RulePackException(
                $"drawTools.crossingPolicy.gapMode lạ \"{cp.GapMode}\" (chỉ nhận \"wipeout\" hoặc \"jog\").");
        }

        if (cp.Enabled && string.IsNullOrWhiteSpace(cp.LayerSuffix))
        {
            throw new RulePackException(
                "drawTools.crossingPolicy.layerSuffix trống trong khi enabled = true — đối tượng ngắt nét " +
                "sẽ rơi vào chính layer tim và lệnh xóa không lọc lại được.");
        }
    }
}
