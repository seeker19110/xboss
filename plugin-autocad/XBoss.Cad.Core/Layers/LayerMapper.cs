using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Layers;

/// <summary>
/// Ánh xạ tên layer theo layerMap của rule pack (M99 FR2 — cơ chế tương đương LAYTRANS):
/// first-match theo THỨ TỰ nhóm (HVAC → ELECTRICAL → … — thứ tự là hợp đồng, xem
/// layerMap.orderNote: ELECTRICAL phải trước PIPING vì token "CAP" mang cả 2 nghĩa),
/// trong nhóm chọn nhánh đầu tiên khớp, nhánh default chốt; không khớp nhóm nào → giữ nguyên.
/// </summary>
public sealed class LayerMapper(LayerMapSection layerMap)
{
    /// <summary>Tên layer đích cho <paramref name="tenLayer"/> (giữ nguyên nếu không khớp).</summary>
    public string Map(string tenLayer)
    {
        var hoa = tenLayer.ToUpperInvariant();
        foreach (var group in layerMap.Groups)
        {
            if (!Khop(hoa, group.MatchAny)) continue;
            foreach (var branch in group.Branches)
            {
                if (branch.MatchAny is null || Khop(hoa, branch.MatchAny)) return branch.Target;
            }
        }
        return tenLayer;
    }

    /// <summary>Kế hoạch đổi tên cho cả bảng layer: chỉ trả các layer thật sự đổi tên.</summary>
    public IReadOnlyDictionary<string, string> MapAll(IEnumerable<string> tenLayers)
    {
        var plan = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var ten in tenLayers)
        {
            var target = Map(ten);
            if (!string.Equals(target, ten, StringComparison.Ordinal)) plan[ten] = target;
        }
        return plan;
    }

    private static bool Khop(string layerHoa, IReadOnlyList<string> tokens)
    {
        foreach (var t in tokens)
        {
            if (TokenMatcher.HasToken(layerHoa, t.ToUpperInvariant())) return true;
        }
        return false;
    }
}
