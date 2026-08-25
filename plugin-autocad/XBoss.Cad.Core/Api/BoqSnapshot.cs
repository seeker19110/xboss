using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// Một dòng KL BOQ hợp đồng lấy từ máy chủ (<c>GET /api/engineering/cad/boq-snapshot?project=</c>,
/// M101 §6.3 PR4) — chỉ ĐỌC, đặt cạnh KL bóc trong sheet phụ <c>Doi-chieu</c>.
/// </summary>
public sealed record BoqSnapshotDong
{
    /// <summary>Id hạng mục bóc tách trong rule pack (<c>takeoff.items[].id</c>).</summary>
    [JsonPropertyName("takeoffItemId")] public string TakeoffItemId { get; init; } = "";

    /// <summary>Mã BOQ đã gán cho hạng mục này ở dự án (Admin/PM nhập trên web).</summary>
    [JsonPropertyName("boqCode")] public string BoqCode { get; init; } = "";

    /// <summary>Tên dòng BOQ trên hệ thống; null = chưa có dòng nào mang mã đó.</summary>
    [JsonPropertyName("ten")] public string? Ten { get; init; }

    [JsonPropertyName("donVi")] public string? DonVi { get; init; }

    /// <summary>
    /// KL hợp đồng. <c>null</c> = CHƯA KHỚP được dòng BOQ nào — khác hẳn 0 (khớp nhưng khối
    /// lượng bằng 0); sheet đối chiếu để trống ô thay vì ghi 0 rồi báo chênh lệch giả.
    /// </summary>
    [JsonPropertyName("qtyContract")] public double? QtyContract { get; init; }
}

/// <summary>Ảnh chụp KL BOQ hợp đồng của một dự án tại một thời điểm (chỉ đọc).</summary>
public sealed record BoqSnapshot
{
    [JsonPropertyName("projectId")] public long ProjectId { get; init; }
    [JsonPropertyName("rulePackVersion")] public string RulePackVersion { get; init; } = "";

    /// <summary>Thời điểm máy chủ chụp số liệu (ISO) — in vào sheet để QS biết số của lúc nào.</summary>
    [JsonPropertyName("chupLuc")] public string ChupLuc { get; init; } = "";

    [JsonPropertyName("dong")] public IReadOnlyList<BoqSnapshotDong> Dong { get; init; } = [];

    /// <summary>Đọc JSON máy chủ trả về; JSON hỏng → XBossApiException tiếng Việt (không ném JsonException thô).</summary>
    public static BoqSnapshot TuJson(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<BoqSnapshot>(json)
                   ?? throw new XBossApiException("Máy chủ trả về đối chiếu BOQ rỗng.");
        }
        catch (JsonException e)
        {
            throw new XBossApiException($"Đối chiếu BOQ máy chủ trả về không phải JSON hợp lệ: {e.Message}");
        }
    }
}

/// <summary>Dự án rút gọn — máy chủ trả kèm khi người dùng thuộc nhiều dự án và chưa chỉ định.</summary>
public sealed record DuAnTomTat
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("name")] public string Name { get; init; } = "";
}

/// <summary>
/// Máy chủ chưa biết lấy dự án nào (người dùng thuộc nhiều dự án) — mang theo danh sách để lệnh
/// hỏi kỹ sư chọn. Danh sách do MÁY CHỦ cấp, lựa chọn vẫn được máy chủ kiểm lại ở lần gọi sau.
/// </summary>
public sealed class XBossCanChonDuAnException(string message, IReadOnlyList<DuAnTomTat> duAn)
    : Exception(message)
{
    public IReadOnlyList<DuAnTomTat> DuAn { get; } = duAn;
}
