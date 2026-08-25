using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
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

    // ===== Thư viện block (M100 PR4 — FR2/AC8) =====

    /// <summary>
    /// GET /api/engineering/cad/block-lib?manifest=1 — manifest thư viện block đang phát hành.
    /// Trả (json manifest, etag), hoặc (null, etag) khi 304 — caller giữ bản cache.
    /// Server bọc manifest trong <c>{version, dwgSha256, manifest}</c>; ở đây bóc đúng phần
    /// <c>manifest</c> để đưa thẳng cho <c>BlockManifestLoader</c> (một hình dạng dữ liệu duy nhất).
    /// </summary>
    public async Task<(string? Json, string? Etag)> FetchBlockLibManifestAsync(
        string token, string? etag = null, CancellationToken ct = default)
    {
        using var res = await GuiKemToken("api/engineering/cad/block-lib?manifest=1", token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        await NemNeuLoi(res, ct);

        var body = await res.Content.ReadAsStringAsync(ct);
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("manifest", out var manifest))
                throw new XBossApiException("Server trả response thiếu \"manifest\" của thư viện block.");
            return (manifest.GetRawText(), res.Headers.ETag?.ToString());
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new XBossApiException($"Manifest thư viện block server trả về không phải JSON hợp lệ: {e.Message}");
        }
    }

    /// <summary>
    /// GET /api/engineering/cad/block-lib — tệp .dwg thư viện đang phát hành (nhị phân).
    /// Trả (null, etag) khi 304. Toàn vẹn tệp do caller kiểm bằng sha256 trong manifest (FR2).
    /// </summary>
    public async Task<(byte[]? Dwg, string? Etag)> FetchBlockLibDwgAsync(
        string token, string? etag = null, CancellationToken ct = default)
    {
        using var res = await GuiKemToken("api/engineering/cad/block-lib", token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        await NemNeuLoi(res, ct);
        return (await res.Content.ReadAsByteArrayAsync(ct), res.Headers.ETag?.ToString());
    }

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

    // ===== XBOSS_UPLOAD (M99 PR5) =====

    public sealed record UploadKetQua
    {
        [JsonPropertyName("jobId")] public string JobId { get; init; } = "";
        /// <summary>Danh sách lỗi kiểm định khi server trả 422 (AC5) — rỗng khi được nhận.</summary>
        public IReadOnlyList<string> LoiKiemDinh { get; init; } = [];
        public bool DuocNhan => LoiKiemDinh.Count == 0;
    }

    public sealed record JobTrangThai
    {
        [JsonPropertyName("status")] public string Status { get; init; } = "";
        [JsonPropertyName("revisionId")] public long? RevisionId { get; init; }
        [JsonPropertyName("idempotent")] public bool Idempotent { get; init; }
        [JsonPropertyName("validation")] public JobValidation? Validation { get; init; }
    }

    public sealed record JobValidation
    {
        [JsonPropertyName("ok")] public bool Ok { get; init; }
        [JsonPropertyName("errors")] public IReadOnlyList<string> Errors { get; init; } = [];
        [JsonPropertyName("warnings")] public IReadOnlyList<string> Warnings { get; init; } = [];
    }

    private sealed record UploadTraVe(
        [property: JsonPropertyName("jobId")] string? JobId,
        [property: JsonPropertyName("validation")] JobValidation? Validation,
        [property: JsonPropertyName("error")] string? Error);

    /// <summary>POST /api/engineering/cad/plugin-upload — DWG + DXF sidecar + báo cáo +
    /// rulePackVersion (FR9). 202 = server nhận, poll job; 422 = kiểm định fail (AC5) —
    /// trả danh sách lỗi thay vì ném để command hiện đủ cho kỹ sư.</summary>
    public async Task<UploadKetQua> UploadAsync(
        string token, string drawingCode, string rev, string rulePackVersion,
        string dwgFileName, byte[] dwgBytes, byte[] dxfBytes, string? reportJson,
        CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        form.Add(new ByteArrayContent(dwgBytes), "dwg", dwgFileName);
        form.Add(new ByteArrayContent(dxfBytes), "dxf", Path.ChangeExtension(dwgFileName, ".dxf"));
        if (reportJson is not null)
            form.Add(new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(reportJson)), "report", "report.json");
        form.Add(new StringContent(drawingCode), "drawingCode");
        form.Add(new StringContent(rev), "rev");
        form.Add(new StringContent(rulePackVersion), "rulePackVersion");

        using var req = new HttpRequestMessage(HttpMethod.Post, "api/engineering/cad/plugin-upload")
        {
            Content = form,
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req, ct);
        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN (AC7).");
        if (res.StatusCode == HttpStatusCode.UnprocessableEntity)
        {
            var tu = await res.Content.ReadFromJsonAsync<UploadTraVe>(ct);
            return new UploadKetQua
            {
                JobId = tu?.JobId ?? "",
                LoiKiemDinh = tu?.Validation?.Errors is { Count: > 0 } e ? e : ["Server từ chối kiểm định."],
            };
        }
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
        var ok = await res.Content.ReadFromJsonAsync<UploadTraVe>(ct);
        if (ok?.JobId is not { Length: > 0 } jobId)
            throw new XBossApiException("Server trả response thiếu jobId.");
        return new UploadKetQua { JobId = jobId };
    }

    /// <summary>GET /api/engineering/cad/plugin-upload/:jobId — trạng thái + revisionId.</summary>
    public async Task<JobTrangThai> FetchUploadJobAsync(string token, string jobId, CancellationToken ct = default)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, $"api/engineering/cad/plugin-upload/{jobId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode) throw await LoiTuServer(res, ct);
        return await res.Content.ReadFromJsonAsync<JobTrangThai>(ct)
            ?? throw new XBossApiException("Server trả response rỗng khi hỏi trạng thái job.");
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
