using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Layers;

/// <summary>
/// Ánh xạ tên layer theo layerMap của rule pack (M99 FR2 — cơ chế tương đương LAYTRANS):
/// first-match theo THỨ TỰ nhóm (HVAC → ELECTRICAL → … — thứ tự là hợp đồng, xem
/// layerMap.orderNote: ELECTRICAL phải trước PIPING vì token "CAP" mang cả 2 nghĩa),
/// trong nhóm chọn nhánh đầu tiên khớp, nhánh default chốt; không khớp nhóm nào → giữ nguyên.
///
/// <para><b>Bất biến idempotent</b> (vá 2026-08-25): tên đã là một <c>branches[].target</c> của
/// rule pack — hoặc layer nét biên <c>&lt;target&gt;+drawTools.edgeLayerSuffix</c> (M100 FR4) —
/// thì giữ nguyên, KHÔNG đem đi khớp token lại. Thiếu chốt này, chạy XBOSS_CHUANHOA lần hai trên
/// bản vẽ đã chuẩn hóa sẽ gộp nhầm hệ (M-DUCT-EXHT→M-DUCT-SUPP, F-SPRN-PIPE→P-PIPE-DOMW,
/// M-DUCT-SUPPEDGE→M-DUCT-SUPP) vì token của tên đích không nằm trong matchAny của chính nhóm nó.
/// Đúng một quy tắc với <c>normalizeCadLayers()</c> tầng 3 (đối chứng ở doi-chung/).</para>
/// </summary>
public sealed class LayerMapper
{
    private readonly LayerMapSection _layerMap;

    /// <summary>Tên layer đã đúng chuẩn (chữ hoa) — đọc từ rule pack, không hard-code.</summary>
    private readonly HashSet<string> _daChuan;

    public LayerMapper(CadRulePack pack) : this(pack.LayerMap, pack.DrawTools?.EdgeLayerSuffix) { }

    /// <param name="edgeLayerSuffix">
    /// <c>drawTools.edgeLayerSuffix</c>; <c>null</c>/rỗng với rule pack v1–v3 (chưa có khối này) —
    /// khi đó chỉ miễn trừ các layer đích, không có biến thể nét biên.
    /// </param>
    public LayerMapper(LayerMapSection layerMap, string? edgeLayerSuffix)
    {
        _layerMap = layerMap;
        _daChuan = new HashSet<string>(StringComparer.Ordinal);
        var hauTo = (edgeLayerSuffix ?? "").ToUpperInvariant();
        foreach (var group in layerMap.Groups)
        {
            foreach (var branch in group.Branches)
            {
                var target = branch.Target.ToUpperInvariant();
                _daChuan.Add(target);
                if (hauTo.Length > 0) _daChuan.Add(target + hauTo);
            }
        }
    }

    /// <summary>Tên layer đích cho <paramref name="tenLayer"/> (giữ nguyên nếu không khớp).</summary>
    public string Map(string tenLayer)
    {
        var hoa = tenLayer.ToUpperInvariant();
        // Đã đúng chuẩn → chỉ chuẩn hoá hoa/thường về đúng dạng khai trong rule pack.
        if (_daChuan.Contains(hoa)) return hoa;
        foreach (var group in _layerMap.Groups)
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
