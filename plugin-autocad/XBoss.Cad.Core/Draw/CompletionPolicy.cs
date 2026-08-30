using System.Globalization;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Khối <c>drawTools.completionPolicy</c> (M115 §7 FR5) — tham số hoàn thiện bản vẽ từ tuyến tim,
/// dùng chung cho <c>XBOSS_TUYEN_DOTHI</c> (dựng đồ thị + suy phụ kiện) và <c>XBOSS_HOANTHIEN</c>
/// (điều phối 8 giai đoạn vẽ). Mặc định <see cref="Enabled"/> = false: khai rồi nhưng chưa bật thì
/// cả 2 lệnh dừng kèm hướng dẫn cách bật, không đụng bản vẽ (AC5).
///
/// THUẦN — không tham chiếu assembly AutoCAD (M99 FR17). Bản này là đôi của validator TS
/// <c>kiemCompletionPolicy()</c> trong <c>lib/ky-thuat/cad/rule-pack.ts</c>: sửa luật một bên mà quên
/// bên kia là hai tầng trôi khỏi nhau (ADR-0006 nguyên tắc 1).
/// </summary>
public sealed class CompletionPolicySection
{
    /// <summary>
    /// 8 giai đoạn của <c>XBOSS_HOANTHIEN</c> (M115 §6 bước 5) — THỨ TỰ ở đây là thứ tự chạy khóa
    /// cứng, không phải danh sách tự do. Bản TS: <c>GIAI_DOAN_HOAN_THIEN</c>.
    /// </summary>
    public static readonly IReadOnlyList<string> TenGiaiDoan =
    [
        "netDoi",         // ① nét đôi          — XBOSS_VE_NEN
        "phuKienTaiNut",  // ② phụ kiện tại nút — XBOSS_VE_PHUKIEN
        "chiaDot",        // ③ chia đốt         — XBOSS_VE_CHIADOT
        "giaDo",          // ④ giá đỡ           — XBOSS_VE_GIADO
        "loCho",          // ⑤ lỗ chờ           — XBOSS_VE_LOCHO
        "ngatNet",        // ⑥ ngắt nét giao chéo — XBOSS_VE_NGATNET
        "tag",            // ⑦ tag              — XBOSS_VE_TAG
        "thongKe",        // ⑧ bảng thống kê    — XBOSS_VE_THONGKE
    ];

    /// <summary>Mặc định false — nạp rule pack mới không đổi hành vi trên máy kỹ sư (AC5).</summary>
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>Hai điểm cách nhau ≤ ngưỡng này (mm) gộp thành MỘT nút khi dựng đồ thị.</summary>
    [JsonPropertyName("nodeToleranceMm")] public double NodeToleranceMm { get; init; }

    /// <summary>Đầu tuyến cách TÂM block thiết bị ≤ ngưỡng này (mm) thì coi là kết nối thiết bị.</summary>
    [JsonPropertyName("equipmentSnapMm")] public double EquipmentSnapMm { get; init; }

    /// <summary>Hai đoạn tại cùng một nút lệch cao độ ≤ ngưỡng này (mm) coi là cùng cao độ.</summary>
    [JsonPropertyName("elevationToleranceMm")] public double ElevationToleranceMm { get; init; }

    /// <summary>Góc đổi hướng (0..180°) nhỏ hơn ngưỡng này thì coi tuyến là THẲNG, không suy co/cút.</summary>
    [JsonPropertyName("minTurnAngleDeg")] public double MinTurnAngleDeg { get; init; }

    /// <summary>Bảng chọn phụ kiện tại nút — xét THEO THỨ TỰ, mục đầu tiên khớp thì thắng.</summary>
    [JsonPropertyName("fittingRules")] public IReadOnlyList<FittingRule> FittingRules { get; init; } = [];

    /// <summary>
    /// Trạng thái tích sẵn của 8 giai đoạn. Cố ý giữ dạng từ điển (không phải 8 thuộc tính bool)
    /// để bắt được cả khóa THIẾU lẫn khóa LẠ — bind vào 8 property thì khóa thiếu lặng lẽ thành
    /// <c>false</c> và khóa lạ bị nuốt, đúng hai lớp lỗi validator này sinh ra để chặn.
    /// </summary>
    [JsonPropertyName("stageDefaults")]
    public IReadOnlyDictionary<string, bool> StageDefaults { get; init; } =
        new Dictionary<string, bool>(StringComparer.Ordinal);

    /// <summary>Giai đoạn <paramref name="ten"/> có được tích sẵn không (khóa lạ/thiếu → false).</summary>
    public bool BatSan(string ten) => StageDefaults.TryGetValue(ten, out var v) && v;
}

/// <summary>Loại nút CÓ bảng luật chọn phụ kiện (M115 §6 bước 3).</summary>
public enum LoaiNutPhuKien
{
    /// <summary>Nút 2 nhánh đổi hướng, góc nhỏ — co lệch.</summary>
    Co,

    /// <summary>Nút 2 nhánh đổi hướng, góc lớn — cút.</summary>
    Cut,

    /// <summary>Nút 3 nhánh.</summary>
    Te,

    /// <summary>Nút có 2 đoạn liền kề khác cỡ — côn giảm.</summary>
    Giam,
}

/// <summary>
/// Một dòng bảng chọn phụ kiện tại nút (<c>completionPolicy.fittingRules[]</c>).
/// Khớp khi ĐỦ 4 điều: cùng hệ, cùng loại nút, cỡ nút ≤ <see cref="MaxSizeMm"/> (null = bắt hết),
/// và góc đổi hướng nằm trong nửa khoảng [<see cref="MinAngleDeg"/>; <see cref="MaxAngleDeg"/>).
/// </summary>
public sealed class FittingRule
{
    /// <summary>Id hệ theo <c>drawTools.systems[].id</c>.</summary>
    [JsonPropertyName("systemId")] public string SystemId { get; init; } = "";

    /// <summary><c>co</c> | <c>cut</c> | <c>te</c> | <c>giam</c>.</summary>
    [JsonPropertyName("nodeKind")] public string NodeKind { get; init; } = "";

    /// <summary>Ngưỡng cỡ: CẠNH LỚN max(W,H) với tuyến WxH, số DN với tuyến DN. null = bắt hết.</summary>
    [JsonPropertyName("maxSizeMm")] public double? MaxSizeMm { get; init; }

    [JsonPropertyName("minAngleDeg")] public double MinAngleDeg { get; init; }
    [JsonPropertyName("maxAngleDeg")] public double MaxAngleDeg { get; init; }

    /// <summary>Id block trong <c>drawTools.systems[].fittings</c> của ĐÚNG hệ này.</summary>
    [JsonPropertyName("blockId")] public string BlockId { get; init; } = "";

    /// <summary><c>kind</c> của block trong manifest thư viện — chỉ nhận <c>fitting</c>.</summary>
    [JsonPropertyName("blockKind")] public string BlockKind { get; init; } = "";

    /// <summary>Tên phụ kiện đưa vào danh sách duyệt bước 4 và bảng thống kê.</summary>
    [JsonPropertyName("name")] public string Name { get; init; } = "";

    /// <summary>Loại nút của luật; chuỗi lạ → null (validator đã chặn từ lúc nạp rule pack).</summary>
    [JsonIgnore]
    public LoaiNutPhuKien? LoaiNut => CompletionPolicyConfig.DocLoaiNut(NodeKind);

    /// <summary>Góc <paramref name="gocDeg"/> có nằm trong nửa khoảng [min; max) của luật không.</summary>
    public bool HopGoc(double gocDeg) => gocDeg >= MinAngleDeg && gocDeg < MaxAngleDeg;

    /// <summary>Khóa cỡ <paramref name="khoaCo"/> (mm) có thỏa ngưỡng không; null = chưa đọc được cỡ.</summary>
    public bool HopCo(double? khoaCo) => MaxSizeMm is not { } nguong || (khoaCo is { } c && c <= nguong);
}

/// <summary>
/// Bộ kiểm khối <c>completionPolicy</c> (M115 §7 FR5) — tầng C# của validator 2 tầng, cặp với
/// <c>kiemCompletionPolicy()</c> bên TS. Tách class riêng để test nạp thẳng từng ca mà không phải
/// dựng cả một rule pack giả (cùng khuôn <c>DrawToolsConfig.ValidateRoutingPolicy</c>).
/// </summary>
public static class CompletionPolicyConfig
{
    /// <summary>Chuỗi <c>nodeKind</c> → enum; chuỗi lạ → null.</summary>
    public static LoaiNutPhuKien? DocLoaiNut(string nodeKind) => nodeKind switch
    {
        "co" => LoaiNutPhuKien.Co,
        "cut" => LoaiNutPhuKien.Cut,
        "te" => LoaiNutPhuKien.Te,
        "giam" => LoaiNutPhuKien.Giam,
        _ => null,
    };

    /// <summary>
    /// Kiểm khối <c>completionPolicy</c>. Sai → <see cref="RulePackException"/> tiếng Việt.
    /// Khối đang TẮT vẫn kiểm đầy đủ: rule pack phát hành phải khai sẵn tham số dùng được ngay khi
    /// bật (cùng quy ước các khối chính sách v5–v15).
    /// </summary>
    /// <param name="phuKienCuaHe">
    /// <c>drawTools.systems[].id</c> → tập <c>fittings</c> của hệ đó, dùng để bắt id phụ kiện trôi.
    /// </param>
    public static void Validate(
        CompletionPolicySection cp, IReadOnlyDictionary<string, IReadOnlyCollection<string>> phuKienCuaHe)
    {
        const string g = "drawTools.completionPolicy";

        foreach (var (ten, giaTri) in new[]
                 {
                     ("nodeToleranceMm", cp.NodeToleranceMm), ("equipmentSnapMm", cp.EquipmentSnapMm),
                 })
        {
            if (double.IsNaN(giaTri) || giaTri <= 0)
                throw new RulePackException($"{g}.{ten} = {So(giaTri)} phải là số dương.");
        }
        // Tâm block thiết bị luôn lùi vào trong thân máy nên bán kính chạm phải rộng hơn dung sai
        // gộp nút; ngược lại thì mọi đầu tuyến vào thiết bị đều bị báo là tuyến hở.
        if (cp.EquipmentSnapMm < cp.NodeToleranceMm)
        {
            throw new RulePackException(
                $"{g}.equipmentSnapMm = {So(cp.EquipmentSnapMm)} nhỏ hơn nodeToleranceMm = " +
                $"{So(cp.NodeToleranceMm)} — đầu tuyến đã gộp vào nút rồi mà vẫn ngoài bán kính chạm " +
                "thiết bị, mọi kết nối thiết bị sẽ bị báo là tuyến hở.");
        }
        if (double.IsNaN(cp.ElevationToleranceMm) || cp.ElevationToleranceMm < 0)
            throw new RulePackException($"{g}.elevationToleranceMm = {So(cp.ElevationToleranceMm)} không được âm.");
        if (double.IsNaN(cp.MinTurnAngleDeg) || cp.MinTurnAngleDeg <= 0 || cp.MinTurnAngleDeg > 90)
        {
            throw new RulePackException(
                $"{g}.minTurnAngleDeg = {So(cp.MinTurnAngleDeg)} phải nằm trong khoảng (0; 90] — " +
                "đây là ngưỡng coi tuyến là thẳng, giá trị âm/NaN làm mọi đỉnh đều thành một cái co.");
        }

        KiemFittingRules(cp, phuKienCuaHe, g);
        KiemStageDefaults(cp, g);
    }

    private static void KiemFittingRules(
        CompletionPolicySection cp,
        IReadOnlyDictionary<string, IReadOnlyCollection<string>> phuKienCuaHe,
        string g)
    {
        // Khóa gom dải để bắt chồng lấn: cùng hệ + cùng loại nút + cùng ngưỡng cỡ thì 2 khoảng góc
        // không được đè nhau (first-match làm luật đứng sau chết mà không ai biết).
        var daiTheoKhoa = new Dictionary<string, List<(double Min, double Max, string Ten)>>(StringComparer.Ordinal);

        for (var i = 0; i < cp.FittingRules.Count; i++)
        {
            var r = cp.FittingRules[i];
            var nhan = $"{g}.fittingRules[{i}] (\"{(string.IsNullOrWhiteSpace(r.Name) ? r.BlockId : r.Name)}\")";

            if (!phuKienCuaHe.TryGetValue(r.SystemId, out var fittings))
            {
                throw new RulePackException(
                    $"{nhan}: systemId lạ \"{r.SystemId}\" — phải là drawTools.systems[].id " +
                    $"(hợp lệ: {string.Join(", ", phuKienCuaHe.Keys)}).");
            }
            if (!fittings.Contains(r.BlockId))
            {
                throw new RulePackException(
                    $"{nhan}: blockId \"{r.BlockId}\" không có trong fittings của hệ \"{r.SystemId}\" — " +
                    "id phụ kiện đã trôi khỏi drawTools.systems[].fittings.");
            }
            if (r.LoaiNut is null)
            {
                throw new RulePackException(
                    $"{nhan}: nodeKind lạ \"{r.NodeKind}\" (chỉ nhận \"co\", \"cut\", \"te\", \"giam\").");
            }
            if (r.BlockKind != "fitting")
            {
                throw new RulePackException(
                    $"{nhan}: blockKind \"{r.BlockKind}\" — phụ kiện tại nút chỉ nhận kind \"fitting\" " +
                    "(equipment/titleblock/annotation không bao giờ là phụ kiện tại nút).");
            }
            if (string.IsNullOrWhiteSpace(r.Name))
            {
                throw new RulePackException(
                    $"{nhan}: name trống — bảng thống kê/danh sách duyệt ở bước 4 sẽ không đọc được.");
            }
            if (r.MaxSizeMm is { } nguongCo && (double.IsNaN(nguongCo) || nguongCo <= 0))
                throw new RulePackException($"{nhan}: maxSizeMm = {So(nguongCo)} phải dương hoặc null (bắt hết mọi cỡ).");

            if (double.IsNaN(r.MinAngleDeg) || double.IsNaN(r.MaxAngleDeg) ||
                r.MinAngleDeg < 0 || r.MinAngleDeg >= r.MaxAngleDeg || r.MaxAngleDeg > 180)
            {
                throw new RulePackException(
                    $"{nhan}: khoảng góc [{So(r.MinAngleDeg)}; {So(r.MaxAngleDeg)}) không hợp lệ — " +
                    "phải có 0 ≤ minAngleDeg < maxAngleDeg ≤ 180.");
            }
            if (r.LoaiNut is LoaiNutPhuKien.Co or LoaiNutPhuKien.Cut && r.MaxAngleDeg <= cp.MinTurnAngleDeg)
            {
                throw new RulePackException(
                    $"{nhan}: maxAngleDeg = {So(r.MaxAngleDeg)} không lớn hơn minTurnAngleDeg = " +
                    $"{So(cp.MinTurnAngleDeg)} — mọi góc trong dải này đã bị coi là tuyến thẳng nên " +
                    "luật không bao giờ được xét.");
            }

            var khoa = $"{r.SystemId}|{r.NodeKind}|{(r.MaxSizeMm is { } m ? So(m) : "*")}";
            if (!daiTheoKhoa.TryGetValue(khoa, out var dai))
            {
                dai = [];
                daiTheoKhoa[khoa] = dai;
            }
            foreach (var de in dai.Where(d => d.Min < r.MaxAngleDeg && r.MinAngleDeg < d.Max))
            {
                throw new RulePackException(
                    $"{nhan}: khoảng góc [{So(r.MinAngleDeg)}; {So(r.MaxAngleDeg)}) chồng lấn \"{de.Ten}\" " +
                    $"([{So(de.Min)}; {So(de.Max)}), cùng hệ \"{r.SystemId}\", cùng loại nút \"{r.NodeKind}\", " +
                    "cùng ngưỡng cỡ) — first-match làm luật đứng sau không bao giờ được chọn.");
            }
            dai.Add((r.MinAngleDeg, r.MaxAngleDeg, string.IsNullOrWhiteSpace(r.Name) ? r.BlockId : r.Name));
        }
    }

    private static void KiemStageDefaults(CompletionPolicySection cp, string g)
    {
        var thieu = CompletionPolicySection.TenGiaiDoan.Where(t => !cp.StageDefaults.ContainsKey(t)).ToList();
        if (thieu.Count > 0)
        {
            throw new RulePackException(
                $"{g}.stageDefaults thiếu giai đoạn: {string.Join(", ", thieu)} — " +
                "giai đoạn không khai sẽ lặng lẽ mặc định tắt và không ai biết.");
        }
        var thua = cp.StageDefaults.Keys.Where(k => !CompletionPolicySection.TenGiaiDoan.Contains(k)).ToList();
        if (thua.Count > 0)
        {
            throw new RulePackException(
                $"{g}.stageDefaults khai giai đoạn lạ: {string.Join(", ", thua)} " +
                $"(chỉ nhận {string.Join(", ", CompletionPolicySection.TenGiaiDoan)}).");
        }
        if (cp.Enabled && !cp.StageDefaults.Values.Any(v => v))
        {
            throw new RulePackException(
                $"{g}.enabled = true nhưng cả 8 giai đoạn đều tắt — " +
                "XBOSS_HOANTHIEN sẽ chạy xong mà không làm gì.");
        }
    }

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
