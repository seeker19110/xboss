using XBoss.Cad.Acad.Commands;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Schematic;

namespace XBoss.Cad.Acad.Services;

/// <summary>
/// Kho SƠ ĐỒ NGUYÊN LÝ đã chốt trên máy kỹ sư (M117 §7 NFR — cache cùng cơ chế thư viện block
/// M113): mỗi graph một tệp <c>%APPDATA%\XBoss\schematic-&lt;id&gt;.json</c> giữ nguyên văn JSON
/// máy chủ trả về.
///
/// <para>Luật rơi về cache cố ý HẸP: chỉ lỗi MẠNG (mất sóng ở công trường, chưa ghép thiết bị)
/// mới dùng bản cache; máy chủ trả lời được mà nói "chưa chốt"/"không có quyền" thì báo đúng lời
/// máy chủ và DỪNG — dùng cache lúc đó là đi vòng qua chốt người duyệt (guardrail M117 §2b).</para>
/// </summary>
internal static class SchematicStore
{
    /// <summary>Graph đã tải về từ đâu — để lệnh nói thật với kỹ sư đang dùng bản nào.</summary>
    internal enum NguonGraph
    {
        MayChu,
        Cache,
    }

    private static string ThuMuc => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "XBoss");

    internal static string DuongDan(long id) => Path.Combine(ThuMuc, $"schematic-{id}.json");

    /// <summary>
    /// Tải graph #<paramref name="id"/>: hỏi máy chủ trước, mất mạng thì lấy bản cache gần nhất.
    /// Trả (null, _, lý do tiếng Việt) khi không có đường nào ra được graph.
    /// </summary>
    internal static async Task<(BanGoiY? Ban, NguonGraph Nguon, string? Loi)> TaiAsync(long id)
    {
        var baseUrl = XBossLoginCommand.DocServerUrl();
        var token = baseUrl is null ? null : CredentialStore.DocToken(baseUrl);
        if (baseUrl is null || token is null)
        {
            return TuCache(
                id,
                "Máy chưa ghép thiết bị với server (chạy XBOSS_LOGIN) và cũng chưa có bản cache của sơ " +
                $"đồ #{id}.");
        }

        try
        {
            var client = new XBossApiClient(baseUrl);
            var json = await client.FetchSchematicPluginAsync(token, id, ExcelMetaStore.DuAnHienHanh);
            var ban = BanGoiY.TuJson(json); // JSON hỏng → không ghi đè cache đang dùng được
            GhiCache(id, json);
            return (ban, NguonGraph.MayChu, null);
        }
        catch (HttpRequestException e)
        {
            return TuCache(id, $"Không gọi được máy chủ ({e.Message}) và chưa có bản cache của sơ đồ #{id}.");
        }
        catch (TaskCanceledException)
        {
            return TuCache(id, $"Máy chủ không phản hồi kịp và chưa có bản cache của sơ đồ #{id}.");
        }
        catch (XBossCanChonDuAnException e)
        {
            return (null, NguonGraph.MayChu,
                $"{e.Message} Dự án: {string.Join(", ", e.DuAn.Select(d => $"#{d.Id} {d.Name}"))} — " +
                "chạy XBOSS_LOGIN cho đúng dự án rồi thử lại.");
        }
        catch (XBossApiException e)
        {
            // Máy chủ TRẢ LỜI ĐƯỢC nhưng từ chối (chưa chốt / hết quyền / token thu hồi): nói thẳng,
            // tuyệt đối không lấy bản cache cũ để đi tiếp.
            return (null, NguonGraph.MayChu, e.Message);
        }
    }

    private static (BanGoiY?, NguonGraph, string?) TuCache(long id, string loiKhiThieu)
    {
        var duongDan = DuongDan(id);
        if (!File.Exists(duongDan)) return (null, NguonGraph.Cache, loiKhiThieu);
        try
        {
            return (BanGoiY.TuJson(File.ReadAllText(duongDan)), NguonGraph.Cache, null);
        }
        catch (XBossApiException e)
        {
            return (null, NguonGraph.Cache, $"Bản cache của sơ đồ #{id} hỏng ({e.Message}) — cần có mạng để tải lại.");
        }
        catch (IOException e)
        {
            return (null, NguonGraph.Cache, $"Không đọc được cache sơ đồ #{id}: {e.Message}");
        }
    }

    private static void GhiCache(long id, string json)
    {
        try
        {
            Directory.CreateDirectory(ThuMuc);
            File.WriteAllText(DuongDan(id), json);
        }
        catch (IOException)
        {
            // Cache chỉ để dùng khi mất mạng — ghi hỏng thì lần sau tải lại, không làm chết lệnh.
        }
    }
}
