using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Tóm tắt BỘ BLOCK RIÊNG CỦA DỰ ÁN mà máy chủ trả kèm manifest đã trộn (M113 §4/§6 — khóa
/// <c>boDuAn</c> của <c>GET /api/engineering/cad/block-lib?project=…&amp;manifest=1</c>).
///
/// Vì sao phải là dữ liệu riêng chứ không nằm trong manifest: manifest đã trộn giữ nguyên hợp đồng
/// M100 §11, <c>dwgSha256</c> của nó nói về tệp nền TOÀN CỤC. Bộ của dự án là tệp .dwg thứ hai,
/// hash kiểm theo TỪNG bộ (§4.5) nên hash của nó phải đi kèm ở đây.
/// Máy chủ bản cũ / dự án chưa phát hành bộ riêng ⇒ <c>null</c>, không có gì để tải thêm.
/// </summary>
public sealed record BoBlockDuAn
{
    [JsonPropertyName("version")] public string Version { get; init; } = "";
    [JsonPropertyName("dwgSha256")] public string DwgSha256 { get; init; } = "";
}

/// <summary>
/// Siêu dữ liệu của cache "thư viện đã trộn" trên máy kỹ sư (M113 PR4) — ghi cạnh manifest trộn,
/// KHÔNG phải dữ liệu máy chủ phát hành.
///
/// Cache trộn là ô THỨ HAI, nằm song song với cache toàn cục (<c>manifest.json</c>/<c>blocks.dwg</c>)
/// chứ không thay thế nó: đường đề xuất block M103 (<c>XBOSS_VE_DEXUAT</c>) phải dựng ứng viên trên
/// đúng manifest TOÀN CỤC vì máy chủ so <c>base_lib_version</c> với bộ toàn cục hiện hành. Trộn hai
/// ô làm một là mọi đề xuất của kỹ sư dự án bị từ chối (409 stale / 422 manifest lệch).
/// </summary>
public sealed record BoTronCache
{
    /// <summary>Dự án mà bộ trộn này thuộc về — khác dự án đang chọn thì cache KHÔNG được dùng.</summary>
    [JsonPropertyName("duAnId")] public long DuAnId { get; init; }

    /// <summary>Version bộ toàn cục góp vào bản trộn (null = máy chủ chưa phát hành bộ toàn cục).</summary>
    [JsonPropertyName("versionToanCuc")] public string? VersionToanCuc { get; init; }

    /// <summary>Version bộ riêng của dự án (null = dự án chưa phát hành bộ riêng).</summary>
    [JsonPropertyName("versionDuAn")] public string? VersionDuAn { get; init; }

    /// <summary>sha256 tệp .dwg nền của bộ dự án — dùng kiểm tệp <c>blocks-tron-duan.dwg</c>.</summary>
    [JsonPropertyName("dwgSha256DuAn")] public string? DwgSha256DuAn { get; init; }

    /// <summary>Mô tả tiếng Việt hai bộ đang dùng, cho <c>XBOSS_BANG</c> (FR6).</summary>
    public string MoTaHaiBo =>
        $"toàn cục {VersionToanCuc ?? "(chưa có)"} + dự án #" +
        DuAnId.ToString(CultureInfo.InvariantCulture) + " " + (VersionDuAn ?? "(chưa có bộ riêng)");

    public string GhiJson() => JsonSerializer.Serialize(this);

    /// <summary>Đọc siêu dữ liệu cache; JSON hỏng/rỗng → null (coi như chưa có cache trộn).</summary>
    public static BoTronCache? DocJson(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<BoTronCache>(json);
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
