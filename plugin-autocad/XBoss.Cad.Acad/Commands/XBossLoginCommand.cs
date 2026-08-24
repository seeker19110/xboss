using System.Text.Json;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.RulePack;
using AcadApp = Autodesk.AutoCAD.ApplicationServices.Application;

[assembly: CommandClass(typeof(XBoss.Cad.Acad.Commands.XBossLoginCommand))]

namespace XBoss.Cad.Acad.Commands;

/// <summary>
/// XBOSS_LOGIN (M99 PR2 — journey §6.1): ghép thiết bị với server XBoss theo device flow:
/// xin mã → kỹ sư duyệt trên web (/engineering/thiet-bi-cad) → poll nhận token (đúng 1 lần)
/// → cất Windows Credential Manager (NFR4) → tải rule pack mới nhất bằng token (ETag).
/// Async command: vòng poll await Task.Delay nên KHÔNG chặn UI AutoCAD (NFR3).
/// </summary>
public sealed class XBossLoginCommand
{
    private sealed record ServerConfig(string BaseUrl);

    private static string ServerConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss", "server.json");

    /// <summary>Server đã ghép gần nhất — XBOSS_UPLOAD dùng chung (kèm token trong Credential Manager).</summary>
    internal static string? ServerUrlDaLuu() => DocServerUrl();

    private static string? DocServerUrl()
    {
        try
        {
            if (!File.Exists(ServerConfigPath)) return null;
            return JsonSerializer.Deserialize<ServerConfig>(File.ReadAllText(ServerConfigPath))?.BaseUrl;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void LuuServerUrl(string baseUrl)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ServerConfigPath)!);
        File.WriteAllText(ServerConfigPath, JsonSerializer.Serialize(new ServerConfig(baseUrl)));
    }

    [CommandMethod("XBOSS_LOGIN", CommandFlags.Session)]
    public async void DangNhap()
    {
        var doc = AcadApp.DocumentManager.MdiActiveDocument;
        if (doc is null) return;
        var ed = doc.Editor;
        if (!PluginExtension.DungDoiAutoCad)
        {
            ed.WriteMessage("\n[XBoss] Plugin chỉ hỗ trợ AutoCAD 2026 — lệnh bị từ chối.\n");
            return;
        }

        // 1) Địa chỉ server (nhớ giữa các lần).
        var macDinh = DocServerUrl() ?? "";
        var hoiUrl = new PromptStringOptions(
            $"\n[XBoss] Địa chỉ server XBoss{(macDinh.Length > 0 ? $" <{macDinh}>" : " (vd https://xboss.congty.vn)")}: ")
        {
            AllowSpaces = false,
        };
        var kqUrl = ed.GetString(hoiUrl);
        if (kqUrl.Status != PromptStatus.OK) return;
        var baseUrl = kqUrl.StringResult.Length > 0 ? kqUrl.StringResult.TrimEnd('/') : macDinh;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && !uri.IsLoopback))
        {
            // Chỉ HTTPS (token đi qua đường này) — loopback cho dev.
            ed.WriteMessage("\n[XBoss] Địa chỉ phải là https:// (hoặc localhost khi dev).\n");
            return;
        }
        LuuServerUrl(baseUrl);

        var client = new XBossApiClient(baseUrl);
        try
        {
            // 2) Xin mã ghép, hướng dẫn duyệt trên web.
            var pair = await client.StartPairingAsync($"{Environment.MachineName} ({Environment.UserName})");
            ed.WriteMessage(
                $"\n[XBoss] ===== GHÉP THIẾT BỊ =====" +
                $"\n[XBoss] 1. Mở {baseUrl}{pair.ConfirmPath} (đăng nhập XBoss)" +
                $"\n[XBoss] 2. Nhập mã: {pair.UserCode}" +
                $"\n[XBoss] 3. Bấm Duyệt — plugin tự nhận token trong vài giây." +
                $"\n[XBoss] Mã sống {pair.ExpiresInSeconds / 60} phút. Đang chờ duyệt...\n");

            // 3) Poll nhận token (5s/lần, tối đa thời gian sống của mã).
            var (status, ok, thongDiep) = await client.PollClaimAsync(
                pair.DeviceCode,
                TimeSpan.FromSeconds(5),
                TimeSpan.FromSeconds(pair.ExpiresInSeconds));
            if (status != XBossApiClient.ClaimStatus.Ok || ok is null)
            {
                ed.WriteMessage($"\n[XBoss] Ghép KHÔNG thành công: {thongDiep}\n");
                return;
            }

            // 4) Cất token vào Credential Manager — không ghi ra tệp phẳng (NFR4).
            CredentialStore.LuuToken(baseUrl, ok.Key);
            ed.WriteMessage(
                $"\n[XBoss] ✔ Đã ghép thiết bị \"{ok.DeviceName}\" — token hết hạn {ok.ExpiresAt[..Math.Min(10, ok.ExpiresAt.Length)]}." +
                "\n[XBoss] Thu hồi bất cứ lúc nào tại trang Thiết bị AutoCAD trên web.\n");

            // 5) Tải rule pack mới nhất bằng token (ETag — không đổi thì giữ cache).
            await TaiRulePack(ed, client, ok.Key);
        }
        catch (XBossApiException e)
        {
            ed.WriteMessage($"\n[XBoss] {e.Message}\n");
        }
        catch (HttpRequestException e)
        {
            ed.WriteMessage($"\n[XBoss] Không kết nối được server ({e.Message}) — kiểm tra mạng/địa chỉ.\n");
        }
    }

    private static async Task TaiRulePack(Editor ed, XBossApiClient client, string token)
    {
        string? etagCu = null;
        try
        {
            if (File.Exists(RulePackStore.EtagPath)) etagCu = File.ReadAllText(RulePackStore.EtagPath);
        }
        catch (IOException) { /* thiếu etag chỉ tốn 1 lần tải lại */ }

        var (json, etag) = await client.FetchRulePackAsync(token, etagCu);
        if (json is null)
        {
            ed.WriteMessage("\n[XBoss] Rule pack không đổi so với bản cache — dùng bản hiện có.\n");
            return;
        }
        try
        {
            var pack = RulePackStore.ImportJson(json);
            if (etag is not null) File.WriteAllText(RulePackStore.EtagPath, etag);
            ed.WriteMessage($"\n[XBoss] Đã tải rule pack {pack.Version} ({pack.Takeoff.Items.Count} quy tắc bóc tách).\n");
        }
        catch (RulePackException e)
        {
            ed.WriteMessage($"\n[XBoss] Rule pack server trả về KHÔNG hợp lệ — giữ bản cache cũ: {e.Message}\n");
        }
    }
}
