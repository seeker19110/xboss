using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Client HTTP gọi server XBoss (M99 PR2): ghép thiết bị (pair/poll) + tải rule pack bằng
/// token Bearer. URL server lưu %APPDATA%\XBoss\server.json (không nhạy cảm); token nằm
/// trong Windows Credential Manager (CredentialStore, NFR4). Mọi thông điệp lỗi tiếng Việt.
/// </summary>
internal static class XBossApiClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(30) };

    private static string ConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "server.json");

    private sealed record ServerConfig(string BaseUrl);

    internal static string? DocServerUrl()
    {
        try
        {
            if (!File.Exists(ConfigPath)) return null;
            return JsonSerializer.Deserialize<ServerConfig>(File.ReadAllText(ConfigPath))?.BaseUrl;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    internal static void GhiServerUrl(string baseUrl)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath)!);
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(new ServerConfig(baseUrl)));
    }

    internal sealed record PairResponse(
        [property: JsonPropertyName("deviceCode")] string DeviceCode,
        [property: JsonPropertyName("deviceSecret")] string DeviceSecret,
        [property: JsonPropertyName("expiresIn")] int ExpiresIn);

    internal sealed record PollResponse(
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("token")] string? Token,
        [property: JsonPropertyName("name")] string? Name,
        [property: JsonPropertyName("expiresAt")] string? ExpiresAt);

    /// <summary>POST /api/devices/pair — xin mã ghép. Ném HttpRequestException khi mạng/URL hỏng.</summary>
    internal static PairResponse Pair(string baseUrl, string deviceName)
    {
        var res = Http.PostAsJsonAsync($"{baseUrl.TrimEnd('/')}/api/devices/pair", new { deviceName })
            .GetAwaiter().GetResult();
        KiemHttp(res, "xin mã ghép");
        return res.Content.ReadFromJsonAsync<PairResponse>().GetAwaiter().GetResult()
            ?? throw new HttpRequestException("Server trả về rỗng khi xin mã ghép.");
    }

    /// <summary>POST /api/devices/pair/poll — hỏi trạng thái duyệt. "pending" | "ready" (kèm token)
    /// | null khi mã hết hạn/đã tiêu thụ (404).</summary>
    internal static PollResponse? Poll(string baseUrl, string deviceCode, string deviceSecret)
    {
        var res = Http.PostAsJsonAsync(
                $"{baseUrl.TrimEnd('/')}/api/devices/pair/poll", new { deviceCode, deviceSecret })
            .GetAwaiter().GetResult();
        if (res.StatusCode == HttpStatusCode.NotFound) return null;
        KiemHttp(res, "poll mã ghép");
        return res.Content.ReadFromJsonAsync<PollResponse>().GetAwaiter().GetResult();
    }

    /// <summary>GET /api/engineering/cad/rule-pack với Bearer token. Trả JSON thô (RulePackStore
    /// kiểm + cache); null khi 401 — token hết hạn/bị thu hồi (AC7, caller yêu cầu ghép lại).</summary>
    internal static string? TaiRulePack(string baseUrl, string token)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl.TrimEnd('/')}/api/engineering/cad/rule-pack");
        req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        var res = Http.Send(req);
        if (res.StatusCode == HttpStatusCode.Unauthorized) return null;
        KiemHttp(res, "tải rule pack");
        using var stream = res.Content.ReadAsStream();
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static void KiemHttp(HttpResponseMessage res, string hanhDong)
    {
        if (res.IsSuccessStatusCode) return;
        throw new HttpRequestException(
            $"Server từ chối khi {hanhDong}: HTTP {(int)res.StatusCode} {res.ReasonPhrase}");
    }
}
