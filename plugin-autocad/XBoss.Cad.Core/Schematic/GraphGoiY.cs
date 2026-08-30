using System.Text.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Api;

namespace XBoss.Cad.Core.Schematic;

/// <summary>
/// Một NÚT của sơ đồ nguyên lý đã được người duyệt chốt trên web (M117 §9 — hợp đồng JSONB
/// <c>cad_schematic_graphs.graph.nodes[]</c>). Chỉ giữ đúng các trường plugin cần: khóa lạ của
/// bản sau bị bỏ qua, không coi là dữ liệu hỏng (cùng luật "khóa lạ bỏ qua" của XData M100 §11).
/// </summary>
public sealed record NutGoiY
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";

    /// <summary><c>thiet_bi</c> | <c>nut_re</c> | <c>dau_ho</c> — chỉ <c>thiet_bi</c> mới ánh xạ.</summary>
    [JsonPropertyName("loai")] public string Loai { get; init; } = "";

    /// <summary>Loại block theo thư viện (<c>fitting</c>/<c>equipment</c>…); null = chưa quyết được.</summary>
    [JsonPropertyName("kind")] public string? Kind { get; init; }

    [JsonPropertyName("blockName")] public string? BlockName { get; init; }
    [JsonPropertyName("tag")] public string? Tag { get; init; }
    [JsonPropertyName("systemId")] public string? SystemId { get; init; }
    [JsonPropertyName("x")] public double X { get; init; }
    [JsonPropertyName("y")] public double Y { get; init; }

    /// <summary>Nút mang thiết bị thật (khác nút rẽ hình học/đầu hở).</summary>
    public bool LaThietBi => string.Equals(Loai, "thiet_bi", StringComparison.Ordinal);

    /// <summary>Nhãn hiện cho kỹ sư: tag nếu có, không thì tên block, cuối cùng là id nút.</summary>
    public string Nhan =>
        !string.IsNullOrWhiteSpace(Tag) ? Tag!.Trim()
        : !string.IsNullOrWhiteSpace(BlockName) ? BlockName!.Trim()
        : Id;
}

/// <summary>Một CẠNH của sơ đồ nguyên lý (M117 §9 — <c>graph.edges[]</c>).</summary>
public sealed record CanhGoiY
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("from")] public string From { get; init; } = "";
    [JsonPropertyName("to")] public string To { get; init; } = "";

    /// <summary>Cỡ đọc từ schematic (<c>600x300</c>, <c>DN100</c>); null = chưa đọc được.</summary>
    [JsonPropertyName("size")] public string? Size { get; init; }
}

/// <summary>Đồ thị kết nối của sơ đồ nguyên lý.</summary>
public sealed record GraphGoiY
{
    [JsonPropertyName("version")] public int Version { get; init; }
    [JsonPropertyName("nodes")] public IReadOnlyList<NutGoiY> Nodes { get; init; } = [];
    [JsonPropertyName("edges")] public IReadOnlyList<CanhGoiY> Edges { get; init; } = [];

    /// <summary>Cỡ tuyến chạy tới một nút: cỡ của cạnh ĐẦU TIÊN chạm nút mà có size (thứ tự cạnh
    /// do máy chủ chốt nên hai lần chạy cho cùng kết quả). Không cạnh nào có size ⇒ null: lệnh
    /// dùng cỡ kỹ sư khai, KHÔNG bịa cỡ.</summary>
    public string? SizeCuaNut(string nutId) => Edges
        .Where(e => string.Equals(e.From, nutId, StringComparison.Ordinal) ||
                    string.Equals(e.To, nutId, StringComparison.Ordinal))
        .Select(e => e.Size)
        .FirstOrDefault(s => !string.IsNullOrWhiteSpace(s));
}

/// <summary>
/// Bản ghi sơ đồ nguyên lý máy chủ trả cho plugin
/// (<c>GET /api/engineering/cad/schematic/:id/plugin</c> — M117 §7 FR5). Máy chủ chỉ trả bản
/// <c>da_duyet</c> (bản <c>nhap</c> ⇒ 409), nhưng plugin vẫn kiểm lại: bản cache trên đĩa có thể
/// là bản chép tay từ máy khác.
/// </summary>
public sealed record BanGoiY
{
    [JsonPropertyName("id")] public long Id { get; init; }
    [JsonPropertyName("projectId")] public long ProjectId { get; init; }
    [JsonPropertyName("systemId")] public string SystemId { get; init; } = "";
    [JsonPropertyName("trangThai")] public string TrangThai { get; init; } = "";
    [JsonPropertyName("duyetLuc")] public string? DuyetLuc { get; init; }
    [JsonPropertyName("graph")] public GraphGoiY Graph { get; init; } = new();

    /// <summary>Đã có người chịu trách nhiệm chốt (guardrail M117 §2b — hai chốt người duyệt).</summary>
    public bool DaDuyet => string.Equals(TrangThai, "da_duyet", StringComparison.Ordinal);

    /// <summary>
    /// Mã phiên ghi vào XData <c>phien</c> của mọi tuyến NHÁP sinh từ bản này — khóa idempotency
    /// (M117 §8 AC5): chạy lại lệnh xóa đúng tuyến mang mã này rồi sinh lại, không đụng thực thể
    /// nào khác. Cố ý dùng lại khóa XData sẵn có, KHÔNG đẻ khóa/appname mới.
    /// </summary>
    public string MaPhien => MaPhienCua(Id);

    /// <summary>Mã phiên của một id graph — dùng cả ở lệnh xóa (không cần tải graph về).</summary>
    public static string MaPhienCua(long id) => $"goiy-{id}";

    /// <summary>Id graph đọc ngược từ mã phiên; null = mã của lệnh khác (không phải tuyến nháp).</summary>
    public static long? IdTuMaPhien(string? maPhien)
    {
        if (maPhien is null || !maPhien.StartsWith("goiy-", StringComparison.Ordinal)) return null;
        return long.TryParse(maPhien.AsSpan(5), out var id) ? id : null;
    }

    /// <summary>Đọc JSON máy chủ/cache; hỏng → <see cref="XBossApiException"/> tiếng Việt.</summary>
    public static BanGoiY TuJson(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<BanGoiY>(json)
                   ?? throw new XBossApiException("Sơ đồ nguyên lý trả về rỗng.");
        }
        catch (JsonException e)
        {
            throw new XBossApiException($"Sơ đồ nguyên lý không phải JSON hợp lệ: {e.Message}");
        }
    }
}
