using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần ghép thiết bị (XBOSS_LOGIN) của <see cref="XBossApiClient"/> — POST /api/devices/pair(/claim).</summary>
public sealed partial class XBossApiClient
{
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
}
