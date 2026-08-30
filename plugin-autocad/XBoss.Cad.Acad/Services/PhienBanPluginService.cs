using System.Reflection;
using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Core.Api;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// M118 PR3 (FR3) — cảnh báo phiên bản plugin lệch server. Đọc version của CHÍNH plugin từ
/// <see cref="AssemblyInformationalVersionAttribute"/> (nhúng từ thẻ &lt;Version&gt; của
/// <c>Directory.Build.props</c> lúc build — cùng nguồn sự thật duy nhất với
/// <c>dong-goi.ps1</c>, không hard-code), rồi hỏi server phiên bản đang phát hành để so bằng
/// <see cref="SoSanhPhienBan.SoLechPhienBan"/> (Core, thuần). Mọi lỗi mạng/xác thực đều bị nuốt
/// im lặng ở đây — cảnh báo version KHÔNG BAO GIỜ được chặn lệnh đang chạy (§7 FR3).
/// </summary>
internal static class PhienBanPluginService
{
    /// <summary>Version của chính plugin đang chạy — đọc một lần, không đổi trong phiên.</summary>
    internal static readonly string PluginVersion =
        Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? "?";

    /// <summary>
    /// Hỏi server phiên bản gói cài đang phát hành. Timeout ngắn (20s, đúng khuôn
    /// <c>TaiSnapshotBoq</c> ở <c>XBossCommands.cs</c>), KHÔNG retry, KHÔNG ném — trả null với
    /// mọi trục trặc (mất mạng/401/403/timeout/server chưa cấu hình version).
    /// </summary>
    internal static async Task<string?> TaiPhienBanServerAsync(CancellationToken ct = default)
    {
        var baseUrl = XBossLoginCommand.DocServerUrl();
        if (baseUrl is null) return null;
        if (CredentialStore.DocToken(baseUrl) is not { } token) return null;
        try
        {
            using var huy = CancellationTokenSource.CreateLinkedTokenSource(ct);
            huy.CancelAfter(TimeSpan.FromSeconds(20));
            var thongTin = await new XBossApiClient(baseUrl).FetchPluginPackageAsync(token, huy.Token);
            return thongTin.Version;
        }
        catch (XBossApiException)
        {
            return null;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (TaskCanceledException)
        {
            return null;
        }
    }

    /// <summary>
    /// Đồng bộ (khuôn <c>TaiSnapshotBoq</c>) — gọi được từ lệnh AutoCAD ĐỒNG BỘ như
    /// <c>XBOSS_RULEPACK</c>. Bọc <c>Task.Run</c> để không deadlock nếu ngữ cảnh lệnh có
    /// SynchronizationContext.
    /// </summary>
    internal static string? TaiPhienBanServer()
    {
        try
        {
            return Task.Run(() => TaiPhienBanServerAsync()).GetAwaiter().GetResult();
        }
        catch (Exception) // im lặng tuyệt đối — cảnh báo version không bao giờ chặn lệnh (§7 FR3)
        {
            return null;
        }
    }

    /// <summary>Dòng cảnh báo in ở cuối <c>XBOSS_RULEPACK</c> khi phiên bản lệch; null = khớp/chưa
    /// rõ (không in gì thêm — §6 "không bao giờ hiện cảnh báo khi không chắc").</summary>
    internal static string? DongCanhBaoLech(string? serverVersion, string appUrl)
    {
        if (SoSanhPhienBan.SoLechPhienBan(PluginVersion, serverVersion) != LechPhienBan.Lech) return null;
        return $"⚠ Plugin đang chạy {PluginVersion}, server phát hành {serverVersion} — " +
               $"tải bản mới tại {appUrl}/engineering/cai-dat-plugin";
    }
}
