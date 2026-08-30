using System.Globalization;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>Cỡ tuyến đã parse — cũng chính là bộ biến của biểu thức định mức phụ kiện (FR7).</summary>
/// <param name="W">Chiều rộng (mm) — tuyến <c>WxH</c>.</param>
/// <param name="H">Chiều cao (mm) — tuyến <c>WxH</c>.</param>
/// <param name="DN">Đường kính danh nghĩa — tuyến <c>DN</c>.</param>
public readonly record struct CoTuyen(double? W, double? H, double? DN)
{
    /// <summary>Trị của một biến biểu thức; null = cỡ tuyến không có biến đó.</summary>
    public double? Bien(string ten) => ten switch
    {
        "W" => W,
        "H" => H,
        "DN" => DN,
        _ => null,
    };
}

/// <summary>
/// Cảnh báo nghiệp vụ khi chia đốt — trả <b>slug</b> để engine C# và TS so khớp được từng chuỗi
/// (bộ test vector chung), nhãn tiếng Việt tra ở <see cref="JointSegmenter.NhanCanhBao"/>.
/// </summary>
public enum CanhBaoChiaDot
{
    /// <summary>slug <c>dot_ngan_hon_toi_thieu</c>.</summary>
    DotNganHonToiThieu,

    /// <summary>slug <c>sai_lech_tong_chieu_dai</c>.</summary>
    SaiLechTongChieuDai,

    /// <summary>slug <c>doan_cong_khong_chia_duoc</c>.</summary>
    DoanCongKhongChiaDuoc,

    /// <summary>slug <c>vuot_nguong_canh_lon</c>.</summary>
    VuotNguongCanhLon,
}

/// <summary>
/// Một đoạn thẳng của tim tuyến: giữa 2 điểm gãy polyline (mỗi vertex là ranh giới đốt bắt buộc —
/// FR4) hoặc giữa 2 mép phụ kiện.
/// </summary>
public sealed class DoanTim
{
    [JsonPropertyName("lengthMm")] public double LengthMm { get; init; }

    /// <summary>Đoạn có cung tròn (bulge): FR4 — từ chối chia, giữ nguyên 1 đốt kèm cảnh báo.</summary>
    [JsonPropertyName("hasBulge")] public bool HasBulge { get; init; }
}

/// <summary>Đầu vào chia đốt cho MỘT tuyến (một polyline tim).</summary>
public sealed class YeuCauChiaDot
{
    [JsonPropertyName("systemId")] public string SystemId { get; init; } = "";
    [JsonPropertyName("itemId")] public string ItemId { get; init; } = "";

    /// <summary>Cỡ đọc từ XData: <c>"800x400"</c> hoặc <c>"DN80"</c>.</summary>
    [JsonPropertyName("size")] public string Size { get; init; } = "";

    [JsonPropertyName("sizeKind")] public string SizeKind { get; init; } = "";

    /// <summary>Số thứ tự tuyến trong bản vẽ (1-based) — vào tag đốt, 3 chữ số.</summary>
    [JsonPropertyName("runIndex")] public int RunIndex { get; init; }

    /// <summary>Kỹ sư ghi đè kiểu nối tự chọn (FR1). Phải là một kiểu nối mà tuyến có khai.</summary>
    [JsonPropertyName("overrideJointType")] public string? OverrideJointType { get; init; }

    [JsonPropertyName("rules")] public JointRules Rules { get; init; } = new();
    [JsonPropertyName("segments")] public IReadOnlyList<DoanTim> Segments { get; init; } = [];
}

/// <summary>Một đốt chế tạo/lắp đặt.</summary>
/// <param name="SegmentIndex">Chỉ số đoạn thẳng chứa đốt (0-based) — để vẽ vạch chia đúng đoạn.</param>
/// <param name="PieceIndex">Số thứ tự đốt trong TUYẾN (1-based, chạy liên tục qua mọi đoạn).</param>
public sealed record DotChia(int SegmentIndex, int PieceIndex, double LengthMm, string Tag);

/// <summary>Một dòng phụ kiện mối nối đã tổng hợp.</summary>
public sealed record DongPhuKienMoiNoi(string Item, string Unit, double Quantity);

/// <summary>Kết quả chia đốt một tuyến.</summary>
public sealed record KetQuaChiaDot(
    string SystemId,
    string ItemId,
    string Size,
    KieuCo SizeKind,
    CoTuyen SizeVars,
    string JointType,
    bool Overridden,
    CheDoChiaDot DivideMode,
    double MaxLenMm,
    double JointGapMm,
    double MinPieceLenMm,
    int RunIndex,
    double TotalLengthMm,
    IReadOnlyList<DotChia> Pieces,
    IReadOnlyList<CanhBaoChiaDot> Warnings)
{
    public int PieceCount => Pieces.Count;

    /// <summary>Σ(nᵢ − 1) trên mọi đoạn — mối tại vertex là ranh giới, không tính mối.</summary>
    public int JointCount { get; init; }
}

/// <summary>Kết quả chia MỘT đoạn thẳng.</summary>
/// <param name="Pieces">Chiều dài từng đốt (mm), đã làm tròn 0,1 mm; đốt cuối gánh phần dư.</param>
public sealed record KetQuaChiaDoan(IReadOnlyList<double> Pieces, IReadOnlyList<CanhBaoChiaDot> Warnings);

/// <summary>
/// Engine chia đốt MEPF theo kiểu kết nối (M105 FR1–FR4, FR7) — THUẦN, không tham chiếu AutoCAD
/// (M99 FR17), test trên CI Linux.
///
/// Là ĐÔI của engine web <c>lib/ky-thuat/engineering-joint-segmentation.ts</c>: cùng đầu vào phải
/// ra cùng từng con số (±0,1 mm), khóa với nhau bằng bộ test vector JSON chung
/// <c>plugin-autocad/testdata/joint-segmentation/*.json</c> (M105 NFR1/AC12).
///
/// <b>Làm tròn</b>: 0,1 mm theo quy tắc "nửa lên, ra xa 0" — <c>Math.Round(x, 1,
/// MidpointRounding.AwayFromZero)</c>. Mặc định của .NET là làm tròn ngân hàng (về số chẵn) nên sẽ
/// lệch bản TS đúng ở các ca 0,x5 (vd đoạn 1181 nẹp C → 2 đốt 590,5).
///
/// Engine KHÔNG hard-code bất kỳ con số nghiệp vụ nào — mọi tham số đến từ
/// <c>drawTools.systems[].lines[].jointRules</c> của rule pack (v9 trở đi).
/// </summary>
public static class JointSegmenter
{
    /// <summary>Sai số cho phép của bất biến <c>Σ pieceLen + (n−1)·gap = L</c> (M105 FR2).</summary>
    public const double SaiSoTongChieuDaiMm = 0.5;

    /// <summary>Nhãn tiếng Việt của cảnh báo — cho dòng lệnh CAD/báo cáo phiên vẽ hiển thị.</summary>
    public static readonly IReadOnlyDictionary<CanhBaoChiaDot, string> NhanCanhBao =
        new Dictionary<CanhBaoChiaDot, string>
        {
            [CanhBaoChiaDot.DotNganHonToiThieu] =
                "Đoạn ngắn hơn đốt tối thiểu — giữ nguyên 1 đốt, kiểm tra khả năng chế tạo",
            [CanhBaoChiaDot.SaiLechTongChieuDai] =
                "Tổng chiều dài đốt + khe mối nối lệch khỏi chiều dài đoạn",
            [CanhBaoChiaDot.DoanCongKhongChiaDuoc] =
                "Đoạn có cung tròn (bulge) — không chia đốt, giữ nguyên cả đoạn",
            [CanhBaoChiaDot.VuotNguongCanhLon] = "Cạnh lớn vượt ngưỡng của kiểu nối đang chọn",
        };

    /// <summary>Slug cảnh báo — CHUỖI dùng chung với engine TS (bộ test vector).</summary>
    public static string Slug(this CanhBaoChiaDot canhBao) => canhBao switch
    {
        CanhBaoChiaDot.DotNganHonToiThieu => "dot_ngan_hon_toi_thieu",
        CanhBaoChiaDot.SaiLechTongChieuDai => "sai_lech_tong_chieu_dai",
        CanhBaoChiaDot.DoanCongKhongChiaDuoc => "doan_cong_khong_chia_duoc",
        _ => "vuot_nguong_canh_lon",
    };

    // ========================================================================
    // 1. Tiện ích số học
    // ========================================================================

    /// <summary>Làm tròn tới 0,1 mm theo quy tắc "nửa lên, ra xa 0" (NFR1).</summary>
    public static double LamTron01(double mm) => Math.Round(mm, 1, MidpointRounding.AwayFromZero);

    /// <summary>Làm tròn tới 0,001 khi tổng hợp khối lượng phụ kiện (khử nhiễu dấu phẩy động).</summary>
    private static double LamTron001(double v) => Math.Round(v, 3, MidpointRounding.AwayFromZero);

    // ========================================================================
    // 2. Parse cỡ & chọn kiểu nối (FR1)
    // ========================================================================

    private static readonly Regex ReWxH =
        new(@"^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)$", RegexOptions.Compiled);

    private static readonly Regex ReDn =
        new(@"^DN\s*(\d+(?:[.,]\d+)?)$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static double DoiSo(string s) =>
        double.Parse(s.Replace(",", "."), NumberStyles.Float, CultureInfo.InvariantCulture);

    /// <summary>
    /// Parse cỡ ghi trong XData thành bộ biến <c>W</c>/<c>H</c> hoặc <c>DN</c> (mm). Chấp nhận
    /// <c>"800x400"</c>, <c>"800X400"</c>, <c>"800 x 400"</c>, <c>"DN80"</c>, <c>"dn 80"</c>.
    /// Trả null khi không đọc được (cỡ lạ — caller cảnh báo rồi bỏ qua tuyến).
    /// </summary>
    public static CoTuyen? ParseCo(string? size, KieuCo kieuCo)
    {
        var s = (size ?? "").Trim();
        if (s.Length == 0) return null;
        if (kieuCo == KieuCo.WxH)
        {
            var m = ReWxH.Match(s);
            if (!m.Success) return null;
            var w = DoiSo(m.Groups[1].Value);
            var h = DoiSo(m.Groups[2].Value);
            return w > 0 && h > 0 ? new CoTuyen(w, h, null) : null;
        }
        var md = ReDn.Match(s);
        if (!md.Success) return null;
        var dn = DoiSo(md.Groups[1].Value);
        return dn > 0 ? new CoTuyen(null, null, dn) : null;
    }

    /// <summary>Khóa so sánh của bảng selection: tuyến <c>WxH</c> xét CẠNH LỚN, tuyến <c>DN</c> xét DN.</summary>
    private static double? KhoaChon(CoTuyen co, KieuCo kieuCo) =>
        kieuCo == KieuCo.WxH
            ? (co.W is { } w && co.H is { } h ? Math.Max(w, h) : null)
            : co.DN;

    /// <summary>
    /// Chọn kiểu nối TỰ ĐỘNG theo cỡ (FR1): xét <c>selection</c> THEO THỨ TỰ, mục đầu tiên khớp thì
    /// thắng. Trả null khi cỡ không parse được hoặc không mục nào phủ (rule pack thiếu mục bắt hết).
    /// </summary>
    public static JointSelectionRow? ChonKieuNoi(
        string size, KieuCo kieuCo, IReadOnlyList<JointSelectionRow> selection)
    {
        if (ParseCo(size, kieuCo) is not { } co) return null;
        if (KhoaChon(co, kieuCo) is not { } khoa) return null;
        foreach (var row in selection)
        {
            if (row.Nguong(kieuCo) is not { } nguong || khoa <= nguong) return row;
        }
        return null;
    }

    // ========================================================================
    // 3. Chia một đoạn thẳng (FR2, FR3)
    // ========================================================================

    /// <summary>
    /// Chia MỘT đoạn thẳng dài <paramref name="lengthMm"/> theo kiểu nối <paramref name="rule"/>.
    ///
    /// <list type="bullet">
    /// <item><c>deu</c>: <c>n = ceil(L / (maxLen + gap))</c>, <c>pieceLen = (L − (n−1)·gap) / n</c>
    /// (làm tròn 0,1 mm), đốt cuối nhận phần dư để tổng khớp đúng.</item>
    /// <item><c>cay_nguyen</c>: lặp đốt <c>maxLen</c> (mỗi đốt sau đốt đầu tiêu tốn thêm <c>gap</c>),
    /// đốt cuối là phần dư; phần dư &gt; 0 nhưng &lt; <c>minPieceLenMm</c> thì gộp vào đốt trước rồi
    /// chia đôi đều 2 đốt cuối (FR3).</item>
    /// <item><c>L &lt; minPieceLenMm</c> → 1 đốt duy nhất + cảnh báo <c>dot_ngan_hon_toi_thieu</c>.</item>
    /// </list>
    ///
    /// Bất biến (tự kiểm, phòng thủ): <c>Σ pieceLen + (n−1)·gap = L</c> trong sai số ±0,5 mm.
    /// </summary>
    public static KetQuaChiaDoan ChiaDoan(
        double lengthMm, JointSelectionRow rule, CheDoChiaDot mode, double minPieceLenMm)
    {
        if (double.IsNaN(lengthMm) || double.IsInfinity(lengthMm) || lengthMm <= 0)
        {
            throw new ArgumentException(
                $"Chiều dài đoạn không hợp lệ: {lengthMm.ToString(CultureInfo.InvariantCulture)}",
                nameof(lengthMm));
        }
        if (double.IsNaN(rule.MaxLenMm) || double.IsInfinity(rule.MaxLenMm) || rule.MaxLenMm <= 0)
        {
            throw new ArgumentException(
                $"maxLenMm không hợp lệ: {rule.MaxLenMm.ToString(CultureInfo.InvariantCulture)}", nameof(rule));
        }
        if (double.IsNaN(rule.JointGapMm) || double.IsInfinity(rule.JointGapMm) || rule.JointGapMm < 0)
        {
            throw new ArgumentException(
                $"jointGapMm không hợp lệ: {rule.JointGapMm.ToString(CultureInfo.InvariantCulture)}", nameof(rule));
        }

        var gap = rule.JointGapMm;
        var canhBao = new List<CanhBaoChiaDot>();

        // Đoạn ngắn hơn đốt tối thiểu → giữ nguyên 1 đốt, cảnh báo cho kỹ sư tự quyết (FR3).
        if (!double.IsNaN(minPieceLenMm) && lengthMm < minPieceLenMm)
            return new KetQuaChiaDoan([LamTron01(lengthMm)], [CanhBaoChiaDot.DotNganHonToiThieu]);

        var dot = mode == CheDoChiaDot.Deu
            ? ChiaDeu(lengthMm, rule.MaxLenMm, gap)
            : ChiaCayNguyen(lengthMm, rule.MaxLenMm, gap, minPieceLenMm);

        // Bất biến FR2 — không bao giờ nên vi phạm; có thì rule pack/đầu vào sai, phải lộ ra ngay.
        var tong = dot.Sum() + (dot.Count - 1) * gap;
        if (Math.Abs(tong - lengthMm) > SaiSoTongChieuDaiMm)
            canhBao.Add(CanhBaoChiaDot.SaiLechTongChieuDai);
        if (minPieceLenMm > 0 && dot.Any(p => p < minPieceLenMm))
            canhBao.Add(CanhBaoChiaDot.DotNganHonToiThieu);

        return new KetQuaChiaDoan(dot, canhBao);
    }

    /// <summary>FR2 — chia đều: mọi đốt bằng nhau, đốt cuối gánh phần dư làm tròn.</summary>
    private static List<double> ChiaDeu(double lengthMm, double maxLenMm, double gap)
    {
        var n = Math.Max(1, (int)Math.Ceiling(lengthMm / (maxLenMm + gap)));
        var huuIch = lengthMm - (n - 1) * gap; // tổng chiều dài tôn/ống thực cắt
        var mot = LamTron01(huuIch / n);
        var dot = new List<double>(n);
        for (var i = 0; i < n - 1; i++) dot.Add(mot);
        dot.Add(LamTron01(huuIch - mot * (n - 1)));
        return dot;
    }

    /// <summary>FR2/FR3 — tối đa hóa cây/thanh nguyên, phần dư ở đốt cuối; dư quá ngắn thì dồn 2 đốt cuối.</summary>
    private static List<double> ChiaCayNguyen(
        double lengthMm, double maxLenMm, double gap, double minPieceLenMm)
    {
        var dot = new List<double>();
        var conLai = lengthMm;
        for (; ; )
        {
            var con = conLai - (dot.Count > 0 ? gap : 0); // đốt sau đốt đầu tốn thêm 1 khe
            if (con <= maxLenMm)
            {
                dot.Add(LamTron01(con));
                break;
            }
            dot.Add(maxLenMm);
            conLai = con - maxLenMm;
        }

        // Đốt lẻ cuối ngắn hơn đốt tối thiểu → dồn ngược vào đốt trước, chia đều 2 đốt cuối (FR3).
        // `cuoi <= 0` là ca biên: phần dư nhỏ hơn cả khe mối nối (vd L = maxLen + 2 với khe 3) —
        // cũng phải dồn, nếu không sẽ sinh đốt dài 0/âm dù rule pack khai minPieceLenMm = 0.
        if (dot.Count >= 2)
        {
            var cuoi = dot[^1];
            var truoc = dot[^2];
            if (cuoi < minPieceLenMm || cuoi <= 0)
            {
                var huuIch = truoc + cuoi; // khe giữa 2 đốt vẫn còn nguyên → không cộng/trừ gap
                var nua = LamTron01(huuIch / 2);
                dot[^2] = nua;
                dot[^1] = LamTron01(huuIch - nua);
            }
        }
        return dot;
    }

    // ========================================================================
    // 4. Chia cả tuyến (FR4, FR6 — tag đốt)
    // ========================================================================

    /// <summary>Tag đốt <c>D-&lt;itemId&gt;-&lt;số tuyến 3 chữ số&gt;-&lt;số đốt 2 chữ số&gt;</c> (FR5).</summary>
    public static string TagDot(string itemId, int runIndex, int pieceIndex) =>
        $"D-{itemId}-{runIndex.ToString("000", CultureInfo.InvariantCulture)}-" +
        pieceIndex.ToString("00", CultureInfo.InvariantCulture);

    /// <summary>Layer vạch chia = layer tim + hậu tố (nối thẳng, không dấu phân tách — FR5).</summary>
    public static string LayerVachChia(string layerTim, JointLayerStyle layerStyle) =>
        JointRulesConfig.LayerVachChia(layerTim, layerStyle);

    /// <summary>
    /// Chia đốt cả một tuyến: mỗi đoạn thẳng (giữa 2 vertex polyline) chia ĐỘC LẬP vì mỗi vertex là
    /// ranh giới đốt bắt buộc (FR4); số đốt đánh liên tục toàn tuyến để tag không trùng.
    /// </summary>
    public static KetQuaChiaDot ChiaTuyen(YeuCauChiaDot run)
    {
        var rules = run.Rules;
        var mode = JointRulesConfig.DocCheDo(rules.DivideMode);
        var kieuCo = JointRulesConfig.DocKieuCo(run.SizeKind);
        if (ParseCo(run.Size, kieuCo) is not { } co)
        {
            throw new RulePackException(
                $"Không đọc được cỡ \"{run.Size}\" của tuyến {run.ItemId} (sizeKind {run.SizeKind}).");
        }

        var tuDong = ChonKieuNoi(run.Size, kieuCo, rules.Selection)
            ?? throw new RulePackException(
                $"Bảng selection của tuyến {run.ItemId} không phủ cỡ \"{run.Size}\" — rule pack thiếu mục bắt hết.");

        var rule = tuDong;
        var overridden = false;
        if (!string.IsNullOrEmpty(run.OverrideJointType) && run.OverrideJointType != tuDong.JointType)
        {
            rule = rules.Selection.FirstOrDefault(
                    r => string.Equals(r.JointType, run.OverrideJointType, StringComparison.Ordinal))
                ?? throw new RulePackException(
                    $"Tuyến {run.ItemId} không khai kiểu nối \"{run.OverrideJointType}\" để ghi đè.");
            overridden = true;
        }

        var canhBao = new List<CanhBaoChiaDot>();
        // FR9 — cạnh lớn vượt ngưỡng của kiểu đang chọn (chỉ xảy ra khi kỹ sư ghi đè tay).
        if (KhoaChon(co, kieuCo) is { } khoa && rule.Nguong(kieuCo) is { } nguong && khoa > nguong)
            canhBao.Add(CanhBaoChiaDot.VuotNguongCanhLon);

        var pieces = new List<DotChia>();
        var jointCount = 0;
        var totalLengthMm = 0.0;
        var pieceIndex = 0;

        for (var segmentIndex = 0; segmentIndex < run.Segments.Count; segmentIndex++)
        {
            var seg = run.Segments[segmentIndex];
            totalLengthMm += seg.LengthMm;
            IReadOnlyList<double> lenPieces;
            if (seg.HasBulge)
            {
                // FR4 — đoạn cung tròn: từ chối chia, giữ nguyên cả đoạn làm 1 đốt kèm cảnh báo.
                lenPieces = [LamTron01(seg.LengthMm)];
                canhBao.Add(CanhBaoChiaDot.DoanCongKhongChiaDuoc);
            }
            else
            {
                var kq = ChiaDoan(seg.LengthMm, rule, mode, rules.MinPieceLenMm);
                lenPieces = kq.Pieces;
                canhBao.AddRange(kq.Warnings);
            }
            jointCount += lenPieces.Count - 1;
            foreach (var lengthMm in lenPieces)
            {
                pieceIndex += 1;
                pieces.Add(new DotChia(
                    segmentIndex, pieceIndex, lengthMm, TagDot(run.ItemId, run.RunIndex, pieceIndex)));
            }
        }

        return new KetQuaChiaDot(
            run.SystemId,
            run.ItemId,
            run.Size,
            kieuCo,
            co,
            rule.JointType,
            overridden,
            mode,
            rule.MaxLenMm,
            rule.JointGapMm,
            rules.MinPieceLenMm,
            run.RunIndex,
            LamTron01(totalLengthMm),
            pieces,
            // Gộp trùng, GIỮ THỨ TỰ xuất hiện — 2 engine so khớp danh sách slug cho gọn.
            GopTrung(canhBao))
        {
            JointCount = jointCount,
        };
    }

    /// <summary>Gộp cảnh báo trùng, giữ thứ tự xuất hiện (đôi của <c>[...new Set(warnings)]</c> bên TS).</summary>
    private static List<CanhBaoChiaDot> GopTrung(IEnumerable<CanhBaoChiaDot> nguon)
    {
        var da = new HashSet<CanhBaoChiaDot>();
        var ra = new List<CanhBaoChiaDot>();
        foreach (var c in nguon)
        {
            if (da.Add(c)) ra.Add(c);
        }
        return ra;
    }

    // ========================================================================
    // 5. Phụ kiện mối nối (FR7)
    // ========================================================================

    /// <summary>
    /// Bung phụ kiện mối nối của một tuyến (FR7): mỗi mối nối sinh định mức theo kiểu nối, tổng hợp
    /// theo <c>item</c> + <c>unit</c>. Đơn vị <c>"m"</c> quy đổi mm→m; đơn vị khác giữ nguyên trị.
    /// Tuyến 0 mối nối → không phát sinh phụ kiện. Kết quả sắp theo <c>item</c> rồi <c>unit</c>
    /// (so sánh ORDINAL — độc lập locale máy kỹ sư, khác <c>localeCompare</c> bên TS nhưng cùng thứ
    /// tự với bộ mã phụ kiện ascii của rule pack).
    /// </summary>
    public static IReadOnlyList<DongPhuKienMoiNoi> BungPhuKienMoiNoi(
        string jointType, int jointCount, CoTuyen co, JointRules rules, string? itemId = null)
    {
        if (rules.DinhMucCua(jointType) is not { } specs)
        {
            throw new RulePackException(
                $"Rule pack thiếu định mức phụ kiện cho kiểu nối \"{jointType}\"" +
                (string.IsNullOrEmpty(itemId) ? "" : $" (tuyến {itemId})") + ".");
        }
        if (jointCount <= 0) return [];

        var gop = new Dictionary<(string Item, string Unit), double>();
        foreach (var spec in specs)
        {
            var motMoi = spec.MotMoi(co);
            var quyDoi = spec.Unit == "m" ? motMoi / 1000 : motMoi;
            var khoa = (spec.Item, spec.Unit);
            gop[khoa] = gop.GetValueOrDefault(khoa) + quyDoi * jointCount;
        }
        return gop
            .Select(d => new DongPhuKienMoiNoi(d.Key.Item, d.Key.Unit, LamTron001(d.Value)))
            .OrderBy(d => d.Item, StringComparer.Ordinal)
            .ThenBy(d => d.Unit, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>Bung phụ kiện mối nối cho kết quả chia đốt của một tuyến (đường dùng thường ngày).</summary>
    public static IReadOnlyList<DongPhuKienMoiNoi> BungPhuKienMoiNoi(
        KetQuaChiaDot ketQua, JointRules rules) =>
        BungPhuKienMoiNoi(ketQua.JointType, ketQua.JointCount, ketQua.SizeVars, rules, ketQua.ItemId);
}
