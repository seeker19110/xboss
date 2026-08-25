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
        // fontMap.targetFont (v3): KHÔNG bắt buộc — rule pack v2 không có, plugin bỏ qua bước đổi
        // font. Nhưng khai rồi mà để rỗng thì là sai sót, chặn ngay thay vì im lặng không đổi font.
        if (pack.FontMap.TargetFont.Note.Length > 0 && string.IsNullOrWhiteSpace(pack.FontMap.TargetFont.TypeFace))
            throw new RulePackException("fontMap.targetFont khai rồi nhưng thiếu typeFace.");

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

        ValidatePhepKiemV5(pack);
    }

    /// <summary>
    /// Kiểm 7 phép kiểm mới của v5 (M101 §6.1). Rule pack ≤ v4 không khai khối nào → mọi giá trị là
    /// mặc định (tắt/rỗng) → không ném gì (tương thích ngược). Nguyên tắc: phép ĐANG BẬT mà thiếu
    /// tham số thì chặn ngay, thà không nạp được còn hơn chạy im lặng không kiểm gì.
    /// </summary>
    private static void ValidatePhepKiemV5(CadRulePack pack)
    {
        var ip = pack.InspectionPolicy;

        if (ip.OverlapSameSystem.Enabled &&
            (ip.OverlapSameSystem.OverlapToleranceMm <= 0 || ip.OverlapSameSystem.OverlapMinLengthMm <= 0))
        {
            throw new RulePackException(
                "inspectionPolicy.overlapSameSystem đang bật nhưng overlapToleranceMm/overlapMinLengthMm không dương.");
        }

        // clashPairs kiểm cả khi tắt: dữ liệu khai sai (tên hệ trôi khỏi layerMap) phải lộ ngay,
        // chứ không đợi tới ngày công ty bật phép kiểm lên mới phát hiện.
        var groupIds = new HashSet<string>(pack.LayerMap.Groups.Select(g => g.Id), StringComparer.Ordinal);
        foreach (var cap in ip.Clash2d.ClashPairs)
        {
            if (cap.Count != 2)
                throw new RulePackException("inspectionPolicy.clash2d.clashPairs phải là danh sách cặp [hệ A, hệ B].");
            foreach (var he in cap)
            {
                if (!groupIds.Contains(he))
                {
                    throw new RulePackException(
                        $"inspectionPolicy.clash2d.clashPairs tham chiếu hệ \"{he}\" không có trong layerMap.groups[].id.");
                }
            }
            if (string.Equals(cap[0], cap[1], StringComparison.Ordinal))
                throw new RulePackException($"inspectionPolicy.clash2d.clashPairs có cặp trùng hệ \"{cap[0]}\" — phép kiểm 11 dành cho KHÁC hệ.");
        }

        if (ip.TitleblockFields.Enabled && ip.TitleblockFields.RequiredAttributes.Count == 0)
        {
            throw new RulePackException(
                "inspectionPolicy.titleblockFields đang bật nhưng requiredAttributes rỗng — không có trường nào để kiểm.");
        }

        foreach (var s in ip.ViewportScale.Scales)
        {
            if (s <= 0) throw new RulePackException("inspectionPolicy.viewportScale.scales có mẫu số tỉ lệ không dương.");
        }
        if (ip.ViewportScale.Enabled && ip.ViewportScale.Scales.Count == 0 && !ip.ViewportScale.RequireLocked)
        {
            throw new RulePackException(
                "inspectionPolicy.viewportScale đang bật nhưng không kiểm gì (scales rỗng và requireLocked=false).");
        }

        if (ip.StyleDeviation.Enabled &&
            string.IsNullOrWhiteSpace(pack.StyleMap.TextStyle.Name) &&
            string.IsNullOrWhiteSpace(pack.StyleMap.DimStyle.Name))
        {
            throw new RulePackException(
                "inspectionPolicy.styleDeviation đang bật nhưng styleMap chưa khai tên style chuẩn nào.");
        }

        if (ip.StrayObjects.Enabled && (ip.StrayObjects.StrayDistanceFactor <= 0 || ip.StrayObjects.MinEntitiesForExtents < 4))
        {
            throw new RulePackException(
                "inspectionPolicy.strayObjects đang bật nhưng strayDistanceFactor không dương hoặc minEntitiesForExtents < 4.");
        }

        // styleMap: dimstyle chuẩn trỏ kiểu chữ lạ → chuẩn hóa xong chữ kích thước vẫn sai font.
        var dimTextStyle = pack.StyleMap.DimStyle.TextStyleName;
        if (!string.IsNullOrWhiteSpace(dimTextStyle))
        {
            var hopLe = string.Equals(dimTextStyle, pack.StyleMap.TextStyle.Name, StringComparison.OrdinalIgnoreCase)
                        || pack.StyleMap.TextStyle.AcceptAlso.Any(n => string.Equals(n, dimTextStyle, StringComparison.OrdinalIgnoreCase));
            if (!hopLe)
            {
                throw new RulePackException(
                    $"styleMap.dimStyle.textStyleName \"{dimTextStyle}\" không nằm trong styleMap.textStyle (name/acceptAlso).");
            }
        }
    }
}
