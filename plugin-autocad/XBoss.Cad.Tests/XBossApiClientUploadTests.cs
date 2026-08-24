using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>Test UploadAsync/PollUploadJobAsync (M99 PR5) bằng HttpMessageHandler giả.</summary>
public class XBossApiClientUploadTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> tra) : HttpMessageHandler
    {
        public List<HttpRequestMessage> DaNhan { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request);
            return tra(request);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };

    private static XBossApiClient.UploadInput MauUpload() => new()
    {
        DwgBytes = [1, 2, 3, 4],
        DwgFileName = "MB-TANG-05.dwg",
        DxfContent = "0\nSECTION\n...",
        ReportJson = """{"cheDo":"chuan-hoa"}""",
        RulePackVersion = "v2",
        DrawingCode = "ACMV-SD-T05-001",
        DrawingName = "Mặt bằng tầng 5",
        Systems = "HVAC",
        Rev = "A",
    };

    [Fact]
    public async Task Upload_gui_multipart_du_field_va_bearer()
    {
        string? contentType = null;
        var fieldNames = new List<string>();
        var handler = new FakeHandler(req =>
        {
            contentType = req.Content!.Headers.ContentType!.MediaType;
            // Handler giả nhận đúng object MultipartFormDataContent client dựng — enumerate
            // trực tiếp (BCL .NET 8 không có ReadAsMultipartAsync).
            foreach (var part in (MultipartFormDataContent)req.Content)
                fieldNames.Add(part.Headers.ContentDisposition!.Name!.Trim('"'));
            return Task.FromResult(Json(HttpStatusCode.Accepted,
                new { status = "accepted", jobId = "j-1", drawingId = 7, revisionId = 9 }));
        });
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.UploadAsync("xbk_t", MauUpload());

        Assert.Equal("accepted", kq.Status);
        Assert.Equal("j-1", kq.JobId);
        Assert.Equal(9, kq.RevisionId);
        Assert.Equal("multipart/form-data", contentType);
        Assert.Equal(
            ["dwg", "dxf", "report", "rulePackVersion", "drawingCode", "drawingName", "systems", "rev"],
            fieldNames);
        Assert.Equal("Bearer xbk_t", handler.DaNhan[0].Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task Upload_trung_lap_tra_duplicated_khong_nem()
    {
        var handler = new FakeHandler(_ =>
            Task.FromResult(Json(HttpStatusCode.OK, new { status = "duplicated", revisionId = 12 })));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.UploadAsync("xbk_t", MauUpload());
        Assert.Equal("duplicated", kq.Status);
        Assert.Equal(12, kq.RevisionId);
    }

    [Theory]
    [InlineData(HttpStatusCode.UnprocessableEntity, "DXF sidecar không hợp lệ — không nhận bản vẽ")]
    [InlineData(HttpStatusCode.Conflict, "Rule pack v1 đã lỗi thời")]
    public async Task Upload_loi_nghiep_vu_nem_thong_diep_server(HttpStatusCode code, string thongDiep)
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(code, new { error = thongDiep })));
        var client = new XBossApiClient("https://xboss.local", handler);
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => client.UploadAsync("xbk_t", MauUpload()));
        Assert.Contains(thongDiep[..15], loi.Message);
    }

    [Fact]
    public async Task PollUploadJob_processing_roi_rejected_mang_validation()
    {
        var lan = 0;
        var handler = new FakeHandler(_ =>
        {
            lan++;
            return Task.FromResult(lan < 3
                ? Json(HttpStatusCode.OK, new { status = "processing", revisionId = 9, validation = (object?)null })
                : Json(HttpStatusCode.OK, new
                {
                    status = "rejected",
                    revisionId = 9,
                    validation = new { valid = false, errors = new[] { "audit 455 fix" } },
                }));
        });
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.PollUploadJobAsync(
            "xbk_t", "j-1", TimeSpan.FromSeconds(3), TimeSpan.FromMinutes(5),
            cho: (_, _) => Task.CompletedTask);
        Assert.Equal("rejected", kq.Status);
        Assert.Equal(3, lan);
        Assert.Contains("audit 455 fix", kq.Validation!.Value.GetRawText());
    }

    [Fact]
    public async Task PollUploadJob_het_timeout_tra_processing_de_caller_bao_kiem_tra_sau()
    {
        var handler = new FakeHandler(_ =>
            Task.FromResult(Json(HttpStatusCode.OK, new { status = "processing" })));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.PollUploadJobAsync(
            "xbk_t", "j-1", TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(8),
            cho: (_, _) => Task.CompletedTask);
        Assert.Equal("processing", kq.Status);
    }
}
