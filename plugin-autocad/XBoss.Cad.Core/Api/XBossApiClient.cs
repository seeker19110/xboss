using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;

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

    /// <summary>
    /// GET /api/engineering/cad/rule-pack[?project=] với Bearer token + ETag. Trả (json, etag)
    /// hoặc (null, etag) khi 304 — caller giữ bản cache.
    ///
    /// <paramref name="pham"/> (M101 PR4): hỏi bản rule pack đã gán mã BOQ theo dự án
    /// (<c>takeoff.items[].boqCode</c>) hay bản toàn cục — mặc định <see cref="PhamViDuAn.ToanCuc"/>
    /// nên mọi lời gọi cũ giữ nguyên hành vi trước PR4. Tài khoản thuộc nhiều dự án mà chưa chỉ
    /// định thì máy chủ trả 409 kèm danh sách → ném <see cref="XBossCanChonDuAnException"/> để lệnh
    /// hỏi kỹ sư chọn (CÙNG cơ chế với <see cref="FetchBoqSnapshotAsync"/>, không có cơ chế thứ hai).
    /// Tham số đặt SAU <paramref name="etag"/> là có chủ đích: giữ nguyên thứ tự đối số của mọi
    /// call site/test đã có.
    /// </summary>
    public async Task<(string? Json, string? Etag)> FetchRulePackAsync(
        string token, string? etag = null, PhamViDuAn pham = default, CancellationToken ct = default)
    {
        using var res = await GuiKemToken(
            "api/engineering/cad/rule-pack" + pham.ChuoiTruyVan, token, etag, ct);
        if (res.StatusCode == HttpStatusCode.NotModified) return (null, etag);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new XBossCanChonDuAnException(
                DocLoiTuChuoi(body) ?? "Cần chỉ định dự án.", DocDanhSachDuAn(body));
        }
        await NemNeuLoi(res, ct);
        var json = await res.Content.ReadAsStringAsync(ct);
        return (json, res.Headers.ETag?.ToString());
    }

    // ===== Thư viện block (M100 PR4 — FR2/AC8) =====

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

    // ===== Đề xuất block vào thư viện (M103 §3/§4) =====

    /// <summary>Vì sao server trả 409 cho một đề xuất block.</summary>
    public enum LoaiXungDotDeXuat
    {
        KhongCo,
        /// <summary>Trùng tên với thư viện hiện hành hoặc một đề xuất đang chờ duyệt.</summary>
        TrungTen,
        /// <summary>Thư viện đã sang version khác trong lúc dựng ứng viên.</summary>
        Stale,
        /// <summary>Server chưa phát hành thư viện block gốc nào.</summary>
        ChuaCoThuVien,
        /// <summary>409 với "loai" lạ (server mới hơn plugin) — hiện nguyên văn thông điệp server.</summary>
        Khac,
    }

    /// <summary>
    /// Kết quả gửi đề xuất. KHÔNG ném với 422/409 (giống <see cref="UploadAsync"/>): lệnh cần in
    /// đủ lý do + hành động tiếp theo cho kỹ sư ngay trong AutoCAD, không phải một dòng exception.
    /// </summary>
    public sealed record DeXuatKetQua
    {
        public long Id { get; init; }
        /// <summary>Server nhận ra đúng gói này đã gửi trước đó — không tạo đề xuất đôi.</summary>
        public bool Idempotent { get; init; }
        /// <summary>Server dựng được preview SVG từ sidecar DXF (best-effort).</summary>
        public bool CoPreview { get; init; }
        /// <summary>Lỗi kiểm định của server (422).</summary>
        public IReadOnlyList<string> LoiKiemDinh { get; init; } = [];
        public LoaiXungDotDeXuat XungDot { get; init; } = LoaiXungDotDeXuat.KhongCo;
        /// <summary>Version thư viện hiện hành server báo kèm khi 409 stale.</summary>
        public string? VersionHienHanh { get; init; }
        /// <summary>Thông điệp tiếng Việt chỉ rõ việc phải làm tiếp (chỉ có khi bị từ chối).</summary>
        public string? ThongDiep { get; init; }

        public bool DuocNhan => LoiKiemDinh.Count == 0 && XungDot == LoaiXungDotDeXuat.KhongCo;
    }

    /// <summary>Một đề xuất trong danh sách trả về của GET (đủ cho dòng trạng thái bảng M102).</summary>
    public sealed record DeXuatTomTat
    {
        [JsonPropertyName("blockName")] public string BlockName { get; init; } = "";
        /// <summary>pending | approved | rejected | stale.</summary>
        [JsonPropertyName("status")] public string Status { get; init; } = "";
        /// <summary>Nhãn tiếng Việt do server sinh (nguồn sự thật của chữ hiển thị).</summary>
        [JsonPropertyName("statusNhan")] public string StatusNhan { get; init; } = "";
        [JsonPropertyName("rejectReason")] public string? RejectReason { get; init; }
        [JsonPropertyName("publishedVersion")] public string? PublishedVersion { get; init; }
    }

    /// <summary>Danh sách đề xuất + người xem có phải người duyệt (Admin/PM) không.</summary>
    public sealed record DanhSachDeXuat
    {
        [JsonPropertyName("deXuat")] public IReadOnlyList<DeXuatTomTat> DeXuat { get; init; } = [];
        [JsonPropertyName("laNguoiDuyet")] public bool LaNguoiDuyet { get; init; }

        /// <summary>
        /// M104 §3 — vai trò này được thêm block THẲNG vào thư viện TRÊN WEB (bỏ qua hàng chờ),
        /// do server tự chấm theo quyền của token/phiên. Plugin chỉ dùng để nói đúng việc tiếp
        /// theo cho kỹ sư, KHÔNG mở đường ghi thẳng từ AutoCAD: route thêm trực tiếp
        /// (<c>POST /api/engineering/cad/block-lib/blocks</c>) chỉ nhận phiên trình duyệt, không
        /// nhận token thiết bị. Server cũ chưa trả cờ ⇒ mặc định false, thông điệp giữ như trước.
        /// </summary>
        [JsonPropertyName("duocThemTrucTiep")] public bool DuocThemTrucTiep { get; init; }
    }

    /// <summary>Kết quả nạp một LÔ block (M108 §10).</summary>
    public sealed record LoBlockKetQua
    {
        public long LoId { get; init; }

        /// <summary>Số block thật sự vào hàng chờ.</summary>
        public int SoNhan { get; init; }

        /// <summary>Block bị bỏ qua, mỗi dòng đã gồm tên + lý do — hiện nguyên văn cho kỹ sư.</summary>
        public IReadOnlyList<string> BoQua { get; init; } = [];

        /// <summary>Vì sao gợi ý AI không chạy (null = có chạy). Chỉ để nói cho kỹ sư biết.</summary>
        public string? LyDoAiKhongChay { get; init; }

        /// <summary>Lỗi kiểm định của server — có phần tử nghĩa là lô KHÔNG được tạo.</summary>
        public IReadOnlyList<string> LoiKiemDinh { get; init; } = [];

        public string? ThongDiep { get; init; }

        public bool DuocNhan => LoiKiemDinh.Count == 0 && LoId > 0;
    }

    private sealed record LoBlockBoQua(
        [property: JsonPropertyName("blockName")] string BlockName,
        [property: JsonPropertyName("lyDo")] string LyDo);

    private sealed record LoBlockTraVe(
        [property: JsonPropertyName("loId")] long LoId,
        [property: JsonPropertyName("tong")] int Tong,
        [property: JsonPropertyName("boQua")] IReadOnlyList<LoBlockBoQua>? BoQua,
        [property: JsonPropertyName("lyDoAiKhongChay")] string? LyDoAiKhongChay);

    private sealed record DeXuatTraVe(
        [property: JsonPropertyName("id")] long Id,
        [property: JsonPropertyName("idempotent")] bool Idempotent,
        [property: JsonPropertyName("coPreview")] bool CoPreview);

    /// <summary>
    /// POST /api/engineering/cad/block-proposals — gói "thư viện ứng viên" (M103 §1):
    /// multipart <c>candidateDwg</c> + <c>sidecarDxf</c> + <c>meta</c> (JSON).
    /// 201 = đã xếp hàng chờ duyệt; 422 = metadata/manifest/sidecar không đạt; 409 = trùng tên,
    /// stale hoặc chưa có thư viện gốc — cả ba đều trả về trong kết quả kèm thông điệp tiếng Việt.
    /// </summary>
    public async Task<DeXuatKetQua> GuiDeXuatBlockAsync(
        string token, DeXuatBlockGoi goi, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        ThemPhan(form, new ByteArrayContent(goi.CandidateDwg), "candidateDwg", goi.TenTepDwg);
        ThemPhan(form, new ByteArrayContent(goi.SidecarDxf), "sidecarDxf", Path.ChangeExtension(goi.TenTepDwg, ".dxf"));
        ThemPhan(form, new StringContent(goi.MetaJson(), System.Text.Encoding.UTF8, "application/json"), "meta");

        using var req = new HttpRequestMessage(HttpMethod.Post, "api/engineering/cad/block-proposals")
        {
            Content = form,
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req, ct);

        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN (AC7).");
        if (res.StatusCode == HttpStatusCode.Forbidden)
        {
            throw new XBossApiException(
                "Tài khoản của bạn không có quyền đề xuất block (cần vai trò kỹ sư trở lên) — " +
                "nhờ Admin/PM cấp quyền rồi thử lại.");
        }

        var body = await res.Content.ReadAsStringAsync(ct);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var (loai, version) = DocXungDot(body);
            return new DeXuatKetQua
            {
                XungDot = loai,
                VersionHienHanh = version,
                ThongDiep = ThongDiepXungDot(loai, DocLoiTuChuoi(body), version),
            };
        }
        if (res.StatusCode == HttpStatusCode.UnprocessableEntity)
        {
            return new DeXuatKetQua
            {
                LoiKiemDinh = DocDanhSachLoi(body),
                ThongDiep = "Server từ chối đề xuất (không tạo dòng nào) — sửa theo lỗi bên dưới rồi chạy lại lệnh.",
            };
        }
        if (!res.IsSuccessStatusCode)
            throw new XBossApiException(DocLoiTuChuoi(body) ?? $"Server trả lỗi {(int)res.StatusCode}.");

        DeXuatTraVe? ok;
        try
        {
            ok = System.Text.Json.JsonSerializer.Deserialize<DeXuatTraVe>(body);
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new XBossApiException($"Server trả response lạ khi nhận đề xuất: {e.Message}");
        }
        if (ok is null || ok.Id <= 0) throw new XBossApiException("Server trả response thiếu id đề xuất.");
        return new DeXuatKetQua { Id = ok.Id, Idempotent = ok.Idempotent, CoPreview = ok.CoPreview };
    }

    /// <summary>
    /// GET /api/engineering/cad/block-proposals — đề xuất của tôi (Admin/PM: tất cả) cho dòng
    /// trạng thái trên bảng điều khiển <c>XBOSS_BANG</c>.
    /// </summary>
    public async Task<DanhSachDeXuat> LayDeXuatBlockAsync(string token, CancellationToken ct = default)
    {
        using var res = await GuiKemToken("api/engineering/cad/block-proposals", token, null, ct);
        await NemNeuLoi(res, ct);
        return await res.Content.ReadFromJsonAsync<DanhSachDeXuat>(ct)
            ?? throw new XBossApiException("Server trả response rỗng khi hỏi danh sách đề xuất block.");
    }

    /// <summary>
    /// Thêm một phần multipart với <c>Content-Disposition</c> ĐÚNG CHUẨN WHATWG: <c>name</c> và
    /// <c>filename</c> phải nằm trong nháy kép và KHÔNG được kèm <c>filename*</c> (RFC 5987).
    ///
    /// Mặc định .NET ghi <c>name=candidateDwg</c> (không nháy kép) kèm <c>filename*=utf-8''…</c>;
    /// bộ đọc multipart của Next.js (<c>req.formData()</c> — undici) TỪ CHỐI nguyên body vì cả hai
    /// điểm đó, route trả 400 "Body multipart không hợp lệ". Đã kiểm thật bằng Node 22 với đúng
    /// bytes .NET sinh ra (M103 §4) — nên phần này phải tự đặt header, không dùng
    /// <c>form.Add(content, name, fileName)</c>.
    /// </summary>
    /// <summary>
    /// Gửi một LÔ block lên hàng chờ duyệt (M108 §10 — <c>POST block-proposals/batch</c>).
    ///
    /// Khác <see cref="GuiDeXuatBlockAsync"/> (M103, một block kèm metadata do kỹ sư khai): lô
    /// KHÔNG mang metadata nào — máy chủ đọc mọi định nghĩa block trong DXF, tự đề xuất phân loại,
    /// rồi Admin/PM duyệt theo lô trên web. Vì thế ở đây chỉ có hai tệp và không có manifest.
    /// </summary>
    public async Task<LoBlockKetQua> GuiLoBlockAsync(
        string token, byte[] dwg, byte[] dxf, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
        // Cùng lỗi hợp đồng đã ghi ở GuiDeXuatBlockAsync: `req.formData()` (undici) đòi name/filename
        // trong nháy kép — phải qua ThemPhan, không dùng form.Add mặc định.
        ThemPhan(form, new ByteArrayContent(dwg), "dwg", "lo-block.dwg");
        ThemPhan(form, new ByteArrayContent(dxf), "dxf", "lo-block.dxf");

        using var req = new HttpRequestMessage(
            HttpMethod.Post, "api/engineering/cad/block-proposals/batch")
        {
            Content = form,
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var res = await _http.SendAsync(req, ct);

        if (res.StatusCode == HttpStatusCode.Unauthorized)
            throw new XBossApiException("Token đã bị thu hồi hoặc hết hạn — chạy lại XBOSS_LOGIN.");
        if (res.StatusCode == HttpStatusCode.Forbidden)
        {
            throw new XBossApiException(
                "Tài khoản của bạn không có quyền nạp block (cần vai trò kỹ sư trở lên) — " +
                "nhờ Admin/PM cấp quyền rồi thử lại.");
        }

        var body = await res.Content.ReadAsStringAsync(ct);
        if (res.StatusCode == HttpStatusCode.UnprocessableEntity ||
            res.StatusCode == HttpStatusCode.Conflict)
        {
            return new LoBlockKetQua
            {
                LoiKiemDinh = DocDanhSachLoi(body) is { Count: > 0 } ds
                    ? ds
                    : [DocLoiTuChuoi(body) ?? "Server từ chối lô (không nêu lý do)."],
                ThongDiep = "Server từ chối lô (không tạo dòng nào) — xử lý theo lý do bên dưới rồi chạy lại.",
            };
        }
        if (!res.IsSuccessStatusCode)
            throw new XBossApiException(DocLoiTuChuoi(body) ?? $"Server trả lỗi {(int)res.StatusCode}.");

        LoBlockTraVe? ok;
        try
        {
            ok = System.Text.Json.JsonSerializer.Deserialize<LoBlockTraVe>(body);
        }
        catch (System.Text.Json.JsonException e)
        {
            throw new XBossApiException($"Server trả response lạ khi nhận lô: {e.Message}");
        }
        if (ok is null || ok.LoId <= 0) throw new XBossApiException("Server trả response thiếu id lô.");
        return new LoBlockKetQua
        {
            LoId = ok.LoId,
            SoNhan = ok.Tong,
            BoQua = [.. (ok.BoQua ?? []).Select(b => $"{b.BlockName}: {b.LyDo}")],
            LyDoAiKhongChay = ok.LyDoAiKhongChay,
        };
    }

    private static void ThemPhan(
        MultipartFormDataContent form, HttpContent noiDung, string ten, string? tenTep = null)
    {
        var cd = new ContentDispositionHeaderValue("form-data") { Name = $"\"{ten}\"" };
        if (tenTep is not null) cd.FileName = $"\"{tenTep}\"";
        noiDung.Headers.ContentDisposition = cd;
        form.Add(noiDung);
    }

    /// <summary>
    /// Thông điệp tiếng Việt cho từng loại 409 — PHẢI nói rõ việc tiếp theo, vì kỹ sư đứng ở
    /// AutoCAD không đọc được log server (M103 §4). Thuần, test được.
    /// </summary>
    public static string ThongDiepXungDot(LoaiXungDotDeXuat loai, string? loiServer, string? versionHienHanh) =>
        loai switch
        {
            LoaiXungDotDeXuat.TrungTen =>
                (loiServer ?? "Tên block đã có trong thư viện hiện hành hoặc trong một đề xuất đang chờ duyệt.") +
                " ĐỔI TÊN block trong bản vẽ (hoặc nhập tên khác trong hộp thoại) rồi chạy lại XBOSS_VE_DEXUAT — " +
                "server chưa tạo đề xuất nào.",
            LoaiXungDotDeXuat.Stale =>
                $"Thư viện block trên server đã sang version {versionHienHanh ?? "mới"} trong lúc bạn dựng đề xuất. " +
                "CHẠY LẠI XBOSS_VE_DEXUAT: lệnh sẽ tự tải thư viện mới rồi dựng lại ứng viên trên nền đó.",
            LoaiXungDotDeXuat.ChuaCoThuVien =>
                "Server chưa phát hành thư viện block nào để thêm vào. Phát hành thư viện gốc trên web " +
                "(/engineering/chuan-hoa-ban-ve) trước, rồi chạy lại XBOSS_VE_DEXUAT.",
            _ => loiServer ?? "Server từ chối đề xuất (409) — kiểm tra lại trên web rồi thử lại.",
        };

    private static (LoaiXungDotDeXuat Loai, string? VersionHienHanh) DocXungDot(string body)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            var goc = doc.RootElement;
            var loai = goc.TryGetProperty("loai", out var l) ? l.GetString() : null;
            var version = goc.TryGetProperty("versionHienHanh", out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String
                ? v.GetString()
                : null;
            return (loai switch
            {
                "trung-ten" => LoaiXungDotDeXuat.TrungTen,
                "stale" => LoaiXungDotDeXuat.Stale,
                "chua-co-thu-vien" => LoaiXungDotDeXuat.ChuaCoThuVien,
                _ => LoaiXungDotDeXuat.Khac,
            }, version);
        }
        catch (System.Text.Json.JsonException)
        {
            return (LoaiXungDotDeXuat.Khac, null);
        }
    }

    private static IReadOnlyList<string> DocDanhSachLoi(string body)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(body);
            if (doc.RootElement.TryGetProperty("errors", out var ds) &&
                ds.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                var loi = ds.EnumerateArray()
                    .Select(e => e.ValueKind == System.Text.Json.JsonValueKind.String ? e.GetString() : e.GetRawText())
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Select(s => s!)
                    .ToList();
                if (loi.Count > 0) return loi;
            }
            return [DocLoiTuChuoi(body) ?? "Server từ chối kiểm định đề xuất."];
        }
        catch (System.Text.Json.JsonException)
        {
            return ["Server từ chối kiểm định đề xuất (response không đọc được)."];
        }
    }

    // ===== Đối chiếu BOQ (M101 PR4 — §6.3, chỉ ĐỌC) =====

    /// <summary>
    /// GET /api/engineering/cad/boq-snapshot[?project=] — KL BOQ hợp đồng theo hạng mục bóc tách,
    /// để dựng sheet phụ <c>Doi-chieu</c>. KHÔNG có đường ghi ngược: số liệu bóc chỉ về máy chủ
    /// qua XBOSS_UPLOAD có kiểm định (M101 §6.4).
    ///
    /// <paramref name="projectId"/> null = để máy chủ tự suy (người dùng chỉ thuộc 1 dự án); thuộc
    /// nhiều dự án thì máy chủ trả 409 kèm danh sách → ném <see cref="XBossCanChonDuAnException"/>
    /// để lệnh hỏi kỹ sư chọn, KHÔNG tự đoán một dự án (đoán = đưa nhầm KL hợp đồng của dự án khác).
    /// </summary>
    public async Task<BoqSnapshot> FetchBoqSnapshotAsync(
        string token, long? projectId = null, CancellationToken ct = default)
    {
        var duongDan = "api/engineering/cad/boq-snapshot"
                       + (projectId is null ? "" : $"?project={projectId.Value}");
        using var res = await GuiKemToken(duongDan, token, null, ct);
        if (res.StatusCode == HttpStatusCode.Conflict)
        {
            var body = await res.Content.ReadAsStringAsync(ct);
            throw new XBossCanChonDuAnException(
                DocLoiTuChuoi(body) ?? "Cần chỉ định dự án.", DocDanhSachDuAn(body));
        }
        await NemNeuLoi(res, ct);
        return BoqSnapshot.TuJson(await res.Content.ReadAsStringAsync(ct));
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
    /// trả danh sách lỗi thay vì ném để command hiện đủ cho kỹ sư.
    /// <paramref name="takeoffJson"/> (M101 §6.4, PR5): sidecar JSON kết quả bóc khối lượng
    /// (<c>TakeoffJsonReport</c>, cạnh Excel từ <c>XBOSS_BOCKL_XUAT</c>) — TÙY CHỌN, không gửi
    /// vẫn upload y hệt trước (đường ghi sổ BOQ không đổi, server chỉ lưu để đối chiếu).
    /// <paramref name="drawingId"/>: mã số bản vẽ trong sổ (<c>drawings.id</c>) khi kỹ sư biết —
    /// TÙY CHỌN. Route nhận CẢ HAI trường và ƯU TIÊN <c>drawingId</c> (tra theo id, không tra
    /// theo code), nên gửi kèm là cách duy nhất trỏ đúng bản vẽ khi hai dự án trùng
    /// <c>drawings.code</c> — trước đây chỉ gửi code nên rơi vào bản vẽ của dự án khác (403 lệch
    /// dự án) hoặc 404. Không có id ⇒ chỉ gửi code, y hệt hành vi cũ.</summary>
    public async Task<UploadKetQua> UploadAsync(
        string token, string drawingCode, string rev, string rulePackVersion,
        string dwgFileName, byte[] dwgBytes, byte[] dxfBytes, string? reportJson,
        CancellationToken ct = default, string? takeoffJson = null, long? drawingId = null)
    {
        // Route đòi ít nhất một trong hai (400 "Thiếu drawingCode ... hoặc drawingId"). Chặn ngay
        // tại chỗ: tải vài chục MB lên rồi mới nhận 400 là phí băng thông công trường.
        if (drawingId is null && string.IsNullOrWhiteSpace(drawingCode))
        {
            throw new XBossApiException(
                "Thiếu số bản vẽ trong sổ (drawings.code) hoặc mã số bản vẽ — chưa gửi gì lên server.");
        }

        // Cùng lỗi hợp đồng với GuiDeXuatBlockAsync: req.formData() (undici) đòi name/filename
        // trong nháy kép và từ chối filename* — phải qua ThemPhan, không dùng form.Add mặc định.
        using var form = new MultipartFormDataContent();
        ThemPhan(form, new ByteArrayContent(dwgBytes), "dwg", dwgFileName);
        ThemPhan(form, new ByteArrayContent(dxfBytes), "dxf", Path.ChangeExtension(dwgFileName, ".dxf"));
        if (reportJson is not null)
            ThemPhan(form, new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(reportJson)), "report", "report.json");
        if (takeoffJson is not null)
            ThemPhan(form, new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(takeoffJson)), "takeoff", "takeoff.json");
        if (!string.IsNullOrWhiteSpace(drawingCode)) ThemPhan(form, new StringContent(drawingCode), "drawingCode");
        if (drawingId is { } id)
            ThemPhan(form, new StringContent(id.ToString(CultureInfo.InvariantCulture)), "drawingId");
        ThemPhan(form, new StringContent(rev), "rev");
        ThemPhan(form, new StringContent(rulePackVersion), "rulePackVersion");

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
