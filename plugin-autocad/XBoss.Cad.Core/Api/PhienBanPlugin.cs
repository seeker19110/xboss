using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// M118 PR3 (FR3) — so version của chính plugin đang chạy với version server đang phát hành,
/// để cảnh báo kỹ sư khi máy trạm dùng bản cũ. LOGIC THUẦN (không chạm AutoCAD), test được trên
/// CI Linux bằng xunit — Core CẤM tham chiếu assembly AutoCAD.
/// </summary>
public enum LechPhienBan
{
    /// <summary>Thiếu version một trong hai vế (hoặc cả hai) — không đủ dữ liệu để kết luận,
    /// KHÔNG được coi là lệch (fail mềm, tránh cảnh báo giả khi mất mạng/server chưa cấu hình).</summary>
    ChuaRo,
    Khop,
    Lech,
}

/// <summary>Thông tin gói cài server đang phát hành — khớp response GET
/// <c>/api/engineering/cad/plugin-package</c> (<c>{ version, sha256 }</c>).</summary>
public sealed record PluginPackageInfo
{
    [JsonPropertyName("version")] public string? Version { get; init; }
    [JsonPropertyName("sha256")] public string? Sha256 { get; init; }
}

public static class SoSanhPhienBan
{
    /// <summary>
    /// So version plugin đang chạy (<paramref name="cuaPlugin"/>) với version server phát hành
    /// (<paramref name="cuaServer"/>). Server là NGUỒN SỰ THẬT — chỉ so KHÁC chuỗi sau khi chuẩn
    /// hoá (trim + cắt hậu tố build metadata từ ký tự '+' nếu có, vd SourceLink gắn "+abcdef123"),
    /// KHÔNG so lớn/nhỏ (server không hứa phát hành số tăng dần một chiều).
    /// null/rỗng ở một trong hai vế ⇒ <see cref="LechPhienBan.ChuaRo"/> — không đủ dữ liệu, không
    /// bao giờ báo lệch khi không chắc (§6/§7 FR3).
    /// </summary>
    public static LechPhienBan SoLechPhienBan(string? cuaPlugin, string? cuaServer)
    {
        var a = ChuanHoa(cuaPlugin);
        var b = ChuanHoa(cuaServer);
        if (a is null || b is null) return LechPhienBan.ChuaRo;
        return a == b ? LechPhienBan.Khop : LechPhienBan.Lech;
    }

    private static string? ChuanHoa(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return null;
        var s = v.Trim();
        var viTri = s.IndexOf('+');
        if (viTri >= 0) s = s[..viTri];
        return s.Length == 0 ? null : s;
    }
}
