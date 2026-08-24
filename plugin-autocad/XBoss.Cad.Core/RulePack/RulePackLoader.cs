using System.Text.Json;

namespace XBoss.Cad.Core.RulePack;

/// <summary>
/// Nạp + kiểm rule pack từ JSON (tệp tải qua XBOSS_RULEPACK hoặc response API).
/// Field không model được bỏ qua (v3 mở rộng thuần không làm vỡ v2 — M99 §10);
/// field đã model sai kiểu → lỗi parse; thiếu nội dung bắt buộc → RulePackException
/// với thông điệp tiếng Việt (M99 §12: JSON là dữ liệu, kiểm chặt, không thực thi).
/// </summary>
public static class RulePackLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        // Tên field trong JSON là camelCase và model đã khai JsonPropertyName tường minh —
        // không bật case-insensitive để tránh nhận nhầm field viết sai hoa thường.
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
    };

    public static CadRulePack Load(string json)
    {
        CadRulePack? pack;
        try
        {
            pack = JsonSerializer.Deserialize<CadRulePack>(json, Options);
        }
        catch (JsonException e)
        {
            throw new RulePackException($"Tệp rule pack không phải JSON hợp lệ hoặc sai kiểu dữ liệu: {e.Message}");
        }
        if (pack is null) throw new RulePackException("Tệp rule pack rỗng.");
        Validate(pack);
        return pack;
    }

    public static void Validate(CadRulePack pack)
    {
        if (string.IsNullOrWhiteSpace(pack.Version))
            throw new RulePackException("Rule pack thiếu \"version\".");

        // layerMap
        if (pack.LayerMap.Groups.Count == 0)
            throw new RulePackException("Rule pack thiếu layerMap.groups.");
        if (pack.LayerMap.Fallback != "keep-original")
            throw new RulePackException($"layerMap.fallback lạ \"{pack.LayerMap.Fallback}\" — plugin chỉ hỗ trợ \"keep-original\".");
        foreach (var g in pack.LayerMap.Groups)
        {
            if (g.MatchAny.Count == 0)
                throw new RulePackException($"layerMap group \"{g.Id}\" thiếu matchAny.");
            if (g.Branches.Count == 0 || g.Branches[^1].MatchAny is not null && !g.Branches[^1].Default)
                throw new RulePackException($"layerMap group \"{g.Id}\" phải kết thúc bằng nhánh default.");
            foreach (var b in g.Branches)
            {
                if (string.IsNullOrWhiteSpace(b.Target))
                    throw new RulePackException($"layerMap group \"{g.Id}\" có nhánh thiếu target.");
            }
        }

        // fontMap
        if (pack.FontMap.Tcvn3.Chars.Count == 0)
            throw new RulePackException("Rule pack thiếu fontMap.tcvn3.chars.");
        if (pack.FontMap.Vni.Pairs.Count == 0)
            throw new RulePackException("Rule pack thiếu fontMap.vni.pairs.");
        foreach (var p in pack.FontMap.Vni.Pairs)
        {
            if (p.Count != 2) throw new RulePackException("fontMap.vni.pairs phải là danh sách cặp [cũ, mới].");
        }

        // takeoff (v2)
        var t = pack.Takeoff;
        if (t.Items.Count == 0)
            throw new RulePackException("Rule pack v2 thiếu takeoff.items — không có quy tắc bóc tách nào.");
        if (t.MarkColorAci is < 1 or > 255)
            throw new RulePackException($"takeoff.markColorAci = {t.MarkColorAci} không phải mã màu ACI hợp lệ (1..255).");
        if (string.IsNullOrWhiteSpace(t.XdataAppName))
            throw new RulePackException("takeoff.xdataAppName trống.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in t.Items)
        {
            if (string.IsNullOrWhiteSpace(item.Id))
                throw new RulePackException("takeoff có item thiếu id.");
            if (!ids.Add(item.Id))
                throw new RulePackException($"takeoff item id trùng: \"{item.Id}\".");
            _ = item.MeasureKind; // ném RulePackException nếu measure lạ
            if (item.Factor <= 0)
                throw new RulePackException($"takeoff item \"{item.Id}\": factor phải dương.");
            if (string.IsNullOrWhiteSpace(item.Name) || string.IsNullOrWhiteSpace(item.Unit))
                throw new RulePackException($"takeoff item \"{item.Id}\" thiếu tên hoặc đơn vị.");
            if (item.LayerMatchAny.Count == 0 &&
                (item.MeasureKind != TakeoffMeasure.Count || item.BlockNameMatchAny is not { Count: > 0 }))
            {
                throw new RulePackException(
                    $"takeoff item \"{item.Id}\": layerMatchAny rỗng chỉ dành cho measure=count có blockNameMatchAny.");
            }
        }

        // inspectionPolicy (v2)
        if (pack.InspectionPolicy.ZToleranceMm <= 0)
            throw new RulePackException("inspectionPolicy.zToleranceMm phải dương.");
        if (pack.InspectionPolicy.OpenPolyline.NearGapToleranceMm <= 0)
            throw new RulePackException("inspectionPolicy.openPolyline.nearGapToleranceMm phải dương.");
    }
}
