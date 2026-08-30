using System.Globalization;
using System.Net;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần thư viện block của <see cref="XBossApiClient"/> (M100 PR4 §FR2/AC8,
/// M113 §4/§6 hai tầng theo dự án) — GET /api/engineering/cad/block-lib.</summary>
public sealed partial class XBossApiClient
{
    /// <summary>
    /// GET /api/engineering/cad/block-lib?manifest=1 — manifest thư viện block đang phát hành.
    /// Trả (json manifest, etag), hoặc (null, etag) khi 304 — caller giữ bản cache.
    /// Server bọc manifest trong <c>{version, dwgSha256, manifest}</c>; ở đây bóc đúng phần
    /// <c>manifest</c> để đưa thẳng cho <c>BlockManifestLoader</c> (một hình dạng dữ liệu duy nhất).
    /// <paramref name="versionCache"/>: version thư viện đang nằm trong cache của máy — xem
    /// <see cref="GuiBlockLibAsync"/>. Bỏ trống = không gửi <c>?v=</c>, y hệt hành vi cũ.
    /// </summary>
    public async Task<(string? Json, string? Etag)> FetchBlockLibManifestAsync(
        string token, string? etag = null, string? versionCache = null, CancellationToken ct = default)
    {
        using var res = await GuiBlockLibAsync(
            "api/engineering/cad/block-lib?manifest=1", token, etag, versionCache, ct);
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
    /// <paramref name="versionCache"/>: truyền version của manifest vừa nhận để GHÉP ĐÚNG CẶP
    /// manifest↔tệp — máy chủ phát hành version mới xen giữa hai lời gọi thì server báo lệch
    /// (xem <see cref="GuiBlockLibAsync"/>) thay vì trả tệp .dwg của version khác, vốn chỉ lộ ra
    /// sau đó dưới dạng "hash lệch, giữ cache cũ".
    /// </summary>
    public async Task<(byte[]? Dwg, string? Etag)> FetchBlockLibDwgAsync(
        string token, string? etag = null, string? versionCache = null, CancellationToken ct = default)
    {
        using var res = await GuiBlockLibAsync("api/engineering/cad/block-lib", token, etag, versionCache, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        await NemNeuLoi(res, ct);
        return (await res.Content.ReadAsByteArrayAsync(ct), res.Headers.ETag?.ToString());
    }

    /// <summary>
    /// GET /api/engineering/cad/block-lib?file=&lt;fileKey&gt; — tệp .dwg LẺ của một block thêm
    /// thẳng từ web (thư viện đa tệp, M104 §1/§2). Cùng token thiết bị + ETag như tệp nền;
    /// trả (null, etag) khi 304. Toàn vẹn tệp do caller đối chiếu <c>fileSha256</c> của entry
    /// manifest — client KHÔNG tự tin vào server (M100 §12).
    /// 404 = khoá không thuộc manifest version nào → ném kèm nguyên văn thông điệp server.
    ///
    /// CỐ Ý không kèm <c>?v=</c> như hai lời gọi trên: nhánh <c>?file=</c> của route trả kết quả
    /// TRƯỚC chỗ kiểm <c>v</c>, nên tham số đó bị bỏ qua hoàn toàn; toàn vẹn của tệp lẻ đã do
    /// <c>fileSha256</c> của entry manifest canh, không cần chốt version.
    /// </summary>
    /// <param name="libVersion">
    /// M113 §6 — version của BỘ chứa block (lấy từ <c>libVersion</c> của entry trong manifest đã
    /// trộn). Bỏ trống = để máy chủ tìm trong bộ hiện hành của tầng đang hỏi, y hệt trước M113.
    /// </param>
    /// <param name="duAnId">
    /// M113 §6 — gửi <c>?project=</c> khi tệp lẻ thuộc bộ RIÊNG của dự án. Máy chủ tìm tệp lẻ
    /// trong ĐÚNG MỘT tầng, nên block nguồn "toàn cục" phải hỏi KHÔNG kèm dự án (bỏ trống) còn
    /// block nguồn "dự án" thì bắt buộc kèm — gửi sai tầng là 404 "không có tệp block nào".
    /// </param>
    public async Task<(byte[]? Dwg, string? Etag)> FetchBlockLibTepLeAsync(
        string token, string fileKey, string? etag = null, string? libVersion = null,
        long? duAnId = null, CancellationToken ct = default)
    {
        var duongDan = "api/engineering/cad/block-lib?file=" + Uri.EscapeDataString(fileKey);
        if (!string.IsNullOrWhiteSpace(libVersion))
            duongDan += "&libVersion=" + Uri.EscapeDataString(libVersion);
        if (duAnId is { } id)
            duongDan += "&project=" + id.ToString(CultureInfo.InvariantCulture);
        using var res = await GuiKemToken(duongDan, token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        await NemNeuLoi(res, ct);
        return (await res.Content.ReadAsByteArrayAsync(ct), res.Headers.ETag?.ToString());
    }

    // ===== Thư viện block HAI TẦNG theo dự án (M113 §4/§6 — FR5) =====

    /// <summary>
    /// GET /api/engineering/cad/block-lib?project=&lt;id&gt;&amp;manifest=1 — manifest ĐÃ TRỘN hai
    /// tầng (bộ toàn cục + bộ riêng của dự án, dự án đè theo <c>blocks[].id</c>), kèm tóm tắt bộ
    /// của dự án (<c>boDuAn</c>: version + sha256 tệp .dwg riêng) để client kiểm hash TỪNG BỘ.
    /// Trả (null, etag, null) khi 304 — caller giữ cache trộn đang có.
    ///
    /// CỐ Ý tách khỏi <see cref="FetchBlockLibManifestAsync"/> thay vì thêm tham số: đường không
    /// kèm <c>?project=</c> phải giữ nguyên từng byte cho luồng đề xuất block M103 (máy chủ so
    /// <c>base_lib_version</c> với bộ TOÀN CỤC) và cho plugin bản cũ (M113 guardrail 1).
    /// KHÔNG gắn <c>?v=</c>: nhánh hai tầng của route không kiểm tham số đó, toàn vẹn tệp đã do
    /// sha256 của từng bộ canh.
    /// </summary>
    public async Task<(string? Json, string? Etag, BoBlockDuAn? BoDuAn)> FetchBlockLibManifestTronAsync(
        string token, long duAnId, string? etag = null, CancellationToken ct = default)
    {
        using var res = await GuiKemToken(DuongDanTheoDuAn("&manifest=1", duAnId), token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag, null);
        await NemNeuLoi(res, ct);

        var body = await res.Content.ReadAsStringAsync(ct);
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("manifest", out var manifest))
                throw new XBossApiException("Server trả response thiếu \"manifest\" của thư viện block.");
            BoBlockDuAn? bo = null;
            if (doc.RootElement.TryGetProperty("boDuAn", out var boJson) &&
                boJson.ValueKind == System.Text.Json.JsonValueKind.Object)
            {
                bo = System.Text.Json.JsonSerializer.Deserialize<BoBlockDuAn>(boJson.GetRawText());
            }
            return (manifest.GetRawText(), res.Headers.ETag?.ToString(), bo);
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new XBossApiException($"Manifest thư viện block server trả về không phải JSON hợp lệ: {e.Message}");
        }
    }

    /// <summary>
    /// GET /api/engineering/cad/block-lib?project=&lt;id&gt; — tệp .dwg nền của bộ RIÊNG của dự án
    /// (nhị phân). Toàn vẹn do caller đối chiếu <c>boDuAn.dwgSha256</c>, KHÔNG tin server (M100 §12).
    /// 404 = dự án chưa phát hành bộ riêng ⇒ ném kèm nguyên văn thông điệp server.
    /// </summary>
    public async Task<(byte[]? Dwg, string? Etag)> FetchBlockLibDwgDuAnAsync(
        string token, long duAnId, string? etag = null, CancellationToken ct = default)
    {
        using var res = await GuiKemToken(DuongDanTheoDuAn("", duAnId), token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        await NemNeuLoi(res, ct);
        return (await res.Content.ReadAsByteArrayAsync(ct), res.Headers.ETag?.ToString());
    }

    private static string DuongDanTheoDuAn(string themQuery, long duAnId) =>
        "api/engineering/cad/block-lib?project=" +
        duAnId.ToString(CultureInfo.InvariantCulture) + themQuery;

    /// <summary>
    /// GET thư viện block kèm tham số cache-busting <c>?v=&lt;version&gt;</c> khi máy ĐÃ có cache.
    ///
    /// Ngữ nghĩa lấy từ chính route (<c>app/api/engineering/cad/block-lib/route.ts</c>): <c>v</c>
    /// KHÔNG phải để chọn bản tải về — thư viện chỉ giữ bản đang phát hành. Gửi <c>v</c> khác bản
    /// hiện hành thì server trả <b>404</b> kèm thông điệp "phiên bản không còn là bản hiện hành"
    /// thay vì âm thầm trả bản khác với thứ client tưởng đang xin.
    ///
    /// Với plugin, 404 đó nghĩa là "cache trên máy đã cũ" — KHÁC hẳn 404 "chưa phát hành thư viện
    /// nào". Không phân biệt hai thứ bằng cách đọc chữ trong thông điệp (dễ vỡ): cứ hỏi lại đúng
    /// MỘT lần, bỏ <c>v</c> và GIỮ NGUYÊN ETag — cache cũ thì lần hai trả 200 bản mới (ETag của
    /// server có version bên trong nên chắc chắn không khớp nữa), còn thư viện chưa phát hành thì
    /// lần hai vẫn 404 và caller nhận đúng thông điệp hướng dẫn của server.
    ///
    /// Chưa có cache (<paramref name="versionCache"/> rỗng) ⇒ không gửi <c>v</c>: đúng một request,
    /// hành vi y hệt trước, luồng offline không đổi.
    /// </summary>
    private async Task<HttpResponseMessage> GuiBlockLibAsync(
        string duongDan, string token, string? etag, string? versionCache, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(versionCache)) return await GuiKemToken(duongDan, token, etag, ct);

        var noi = duongDan.Contains('?') ? "&" : "?";
        var res = await GuiKemToken(duongDan + noi + "v=" + Uri.EscapeDataString(versionCache), token, etag, ct);
        if (res.StatusCode != HttpStatusCode.NotFound) return res;
        res.Dispose();
        return await GuiKemToken(duongDan, token, etag, ct);
    }
}
