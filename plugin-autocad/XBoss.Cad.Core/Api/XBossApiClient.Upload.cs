using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace XBoss.Cad.Core.Api;

/// <summary>Phần XBOSS_UPLOAD của <see cref="XBossApiClient"/> (M99 PR5) —
/// POST /api/engineering/cad/plugin-upload + GET trạng thái job.</summary>
public sealed partial class XBossApiClient
{
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
    /// dự án) hoặc 404. Không có id ⇒ chỉ gửi code, y hệt hành vi cũ.
    /// <paramref name="phoiHopJson"/> (M116 PR3, TÙY CHỌN): tóm tắt phối hợp xung đột liên hệ
    /// (<c>PhoiHopTomTat</c>, sidecar <c>.xboss-phoihop.json</c> do <c>XBOSS_PHOIHOP_BAOCAO</c>
    /// ghi) — server lưu vào <c>standardize_report.phoiHop</c>. Không gửi vẫn upload y hệt trước
    /// M116 (chưa chạy XBOSS_PHOIHOP_BAOCAO, hoặc rule pack chưa bật coordinationPolicy).</summary>
    public async Task<UploadKetQua> UploadAsync(
        string token, string drawingCode, string rev, string rulePackVersion,
        string dwgFileName, byte[] dwgBytes, byte[] dxfBytes, string? reportJson,
        CancellationToken ct = default, string? takeoffJson = null, long? drawingId = null,
        string? phoiHopJson = null)
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
        if (phoiHopJson is not null)
            ThemPhan(form, new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(phoiHopJson)), "phoiHop", "phoihop.json");
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
}
