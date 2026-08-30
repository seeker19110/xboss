using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần đề xuất block vào thư viện của <see cref="XBossApiClient"/> (M103 §3/§4,
/// lô M108 §10) — POST /api/engineering/cad/block-proposals(/batch).</summary>
public sealed partial class XBossApiClient
{
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
    /// Gửi một LÔ block lên hàng chờ duyệt (M108 §10 — <c>POST block-proposals/batch</c>).
    ///
    /// Khác <see cref="GuiDeXuatBlockAsync"/> (M103, một block kèm metadata do kỹ sư khai): lô
    /// KHÔNG mang metadata nào — máy chủ đọc mọi định nghĩa block trong DXF, tự đề xuất phân loại,
    /// rồi Admin/PM duyệt theo lô trên web. Vì thế ở đây chỉ có hai tệp và không có manifest.
    ///
    /// Thêm phần multipart phải dùng <see cref="ThemPhan"/> (không <c>form.Add(content, name,
    /// fileName)</c> mặc định của .NET): bộ đọc multipart của Next.js (<c>req.formData()</c> —
    /// undici) đòi <c>Content-Disposition</c> đúng chuẩn WHATWG (name/filename trong nháy kép,
    /// không kèm <c>filename*</c> RFC 5987) — đã kiểm thật bằng Node 22 (M103 §4).
    /// </summary>
    public async Task<LoBlockKetQua> GuiLoBlockAsync(
        string token, byte[] dwg, byte[] dxf, CancellationToken ct = default)
    {
        using var form = new MultipartFormDataContent();
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
}
