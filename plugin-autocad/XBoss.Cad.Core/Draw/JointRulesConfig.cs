using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Model + bộ kiểm khối <c>drawTools.systems[].lines[].jointRules</c> của rule pack v9 (M105 §12),
/// kèm parser biểu thức định mức phụ kiện mối nối (FR7).
///
/// Thuần — KHÔNG tham chiếu assembly AutoCAD (M99 FR17), chạy test trên CI Linux. Bản này là ĐÔI
/// của engine web <c>lib/ky-thuat/engineering-joint-segmentation.ts</c>: hai bên bị khóa với nhau
/// bằng bộ test vector JSON chung <c>plugin-autocad/testdata/joint-segmentation/*.json</c>
/// (M105 NFR1/AC12) — sửa công thức một bên mà quên bên kia thì bộ vector đỏ.
/// </summary>
public sealed class JointRules
{
    /// <summary>Bảng chọn kiểu nối tự động — xét THEO THỨ TỰ, mục đầu tiên khớp thì thắng.</summary>
    [JsonPropertyName("selection")] public IReadOnlyList<JointSelectionRow> Selection { get; init; } = [];

    /// <summary><c>deu</c> (ống gió) hoặc <c>cay_nguyen</c> (ống nước/PCCC/máng cáp).</summary>
    [JsonPropertyName("divideMode")] public string DivideMode { get; init; } = "";

    /// <summary>Đốt tối thiểu (mm) — ngắn hơn thì cảnh báo/dồn đốt (FR3).</summary>
    [JsonPropertyName("minPieceLenMm")] public double MinPieceLenMm { get; init; }

    [JsonPropertyName("layerStyle")] public JointLayerStyle LayerStyle { get; init; } = new();

    /// <summary>Định mức phụ kiện theo kiểu nối; mỗi tuyến chỉ khai đúng kiểu nối của nó.</summary>
    [JsonPropertyName("hardware")]
    public IReadOnlyDictionary<string, IReadOnlyList<JointHardwareSpec>> Hardware { get; init; } =
        new Dictionary<string, IReadOnlyList<JointHardwareSpec>>(StringComparer.Ordinal);

    /// <summary>Định mức của một kiểu nối; null = rule pack không khai (caller ném lỗi rõ ràng).</summary>
    public IReadOnlyList<JointHardwareSpec>? DinhMucCua(string jointType) =>
        Hardware.TryGetValue(jointType, out var specs) ? specs : null;
}

/// <summary>Một dòng bảng chọn kiểu nối tự động (<c>jointRules.selection</c>).</summary>
public sealed class JointSelectionRow
{
    [JsonPropertyName("jointType")] public string JointType { get; init; } = "";

    /// <summary>Ngưỡng CẠNH LỚN max(W,H) — chỉ dùng cho tuyến <c>WxH</c>. null = bắt hết phần còn lại.</summary>
    [JsonPropertyName("maxSideMm")] public double? MaxSideMm { get; init; }

    /// <summary>Ngưỡng DN — chỉ dùng cho tuyến <c>DN</c>. null = bắt hết phần còn lại.</summary>
    [JsonPropertyName("maxDn")] public double? MaxDn { get; init; }

    /// <summary>Chiều dài đốt tối đa (mm).</summary>
    [JsonPropertyName("maxLenMm")] public double MaxLenMm { get; init; }

    /// <summary>Khe mối nối (gioăng/rãnh) CỘNG THÊM giữa 2 đốt liền kề (mm).</summary>
    [JsonPropertyName("jointGapMm")] public double JointGapMm { get; init; }

    /// <summary>Ngưỡng áp dụng theo loại cỡ của tuyến; null = mục bắt hết phần còn lại.</summary>
    public double? Nguong(KieuCo kieuCo) => kieuCo == KieuCo.WxH ? MaxSideMm : MaxDn;
}

/// <summary>Một dòng định mức phụ kiện cho MỖI MỐI NỐI.</summary>
public sealed class JointHardwareSpec
{
    [JsonPropertyName("item")] public string Item { get; init; } = "";

    /// <summary>
    /// Số, hoặc biểu thức mini theo biến <c>W</c>/<c>H</c>/<c>DN</c> (mm) — giữ nguyên
    /// <see cref="JsonElement"/> vì rule pack cho phép cả hai kiểu; đọc qua <see cref="MotMoi"/>.
    /// </summary>
    [JsonPropertyName("perJoint")] public JsonElement PerJoint { get; init; }

    /// <summary><c>"m"</c> quy đổi mm→m khi tổng hợp; đơn vị khác (vd <c>"cái"</c>) giữ nguyên trị.</summary>
    [JsonPropertyName("unit")] public string Unit { get; init; } = "";

    /// <summary>Trị định mức cho MỘT mối nối (số thì lấy thẳng, chuỗi thì tính biểu thức).</summary>
    public double MotMoi(CoTuyen co) => PerJoint.ValueKind switch
    {
        JsonValueKind.Number => PerJoint.GetDouble(),
        JsonValueKind.String => JointRulesConfig.TinhBieuThucDinhMuc(
            PerJoint.GetString() ?? "", co),
        _ => throw new RulePackException(
            $"Định mức \"{Item}\" có perJoint không hợp lệ (chỉ nhận số hoặc biểu thức chuỗi)."),
    };
}

/// <summary>
/// Kiểu dáng layer vạch chia. Hậu tố nối THẲNG vào layer tim, KHÔNG có dấu phân tách đứng đầu —
/// có dấu thì layer vạch chia khớp <c>takeoff.layerMatchAny</c> và bị bóc trùng (M105 FR5, cùng
/// lớp lỗi mà <c>drawTools.edgeLayerSuffix</c> đã né bằng hậu tố <c>EDGE</c> ở M100 FR4).
/// </summary>
public sealed class JointLayerStyle
{
    [JsonPropertyName("suffix")] public string Suffix { get; init; } = "";
    [JsonPropertyName("color")] public int? Color { get; init; }
    [JsonPropertyName("linetype")] public string? Linetype { get; init; }
}

/// <summary>Cách khai cỡ của tuyến: ống gió/máng cáp <c>WxH</c> (mm), ống nước/PCCC <c>DN</c>.</summary>
public enum KieuCo
{
    /// <summary>Cỡ dạng <c>"800x400"</c> — khóa chọn kiểu nối là CẠNH LỚN max(W,H).</summary>
    WxH,

    /// <summary>Cỡ dạng <c>"DN80"</c> — khóa chọn kiểu nối là số DN.</summary>
    DN,
}

/// <summary>Chế độ chia đốt (FR2/FR3).</summary>
public enum CheDoChiaDot
{
    /// <summary>Chia ĐỀU n đốt bằng nhau (ống gió) — đốt cuối gánh phần dư làm tròn.</summary>
    Deu,

    /// <summary>Tối đa hóa cây/thanh nguyên, phần dư ở đốt cuối (ống nước/PCCC/máng cáp).</summary>
    CayNguyen,
}

/// <summary>Nạp + kiểm khối <c>jointRules</c>, và parser biểu thức định mức (M105 §12, FR7).</summary>
public static class JointRulesConfig
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
    };

    /// <summary>Đọc MỘT khối <c>jointRules</c> từ JSON rời (test vector, payload API).</summary>
    public static JointRules Doc(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<JointRules>(json, Options)
                ?? throw new RulePackException("Khối jointRules rỗng.");
        }
        catch (JsonException e)
        {
            throw new RulePackException($"Khối jointRules sai kiểu dữ liệu: {e.Message}");
        }
    }

    /// <summary><c>"deu"</c>/<c>"cay_nguyen"</c> → enum; chuỗi lạ → lỗi tiếng Việt.</summary>
    public static CheDoChiaDot DocCheDo(string divideMode) => divideMode switch
    {
        "deu" => CheDoChiaDot.Deu,
        "cay_nguyen" => CheDoChiaDot.CayNguyen,
        _ => throw new RulePackException(
            $"divideMode không hợp lệ: \"{divideMode}\" (chỉ nhận \"deu\" hoặc \"cay_nguyen\")."),
    };

    /// <summary><c>"WxH"</c>/<c>"DN"</c> → enum; chuỗi lạ → lỗi tiếng Việt.</summary>
    public static KieuCo DocKieuCo(string sizeKind) => sizeKind switch
    {
        "WxH" => KieuCo.WxH,
        "DN" => KieuCo.DN,
        _ => throw new RulePackException(
            $"sizeKind không hợp lệ: \"{sizeKind}\" (chỉ nhận \"WxH\" hoặc \"DN\")."),
    };

    /// <summary>
    /// Kiểm khối <c>jointRules</c> của MỘT tuyến (M105 §12): dải <c>selection</c> phủ kín và không
    /// chồng nhau, <c>maxLenMm &gt; minPieceLenMm</c>, mọi kiểu nối có định mức, biểu thức định mức
    /// parse được. Sai → <see cref="RulePackException"/> tiếng Việt nêu đúng tuyến/kiểu nối.
    /// </summary>
    public static void Validate(JointRules rules, KieuCo kieuCo, string moTaTuyen)
    {
        DocCheDo(rules.DivideMode);

        if (rules.MinPieceLenMm < 0)
            throw new RulePackException($"{moTaTuyen}: minPieceLenMm phải ≥ 0.");
        if (string.IsNullOrWhiteSpace(rules.LayerStyle.Suffix))
            throw new RulePackException($"{moTaTuyen}: jointRules.layerStyle.suffix trống — không biết đặt vạch chia vào layer nào.");
        if (rules.Selection.Count == 0)
            throw new RulePackException($"{moTaTuyen}: jointRules.selection rỗng — không chọn được kiểu nối nào.");

        var daCo = new HashSet<string>(StringComparer.Ordinal);
        double? nguongTruoc = null;
        for (var i = 0; i < rules.Selection.Count; i++)
        {
            var row = rules.Selection[i];
            if (string.IsNullOrWhiteSpace(row.JointType))
                throw new RulePackException($"{moTaTuyen}: jointRules.selection có mục thiếu jointType.");
            if (!daCo.Add(row.JointType))
                throw new RulePackException($"{moTaTuyen}: jointRules.selection khai trùng kiểu nối \"{row.JointType}\".");
            if (row.MaxLenMm <= 0)
                throw new RulePackException($"{moTaTuyen}/{row.JointType}: maxLenMm phải dương.");
            if (row.MaxLenMm <= rules.MinPieceLenMm)
            {
                throw new RulePackException(
                    $"{moTaTuyen}/{row.JointType}: maxLenMm ({So(row.MaxLenMm)}) phải lớn hơn " +
                    $"minPieceLenMm ({So(rules.MinPieceLenMm)}).");
            }
            if (row.JointGapMm < 0)
                throw new RulePackException($"{moTaTuyen}/{row.JointType}: jointGapMm phải ≥ 0.");

            var nguong = row.Nguong(kieuCo);
            var laCuoi = i == rules.Selection.Count - 1;
            // Mục CUỐI phải là mục bắt hết (ngưỡng null) — nếu không thì có cỡ không tuyến nào phủ.
            if (laCuoi && nguong is not null)
            {
                throw new RulePackException(
                    $"{moTaTuyen}: jointRules.selection không phủ kín — mục cuối \"{row.JointType}\" phải để " +
                    $"{(kieuCo == KieuCo.WxH ? "maxSideMm" : "maxDn")} = null để bắt hết cỡ còn lại.");
            }
            if (!laCuoi)
            {
                if (nguong is not { } n)
                {
                    throw new RulePackException(
                        $"{moTaTuyen}: mục \"{row.JointType}\" để ngưỡng null nhưng không phải mục cuối — " +
                        "các mục sau nó không bao giờ được xét.");
                }
                // Ngưỡng phải TĂNG NGẶT: bằng/nhỏ hơn mục trước = dải chồng nhau (mục sau chết).
                if (nguongTruoc is { } truoc && n <= truoc)
                {
                    throw new RulePackException(
                        $"{moTaTuyen}: dải chọn kiểu nối chồng nhau — \"{row.JointType}\" có ngưỡng " +
                        $"{So(n)} không lớn hơn ngưỡng {So(truoc)} của mục trước.");
                }
                nguongTruoc = n;
            }

            if (rules.DinhMucCua(row.JointType) is not { } specs)
            {
                throw new RulePackException(
                    $"{moTaTuyen}: jointRules.hardware thiếu định mức cho kiểu nối \"{row.JointType}\" — " +
                    "bóc phụ kiện mối nối sẽ trống (M105 FR7).");
            }
            foreach (var spec in specs) KiemDinhMuc(spec, $"{moTaTuyen}/{row.JointType}");
        }
    }

    /// <summary>
    /// FR5 — layer vạch chia (<c>layer tim + suffix</c>) KHÔNG được khớp bất kỳ
    /// <c>takeoff.layerMatchAny</c> nào, nếu không vạch chia bị bóc thành chiều dài tuyến (đếm đôi).
    /// Dùng CHÍNH <see cref="TokenMatcher"/> của takeoff, y như cơ chế đã canh cho nét biên (M100 FR4).
    /// </summary>
    public static void KiemLayerVachChia(
        string layerTim, JointRules rules, IReadOnlyList<TakeoffItem> takeoffItems, string moTaTuyen)
    {
        var layerVachChia = LayerVachChia(layerTim, rules.LayerStyle);
        foreach (var item in takeoffItems)
        {
            if (item.LayerMatchAny.Count > 0 && TokenMatcher.MatchesAny(layerVachChia, item.LayerMatchAny))
            {
                throw new RulePackException(
                    $"Layer vạch chia \"{layerVachChia}\" ({moTaTuyen}) khớp takeoff item \"{item.Id}\" " +
                    "(layerMatchAny) — vạch chia sẽ bị bóc trùng thành chiều dài tuyến. " +
                    "Đổi jointRules.layerStyle.suffix (M105 FR5).");
            }
        }
    }

    /// <summary>Layer vạch chia = layer tim + hậu tố (nối thẳng, không dấu phân tách).</summary>
    public static string LayerVachChia(string layerTim, JointLayerStyle layerStyle) =>
        layerTim + layerStyle.Suffix;

    private static void KiemDinhMuc(JointHardwareSpec spec, string moTa)
    {
        if (string.IsNullOrWhiteSpace(spec.Item))
            throw new RulePackException($"{moTa}: định mức phụ kiện thiếu item.");
        if (string.IsNullOrWhiteSpace(spec.Unit))
            throw new RulePackException($"{moTa}/{spec.Item}: định mức phụ kiện thiếu unit.");
        switch (spec.PerJoint.ValueKind)
        {
            case JsonValueKind.Number:
                return;
            case JsonValueKind.String:
                // Chỉ kiểm CÚ PHÁP: gán mọi biến một trị mẫu dương để biểu thức nào cũng tính được;
                // biến sai loại (DN trên tuyến WxH) lộ ra lúc bóc, kèm thông báo riêng.
                TinhBieuThucDinhMuc(spec.PerJoint.GetString() ?? "", new CoTuyen(1000, 1000, 1000));
                return;
            default:
                throw new RulePackException(
                    $"{moTa}/{spec.Item}: perJoint phải là số hoặc biểu thức chuỗi.");
        }
    }

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);

    // ========================================================================
    // Parser biểu thức định mức (FR7)
    // ========================================================================

    private enum LoaiToken { So, Ten, Dau }

    private readonly record struct Token(LoaiToken Loai, double So, string Chu);

    private static readonly string[] TenBien = ["W", "H", "DN"];

    /// <summary>
    /// Tính biểu thức định mức mini (FR7) bằng bộ phân tích đệ quy tự viết — KHÔNG dùng thư viện
    /// eval/<c>DataTable.Compute</c>. Ngữ pháp chỉ chấp nhận: số thập phân, biến <c>W</c>/<c>H</c>/
    /// <c>DN</c> (mm), 4 phép <c>+ - * /</c>, dấu ngoặc và hàm <c>ceil()</c>. Mọi thứ khác → ném
    /// <see cref="RulePackException"/> tiếng Việt.
    /// </summary>
    public static double TinhBieuThucDinhMuc(string bieuThuc, CoTuyen co)
    {
        var tokens = TachToken(bieuThuc);
        if (tokens.Count == 0) throw new RulePackException("Biểu thức định mức rỗng.");
        var pos = 0;

        bool AnDau(char v)
        {
            if (pos < tokens.Count && tokens[pos].Loai == LoaiToken.Dau && tokens[pos].Chu == v.ToString())
            {
                pos += 1;
                return true;
            }
            return false;
        }

        // expr := term (('+' | '-') term)*
        double DoiExpr()
        {
            var v = DoiTerm();
            for (; ; )
            {
                if (AnDau('+')) v += DoiTerm();
                else if (AnDau('-')) v -= DoiTerm();
                else return v;
            }
        }

        // term := factor (('*' | '/') factor)*
        double DoiTerm()
        {
            var v = DoiFactor();
            for (; ; )
            {
                if (AnDau('*'))
                {
                    v *= DoiFactor();
                }
                else if (AnDau('/'))
                {
                    var mau = DoiFactor();
                    if (mau == 0)
                        throw new RulePackException($"Biểu thức định mức chia cho 0: \"{bieuThuc}\".");
                    v /= mau;
                }
                else
                {
                    return v;
                }
            }
        }

        // factor := ('+' | '-')? primary
        double DoiFactor()
        {
            if (AnDau('-')) return -DoiFactor();
            if (AnDau('+')) return DoiFactor();
            return DoiPrimary();
        }

        // primary := SỐ | BIẾN | 'ceil' '(' expr ')' | '(' expr ')'
        double DoiPrimary()
        {
            if (pos >= tokens.Count)
                throw new RulePackException($"Biểu thức định mức thiếu vế: \"{bieuThuc}\".");
            var tk = tokens[pos];
            if (tk.Loai == LoaiToken.So)
            {
                pos += 1;
                return tk.So;
            }
            if (tk.Loai == LoaiToken.Ten)
            {
                pos += 1;
                if (tk.Chu == "ceil")
                {
                    if (!AnDau('('))
                        throw new RulePackException($"Hàm ceil() thiếu dấu mở ngoặc: \"{bieuThuc}\".");
                    var v = DoiExpr();
                    if (!AnDau(')'))
                        throw new RulePackException($"Hàm ceil() thiếu dấu đóng ngoặc: \"{bieuThuc}\".");
                    return Math.Ceiling(v);
                }
                if (Array.IndexOf(TenBien, tk.Chu) >= 0)
                {
                    if (co.Bien(tk.Chu) is not { } giaTri)
                    {
                        throw new RulePackException(
                            $"Biểu thức định mức dùng biến \"{tk.Chu}\" mà cỡ tuyến không có giá trị.");
                    }
                    return giaTri;
                }
                throw new RulePackException(
                    $"Biểu thức định mức có tên không hợp lệ: \"{tk.Chu}\" (chỉ nhận W, H, DN, ceil).");
            }
            if (AnDau('('))
            {
                var v = DoiExpr();
                if (!AnDau(')'))
                    throw new RulePackException($"Biểu thức định mức thiếu dấu đóng ngoặc: \"{bieuThuc}\".");
                return v;
            }
            throw new RulePackException(
                $"Biểu thức định mức sai cú pháp tại \"{tk.Chu}\": \"{bieuThuc}\".");
        }

        var ketQua = DoiExpr();
        if (pos != tokens.Count)
            throw new RulePackException($"Biểu thức định mức thừa ký tự sau vị trí {pos}: \"{bieuThuc}\".");
        if (double.IsNaN(ketQua) || double.IsInfinity(ketQua))
            throw new RulePackException($"Biểu thức định mức cho kết quả không hợp lệ: \"{bieuThuc}\".");
        return ketQua;
    }

    private static List<Token> TachToken(string bt)
    {
        var ra = new List<Token>();
        var i = 0;
        while (i < bt.Length)
        {
            var c = bt[i];
            if (char.IsWhiteSpace(c))
            {
                i += 1;
                continue;
            }
            if (char.IsAsciiDigit(c) || c == '.')
            {
                var j = i;
                while (j < bt.Length && (char.IsAsciiDigit(bt[j]) || bt[j] == '.')) j += 1;
                var raw = bt[i..j];
                if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out var v))
                    throw new RulePackException($"Số không hợp lệ trong biểu thức định mức: \"{raw}\".");
                ra.Add(new Token(LoaiToken.So, v, raw));
                i = j;
                continue;
            }
            if (char.IsAsciiLetter(c))
            {
                var j = i;
                while (j < bt.Length && char.IsAsciiLetter(bt[j])) j += 1;
                ra.Add(new Token(LoaiToken.Ten, 0, bt[i..j]));
                i = j;
                continue;
            }
            if (c is '+' or '-' or '*' or '/' or '(' or ')')
            {
                ra.Add(new Token(LoaiToken.Dau, 0, c.ToString()));
                i += 1;
                continue;
            }
            throw new RulePackException($"Ký tự không hợp lệ trong biểu thức định mức: \"{c}\".");
        }
        return ra;
    }
}
