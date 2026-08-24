using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>
/// Client HTTP gọi XBoss server (M99 PR2) — nằm ở Core (thuần .NET, không AutoCAD) để unit
/// test được bằng HttpMessageHandler giả. Adapter chỉ cầm token (Credential Manager) và
/// hiển thị. Luồng ghép: StartPairingAsync → kỹ sư duyệt trên web → ClaimAsync (poll).
/// </summary>
public sealed class XBossApiClient
{
    private readonly HttpClient _http;

    /// <summary>baseUrl dạng https://xboss.example.com (không / cuối).</summary>
    public XBossApiClient(string baseUrl, HttpMessageHandler? handler = null)
    {
        _http = handler is null ? new HttpClient() : new HttpClient(handler);
        _http.BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/");
        _http.Timeout = TimeSpan.FromSeconds(30);
    }

    public sealed record PairStart
    {
        [JsonPropertyName("userCode")] public string UserCode { get; init; } = "";
        [JsonPropertyName("deviceCode")] public string DeviceCode { get; init; } = "";
        [JsonPropertyName("expiresIn")] public int ExpiresInSeconds { get; init; }
        [JsonPropertyName("confirmPath")] public string ConfirmPath { get; init; } = "";
    }

    public sealed record ClaimOk
    {
        [JsonPropertyName("key")] public string Key { get; init; } = "";
        [JsonPropertyName("expiresAt")] public string ExpiresAt { get; init; } = "";
        [JsonPropertyName("deviceName")] public string DeviceName { get; init; } = "";
    }

    /// <summary>Kết quả 1 lần poll claim.</summary>
    public enum ClaimStatus
    {
        Pending,
        Ok,
        HetHan,
        TuChoi,
        Loi,
    }

    private sealed record LoiJson([property: JsonPropertyName("error")] string? Error);

    /// <summary>POST /api/devices/pair — xin mã ghép. Ném XBossApiException (thông điệp
    /// tiếng Việt) khi server từ chối.</summary>
    public async Task<PairStart> StartPairingAsync(string deviceName, CancellationToken ct = default)
    {
        using var res = await _http.PostAsJsonAsync("api/devices/pair", new { deviceName }, ct);
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
        return await res.Content.ReadFromJsonAsync<PairStart>(ct)
            ?? throw new XBossApiException("Server trả response rỗng khi xin mã ghép.");
    }

    /// <summary>POST /api/devices/pair/claim — 1 lần poll. Không ném với các trạng thái chờ/
    /// từ chối/hết hạn (caller quyết vòng lặp); chỉ ném khi lỗi mạng/response lạ.</summary>
    public async Task<(ClaimStatus Status, ClaimOk? Ok, string? ThongDiep)> ClaimAsync(
        string deviceCode, CancellationToken ct = default)
    {
        using var res = await _http.PostAsJsonAsync("api/devices/pair/claim", new { deviceCode }, ct);
        switch (res.StatusCode)
        {
            case HttpStatusCode.Accepted:
                return (ClaimStatus.Pending, null, null);
            case HttpStatusCode.OK:
            {
                var ok = await res.Content.ReadFromJsonAsync<ClaimOk>(ct);
                if (ok is null || ok.Key.Length == 0)
                    return (ClaimStatus.Loi, null, "Server trả response thiếu key.");
                return (ClaimStatus.Ok, ok, null);
            }
            case HttpStatusCode.Gone:
                return (ClaimStatus.HetHan, null, "Mã ghép đã hết hạn — chạy lại XBOSS_LOGIN.");
            case HttpStatusCode.Forbidden:
                return (ClaimStatus.TuChoi, null, "Mã ghép đã bị từ chối trên web.");
            default:
                return (ClaimStatus.Loi, null, (await DocLoi(res, ct)) ?? $"Lỗi server ({(int)res.StatusCode}).");
        }
    }

    /// <summary>Vòng poll claim trọn gói: gọi ClaimAsync mỗi <paramref name="delay"/> cho tới khi
    /// có kết quả cuối hoặc hết <paramref name="timeout"/>. Delay bơm từ ngoài để test không chờ thật.</summary>
    public async Task<(ClaimStatus Status, ClaimOk? Ok, string? ThongDiep)> PollClaimAsync(
        string deviceCode,
        TimeSpan delay,
        TimeSpan timeout,
        Func<TimeSpan, CancellationToken, Task>? cho = null,
        CancellationToken ct = default)
    {
        cho ??= Task.Delay;
        var hetGio = DateTime.UtcNow + timeout;
        while (true)
        {
            var kq = await ClaimAsync(deviceCode, ct);
            if (kq.Status != ClaimStatus.Pending) return kq;
            if (DateTime.UtcNow + delay > hetGio)
                return (ClaimStatus.HetHan, null, "Hết thời gian chờ duyệt — chạy lại XBOSS_LOGIN.");
            await cho(delay, ct);
        }
    }

    /// <summary>GET /api/engineering/cad/rule-pack với Bearer token + ETag. Trả (json, etag)
    /// hoặc (null, etag) khi 304 — caller giữ bản cache.</summary>
    public async Task<(string? Json, string? Etag)> FetchRulePackAsync(
        string token, string? etag = null, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, "api/engineering/cad/rule-pack");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (etag is not null) req.Headers.TryAddWithoutValidation("If-None-Match", etag);
        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN (AC7).");
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        return (json, res.Headers.ETag?.ToString());
    }

    // ===== XBOSS_UPLOAD (M99 PR5) =====

    public sealed record UploadInput
    {
        public required byte[] DwgBytes { get; init; }
        public required string DwgFileName { get; init; }
        public required string DxfContent { get; init; }
        /// <summary>report JSON từ XBOSS_CHUANHOA — null khi chưa chuẩn hóa qua plugin.</summary>
        public string? ReportJson { get; init; }
        public required string RulePackVersion { get; init; }
        public required string DrawingCode { get; init; }
        public required string DrawingName { get; init; }
        public required string Systems { get; init; }
        public required string Rev { get; init; }
    }

    public sealed record UploadAccepted
    {
        [JsonPropertyName("status")] public string Status { get; init; } = "";
        [JsonPropertyName("jobId")] public string? JobId { get; init; }
        [JsonPropertyName("drawingId")] public int? DrawingId { get; init; }
        [JsonPropertyName("revisionId")] public int? RevisionId { get; init; }
    }

    public sealed record UploadJobStatus
    {
        [JsonPropertyName("status")] public string Status { get; init; } = ""; // processing|ok|rejected|error
        [JsonPropertyName("revisionId")] public int? RevisionId { get; init; }
        [JsonPropertyName("validation")] public JsonElement? Validation { get; init; }
    }

    /// <summary>POST multipart DWG + DXF sidecar + report (M99 §10). 202/200 → UploadAccepted
    /// (status "accepted" hoặc "duplicated"); lỗi nghiệp vụ (422/409/413…) → XBossApiException
    /// mang thông điệp tiếng Việt của server.</summary>
    public async Task<UploadAccepted> UploadAsync(string token, UploadInput input, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        var dwg = new ByteArrayContent(input.DwgBytes);
        dwg.Headers.ContentType = new MediaTypeHeaderValue("application/acad");
        form.Add(dwg, "dwg", input.DwgFileName);
        form.Add(new StringContent(input.DxfContent), "dxf", "sidecar.dxf");
        if (input.ReportJson is not null) form.Add(new StringContent(input.ReportJson), "report");
        form.Add(new StringContent(input.RulePackVersion), "rulePackVersion");
        form.Add(new StringContent(input.DrawingCode), "drawingCode");
        form.Add(new StringContent(input.DrawingName), "drawingName");
        form.Add(new StringContent(input.Systems), "systems");
        form.Add(new StringContent(input.Rev), "rev");

        using var req = new HttpRequestMessage(HttpMethod.Post, "api/engineering/cad/plugin-upload")
        {
            Content = form,
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN (AC7).");
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
        return await res.Content.ReadFromJsonAsync<UploadAccepted>(ct)
            ?? throw new XBossApiException("Server trả response rỗng khi nộp bản vẽ.");
    }

    /// <summary>Poll GET :jobId cho tới khi hết processing hoặc hết timeout — delay bơm được
    /// từ ngoài để test không chờ thật (cùng pattern PollClaimAsync).</summary>
    public async Task<UploadJobStatus> PollUploadJobAsync(
        string token,
        string jobId,
        TimeSpan delay,
        TimeSpan timeout,
        Func<TimeSpan, CancellationToken, Task>? cho = null,
        CancellationToken ct = default)
    {
        cho ??= Task.Delay;
        var hetGio = DateTime.UtcNow + timeout;
        while (true)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"api/engineering/cad/plugin-upload/{jobId}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
            var trangThai = await res.Content.ReadFromJsonAsync<UploadJobStatus>(ct)
                ?? throw new XBossApiException("Server trả response rỗng khi hỏi trạng thái job.");
            if (trangThai.Status != "processing") return trangThai;
            if (DateTime.UtcNow + delay > hetGio)
                return trangThai; // vẫn processing — caller báo kỹ sư kiểm tra sau trên web
            await cho(delay, ct);
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
