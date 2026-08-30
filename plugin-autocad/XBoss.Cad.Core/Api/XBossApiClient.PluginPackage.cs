using System.Net.Http.Json;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần phiên bản gói cài của <see cref="XBossApiClient"/> (M118 PR3 — FR3) —
/// GET /api/engineering/cad/plugin-package.</summary>
public sealed partial class XBossApiClient
{
    /// <summary>
    /// GET /api/engineering/cad/plugin-package — version + sha256 gói cài đang phát hành, để
    /// plugin tự so với version của chính nó (<see cref="SoSanhPhienBan.SoLechPhienBan"/>).
    /// KHÔNG ném khi lỗi mạng/401/403/timeout — caller (<c>TaiPhienBanServer</c> ở Adapter) nuốt
    /// mọi ngoại lệ và coi là "chưa rõ" (§7 FR3: không bao giờ cảnh báo khi không chắc).
    /// </summary>
    public async Task<PluginPackageInfo> FetchPluginPackageAsync(string token, CancellationToken ct = default)
    {
        using var res = await GuiKemToken("api/engineering/cad/plugin-package", token, null, ct);
        await NemNeuLoi(res, ct);
        return await res.Content.ReadFromJsonAsync<PluginPackageInfo>(ct)
            ?? throw new XBossApiException("Server trả response rỗng khi hỏi phiên bản gói cài.");
    }
}
