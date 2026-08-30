using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// Client HTTP gọi XBoss server (M99 PR2) — nằm ở Core (thuần .NET, không AutoCAD) để unit
/// test được bằng HttpMessageHandler giả. Adapter chỉ cầm token (Credential Manager) và
/// hiển thị. Luồng ghép: StartPairingAsync → kỹ sư duyệt trên web → ClaimAsync (poll).
///
/// Tách thành các file <c>partial</c> theo domain route (Pairing/RulePack/PluginPackage/
/// BlockLibrary/BlockProposals/Boq/Schematic/Upload) — GIỮ NGUYÊN một class/API công khai
/// duy nhất (không đổi call site nào), chỉ gọn hoá việc điều hướng trong file gốc từng dài
/// gần 900 dòng gộp mọi domain. File này chỉ còn phần dùng chung: ctor + helper HTTP nội bộ.
/// </summary>
public sealed partial class XBossApiClient
{
    private readonly HttpClient _http;

    /// <summary>baseUrl dạng https://xboss.example.com (không / cuối).</summary>
    public XBossApiClient(string baseUrl, HttpMessageHandler? handler = null)
    {
        _http = handler is null ? new HttpClient() : new HttpClient(handler);
        _http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    private sealed record LoiJson([property: JsonPropertyName("error")] string? Error);

    private async Task<HttpResponseMessage> GuiKemToken(
        string duongDan, string token, string? etag, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, duongDan);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (etag is not null) req.Headers.TryAddWithoutValidation("If-None-Match", etag);
        return await _http.SendAsync(req, ct);
    }

    private static async Task NemNeuLoi(HttpResponseMessage res, CancellationToken ct)
    {
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN (AC7).");
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
    }

    private static void ThemPhan(
        MultipartFormDataContent form, HttpContent noiDung, string ten, string? tenTep = null)
    {
        var cd = new ContentDispositionHeaderValue("form-data") { Name = $"\"{ten}\"" };
        if (tenTep is not null) cd.FileName = $"\"{tenTep}\"";
        noiDung.Headers.ContentDisposition = cd;
        form.Add(noiDung);
    }

    private static IReadOnlyList<DuAnTomTat> DocDanhSachDuAn(string body)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("duAn", out var ds)) return [];
            return System.Text.Json.JsonSerializer.Deserialize<List<DuAnTomTat>>(ds.GetRawText()) ?? [];
        }
        catch (System.Text.Json.JsonException)
        {
            return [];
        }
    }

    private static string? DocLoiTuChuoi(string body)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            return doc.RootElement.TryGetProperty("error", out var e) ? e.GetString() : null;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static async Task<string?> DocLoi(HttpResponseMessage res, CancellationToken ct)
    {
        try
        {
            var loi = await res.Content.ReadFromJsonAsync<LoiJson>(ct);
            return loi?.Error;
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static async Task<XBossApiException> LoiTuServer(HttpResponseMessage res, CancellationToken ct) =>
        new(await DocLoi(res, ct) ?? $"Server trả lỗi {(int)res.StatusCode}.");
}

/// <summary>Lỗi gọi API XBoss — thông điệp tiếng Việt, hiện thẳng trong AutoCAD.</summary>
public sealed class XBossApiException(string message) : Exception(message);
