using System.Text.Json;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Runtime;
using XBoss.Cad.Acad.Services;
using XBoss.Cad.Acad.Ui.Wpf;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Ui.ViewModels;
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

    internal static string? DocServerUrl()
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

        // 1) Địa chỉ server (nhớ giữa các lần) — hộp thoại trước, rơi về dòng lệnh khi UI hỏng (FR9).
        if (HoiServerUrl(ed) is not { } baseUrl) return;
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

            // 6) Tải thư viện block của bộ lệnh vẽ (M100 AC8) — lỗi ở đây KHÔNG làm hỏng việc ghép
            //    thiết bị: chỉ báo, các lệnh M99 vẫn chạy bình thường khi chưa có thư viện.
            //    M113 FR5: tải cả bản TRỘN của dự án vừa chọn ở bước (5) — bộ toàn cục vẫn được
            //    giữ nguyên trong ô cache cũ vì đường đề xuất block M103 dựng ứng viên trên đó.
            foreach (var dong in await BlockLibraryService.TaiVeDayDuAsync(client, ok.Key))
                ed.WriteMessage($"\n[XBoss] {dong}\n");
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

    // ===== Thu tham số: hộp thoại (mặc định) hoặc dòng lệnh (M106 FR9) =====

    /// <summary>
    /// Địa chỉ server cho lần ghép này. Thử hộp thoại một ô trước (M106 §7.2); UI không dựng được
    /// hoặc bị tắt bằng <c>XBOSS_UI_DIALOG=0</c> thì rơi về ĐÚNG câu hỏi dòng lệnh cũ (FR9). Hủy ở
    /// hộp thoại = dừng lệnh, không hỏi lại.
    /// </summary>
    private static string? HoiServerUrl(Editor ed)
    {
        var (daDungUi, kq) = HopThoaiXBoss.Thu(ed, () =>
        {
            var vm = new LoginDialogViewModel(DocServerUrl());
            return XBossDialog.Hoi(vm) ? vm.KetQua() : null;
        });
        if (daDungUi) return kq?.BaseUrl;
        return HoiServerUrlDongLenh(ed);
    }

    /// <summary>Câu hỏi dòng lệnh của bản trước M106 — giữ nguyên cho script/batch và FR9.</summary>
    private static string? HoiServerUrlDongLenh(Editor ed)
    {
        var macDinh = DocServerUrl() ?? "";
        var hoiUrl = new PromptStringOptions(
            $"\n[XBoss] Địa chỉ server XBoss{(macDinh.Length > 0 ? $" <{macDinh}>" : " (vd https://xboss.congty.vn)")}: ")
        {
            AllowSpaces = false,
        };
        var kqUrl = ed.GetString(hoiUrl);
        if (kqUrl.Status != PromptStatus.OK) return null;
        var baseUrl = kqUrl.StringResult.Length > 0 ? kqUrl.StringResult.TrimEnd('/') : macDinh;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "https" && !uri.IsLoopback))
        {
            // Chỉ HTTPS (token đi qua đường này) — loopback cho dev.
            ed.WriteMessage("\n[XBoss] Địa chỉ phải là https:// (hoặc localhost khi dev).\n");
            return null;
        }
        return baseUrl;
    }

    /// <summary>
    /// Tải rule pack THEO DỰ ÁN (M101 PR4): bản của dự án mang sẵn mã BOQ trong
    /// <c>takeoff.items[].boqCode</c> nên cột mã của bảng bóc khối lượng tự điền thay vì
    /// "(chưa gán mã)". Đã nhớ dự án thì hỏi thẳng dự án đó; chưa nhớ thì để máy chủ tự suy
    /// (tài khoản 1 dự án khỏi bị hỏi câu nào), thuộc nhiều dự án thì máy chủ trả 409 → hỏi kỹ sư.
    ///
    /// ĐƯỜNG LUI luôn là bản toàn cục: không chọn được dự án / không có quyền / máy chủ cũ đều chỉ
    /// CẢNH BÁO rồi tải bản toàn cục — việc ghép thiết bị không bao giờ bị chặn vì chuyện mã BOQ.
    /// </summary>
    private static async Task TaiRulePack(Editor ed, XBossApiClient client, string token)
    {
        var pham = RulePackCache.PhamViDeHoi(ExcelMetaStore.DuAnHienHanh);
        try
        {
            await TaiTheoPhamVi(ed, client, token, pham);
        }
        catch (XBossCanChonDuAnException e)
        {
            var chon = ChonDuAn.Hoi(ed, e.Message, e.DuAn);
            if (chon is { } id)
            {
                await TaiTheoPhamVi(ed, client, token, PhamViDuAn.Cua(id));
            }
            else
            {
                ed.WriteMessage(
                    "\n[XBoss] ⚠ Chưa chọn dự án — tải rule pack bản toàn cục (cột mã BOQ để trống). " +
                    "Chạy lại XBOSS_LOGIN khi muốn gán mã theo dự án.\n");
                await TaiTheoPhamVi(ed, client, token, PhamViDuAn.ToanCuc);
            }
        }
        catch (XBossApiException e) when (pham.TheoDuAn)
        {
            // Dự án nhớ trong máy không còn dùng được (bị gỡ khỏi dự án, đổi máy chủ...) — lui về
            // bản toàn cục.
            ed.WriteMessage($"\n[XBoss] ⚠ Không lấy được rule pack theo dự án ({e.Message}) — dùng bản toàn cục.\n");
            await TaiTheoPhamVi(ed, client, token, PhamViDuAn.ToanCuc);
            // Quên dự án SAU KHI đã có bản lui trong tay: để nguyên thì cache của dự án cũ vẫn
            // được các lệnh dùng (in mã BOQ của dự án kỹ sư không còn làm). Lỗi chung như token
            // hết hạn thì dòng trên đã ném tiếp — không xoá nhầm lựa chọn còn đúng.
            if (pham.Id is not null) ExcelMetaStore.GhiDuAn(null);
        }
    }

    private static async Task TaiTheoPhamVi(
        Editor ed, XBossApiClient client, string token, PhamViDuAn pham)
    {
        // ETag CHỈ gửi khi đã biết chắc phạm vi, và lấy từ tệp .etag RIÊNG của phạm vi đó: gửi
        // ETag của dự án khác là tự xin một cú 304 rồi dùng cache của dự án khác — sai mã BOQ mà
        // không có dấu hiệu nào trên màn hình.
        var etagCu = RulePackStore.DocEtag(pham);
        var (json, etag) = await client.FetchRulePackAsync(token, etagCu, pham);
        if (json is null)
        {
            ed.WriteMessage($"\n[XBoss] Rule pack ({pham}) không đổi so với bản cache — dùng bản hiện có.\n");
            return;
        }
        try
        {
            // Cất vào ô cache theo DẤU projectId máy chủ đóng trong pack (máy chủ cũ bỏ qua
            // ?project= và trả bản toàn cục — lúc đó vẫn cất đúng vào ô toàn cục).
            var pack = RulePackStore.ImportJson(json);
            if (etag is not null) RulePackStore.GhiEtag(pack, etag);
            // ImportJson đã nhớ luôn dự án của pack (nếu có dấu): máy chủ tự suy ra dự án nào thì
            // lần sau plugin hỏi thẳng theo id đó và dùng lại được ETag (phạm vi "tự suy" không có
            // ô cache riêng nên không gửi ETag được).
            var moTa = pack.ProjectId is { } idDuAn
                ? $"dự án #{idDuAn} — cột mã BOQ tự điền"
                : "bản toàn cục — cột mã BOQ để trống";
            ed.WriteMessage(
                $"\n[XBoss] Đã tải rule pack {pack.Version} ({pack.Takeoff.Items.Count} quy tắc bóc tách, {moTa}).\n");
        }
        catch (RulePackException e)
        {
            ed.WriteMessage($"\n[XBoss] Rule pack server trả về KHÔNG hợp lệ — giữ bản cache cũ: {e.Message}\n");
        }
    }
}
