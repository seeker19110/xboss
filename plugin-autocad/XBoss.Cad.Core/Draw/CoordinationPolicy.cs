using System.Globalization;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Khối <c>drawTools.coordinationPolicy</c> (M116 §7 FR5) — tham số phối hợp xung đột 2D liên hệ,
/// dùng chung cho bộ lệnh <c>XBOSS_PHOIHOP</c> (quét 3 lớp kiểm) và bảng luật sinh đề xuất xử lý.
/// Mặc định <see cref="Enabled"/> = false: khai rồi nhưng chưa bật thì lệnh dừng kèm hướng dẫn
/// cách bật, không đụng bản vẽ (AC4).
///
/// THUẦN — không tham chiếu assembly AutoCAD (M99 FR17). Bản này là đôi của validator TS
/// <c>kiemCoordinationPolicy()</c> trong <c>lib/ky-thuat/cad/rule-pack.ts</c>: sửa luật một bên mà
/// quên bên kia là hai tầng trôi khỏi nhau (ADR-0006 nguyên tắc 1).
/// </summary>
public sealed class CoordinationPolicySection
{
    /// <summary>Giá trị hợp lệ của <see cref="PriorityFrom"/> — bản C# của <c>NGUON_UU_TIEN_PHOI_HOP</c>.</summary>
    public static readonly IReadOnlyList<string> NguonUuTien = ["crossingPolicy"];

    /// <summary>Mặc định false — nạp rule pack mới không đổi hành vi trên máy kỹ sư (AC4).</summary>
    [JsonPropertyName("enabled")] public bool Enabled { get; init; }

    /// <summary>
    /// Nguồn bảng ưu tiên NHƯỜNG ĐƯỜNG; chỉ nhận <c>"crossingPolicy"</c> — dùng THẲNG
    /// <c>drawTools.crossingPolicy.priority</c> (M109) chứ không chép lại danh sách hệ (hai bảng
    /// song song sẽ trôi khỏi nhau, xem <c>priorityFromNote</c> trong rule pack).
    /// </summary>
    [JsonPropertyName("priorityFrom")] public string PriorityFrom { get; init; } = "";

    /// <summary>Bảng khoảng cách tối thiểu theo cặp hệ — lớp kiểm 3, rỗng = lớp 3 không báo gì.</summary>
    [JsonPropertyName("minClearancePairsMm")]
    public IReadOnlyList<CapKhoangCach> MinClearancePairsMm { get; init; } = [];

    /// <summary>Khoảng bảo trì (mm) chừa cho mỗi làn khi kiểm tranh chấp hành lang — lớp kiểm 2.</summary>
    [JsonPropertyName("maintenanceGapMm")] public double MaintenanceGapMm { get; init; }

    /// <summary>
    /// Bảng ưu tiên nhường đường đã phân giải: hệ đứng TRƯỚC giữ cao độ, hệ đứng sau nhường.
    /// <paramref name="crossingPolicy"/> null/chưa khai → danh sách rỗng, nghĩa là KHÔNG suy được
    /// chiều nhường (đề xuất rơi về "cần fitting vượt", không đoán bừa).
    /// </summary>
    public IReadOnlyList<string> HangUuTien(CrossingPolicySection? crossingPolicy) =>
        string.Equals(PriorityFrom, "crossingPolicy", StringComparison.Ordinal)
            ? crossingPolicy?.Priority ?? []
            : [];

    /// <summary>
    /// Khoảng cách tối thiểu (mm) khai cho cặp hệ <paramref name="heA"/> × <paramref name="heB"/>
    /// (không phân biệt thứ tự); null = cặp này không khai ⇒ lớp kiểm 3 bỏ qua.
    /// </summary>
    public double? NguongKhoangCachMm(string heA, string heB)
    {
        foreach (var cap in MinClearancePairsMm)
        {
            if (cap.Khop(heA, heB)) return cap.MinClearanceMm;
        }
        return null;
    }
}

/// <summary>
/// Một dòng bảng khoảng cách quy phạm (<c>coordinationPolicy.minClearancePairsMm[]</c>) — cặp hệ
/// KHÁC nhau kèm khoảng cách mép–mép tối thiểu (mm).
/// </summary>
public sealed class CapKhoangCach
{
    /// <summary>Id hệ theo <c>drawTools.systems[].id</c>.</summary>
    [JsonPropertyName("systemA")] public string SystemA { get; init; } = "";

    /// <summary>Id hệ theo <c>drawTools.systems[].id</c>; phải khác <see cref="SystemA"/>.</summary>
    [JsonPropertyName("systemB")] public string SystemB { get; init; } = "";

    /// <summary>Gần hơn ngưỡng này ⇒ CẢNH BÁO (mức nhẹ nhất trong 3 lớp kiểm).</summary>
    [JsonPropertyName("minClearanceMm")] public double MinClearanceMm { get; init; }

    /// <summary>Dòng luật này có nói về cặp hệ đang xét không (không phân biệt thứ tự).</summary>
    public bool Khop(string heA, string heB) =>
        (string.Equals(SystemA, heA, StringComparison.Ordinal) &&
         string.Equals(SystemB, heB, StringComparison.Ordinal)) ||
        (string.Equals(SystemA, heB, StringComparison.Ordinal) &&
         string.Equals(SystemB, heA, StringComparison.Ordinal));
}

/// <summary>
/// Bộ kiểm khối <c>coordinationPolicy</c> (M116 §7 FR5) — tầng C# của validator 2 tầng, cặp với
/// <c>kiemCoordinationPolicy()</c> bên TS. Tách class riêng để test nạp thẳng từng ca mà không phải
/// dựng cả một rule pack giả (cùng khuôn <see cref="CompletionPolicyConfig"/>).
/// </summary>
public static class CoordinationPolicyConfig
{
    /// <summary>
    /// Kiểm khối <c>coordinationPolicy</c>. Sai → <see cref="RulePackException"/> tiếng Việt.
    /// Khối đang TẮT vẫn kiểm đầy đủ (rule pack phát hành phải khai sẵn tham số dùng được ngay khi
    /// bật), TRỪ ràng buộc "phải có bảng ưu tiên" — ràng buộc đó chỉ có nghĩa khi khối đã bật.
    /// </summary>
    /// <param name="heHopLe">Tập id hệ hợp lệ = <c>drawTools.systems[].id</c>.</param>
    /// <param name="crossingPolicy">Khối <c>crossingPolicy</c> đang khai — nguồn bảng ưu tiên.</param>
    public static void Validate(
        CoordinationPolicySection cp,
        IReadOnlyCollection<string> heHopLe,
        CrossingPolicySection? crossingPolicy)
    {
        const string g = "drawTools.coordinationPolicy";

        if (!CoordinationPolicySection.NguonUuTien.Contains(cp.PriorityFrom, StringComparer.Ordinal))
        {
            throw new RulePackException(
                $"{g}.priorityFrom lạ \"{cp.PriorityFrom}\" (chỉ nhận " +
                $"{string.Join(", ", CoordinationPolicySection.NguonUuTien.Select(n => $"\"{n}\""))}) — " +
                "bảng ưu tiên nhường đường phải tham chiếu khối có thật, không chép lại danh sách hệ.");
        }
        if (cp.Enabled && crossingPolicy is not { Priority.Count: > 0 })
        {
            throw new RulePackException(
                $"{g}.enabled = true nhưng drawTools.crossingPolicy.priority thiếu/rỗng — " +
                "mọi xung đột cứng sẽ không suy được chiều nhường, chỉ còn đề xuất fitting vượt.");
        }

        if (double.IsNaN(cp.MaintenanceGapMm) || cp.MaintenanceGapMm < 0)
        {
            throw new RulePackException(
                $"{g}.maintenanceGapMm = {So(cp.MaintenanceGapMm)} không được âm — " +
                "khoảng bảo trì âm làm hành lang rộng thêm và giấu mất tranh chấp thật.");
        }

        var daKhai = new HashSet<string>(StringComparer.Ordinal);
        for (var i = 0; i < cp.MinClearancePairsMm.Count; i++)
        {
            var cap = cp.MinClearancePairsMm[i];
            var nhan = $"{g}.minClearancePairsMm[{i}] (\"{cap.SystemA}\" × \"{cap.SystemB}\")";

            foreach (var (ten, id) in new[] { ("systemA", cap.SystemA), ("systemB", cap.SystemB) })
            {
                if (!heHopLe.Contains(id))
                {
                    throw new RulePackException(
                        $"{nhan}: {ten} lạ \"{id}\" — phải là drawTools.systems[].id " +
                        $"(hợp lệ: {string.Join(", ", heHopLe)}).");
                }
            }
            if (string.Equals(cap.SystemA, cap.SystemB, StringComparison.Ordinal))
            {
                throw new RulePackException(
                    $"{nhan}: hai vế cùng một hệ \"{cap.SystemA}\" — lớp kiểm khoảng cách chỉ xét cặp " +
                    "KHÁC hệ (cùng hệ là việc của kỹ sư, đúng quy ước crossingPolicy), luật này không " +
                    "bao giờ được xét.");
            }
            if (double.IsNaN(cap.MinClearanceMm) || cap.MinClearanceMm <= 0)
                throw new RulePackException($"{nhan}: minClearanceMm = {So(cap.MinClearanceMm)} phải là số dương.");

            var khoa = string.CompareOrdinal(cap.SystemA, cap.SystemB) <= 0
                ? $"{cap.SystemA}|{cap.SystemB}"
                : $"{cap.SystemB}|{cap.SystemA}";
            if (!daKhai.Add(khoa))
            {
                throw new RulePackException(
                    $"{nhan}: cặp hệ khai trùng — ngưỡng nào thắng sẽ phụ thuộc thứ tự duyệt, " +
                    "hai tầng C#/TS trôi khỏi nhau.");
            }
        }
    }

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
