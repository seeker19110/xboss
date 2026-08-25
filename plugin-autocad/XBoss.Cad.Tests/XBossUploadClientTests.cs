using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>Test UploadAsync/FetchUploadJobAsync (M99 PR5) bằng handler giả — không mạng thật.</summary>
public class XBossUploadClientTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> tra) : HttpMessageHandler
    {
        public List<HttpRequestMessage> DaNhan { get; } = [];
        public List<string> BodyDaNhan { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request);
            // Đọc body TRƯỚC khi content bị dispose (multipart chỉ đọc được lúc này).
            BodyDaNhan.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));
            return await tra(request);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };

    private static Task<UploadKq> Upload(FakeHandler handler)
        => UploadVoi(handler, reportJson: "{\"cheDo\":\"chuan-hoa\"}");

    private sealed record UploadKq(XBossApiClient.UploadKetQua Kq, FakeHandler Handler);

    private static async Task<UploadKq> UploadVoi(FakeHandler handler, string? reportJson, string? takeoffJson = null)
    {
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.UploadAsync(
            "xbt_token", "ACMV-SD-T05-001", "B", "2.0.0",
            "T05.dwg", [1, 2, 3], Encoding.UTF8.GetBytes("0\nSECTION"), reportJson,
            takeoffJson: takeoffJson);
        return new UploadKq(kq, handler);
    }

    [Fact]
    public async Task Upload_202_tra_jobId_va_gui_du_5_field_multipart()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.Accepted, new { jobId = "j-1" })));
        var (kq, h) = await Upload(handler);

        Assert.True(kq.DuocNhan);
        Assert.Equal("j-1", kq.JobId);
        Assert.Equal("https://xboss.local/api/engineering/cad/plugin-upload", h.DaNhan[0].RequestUri!.ToString());
        Assert.Equal("Bearer", h.DaNhan[0].Headers.Authorization!.Scheme);
        var body = h.BodyDaNhan[0];
        // .NET có thể ghi name có hoặc không có nháy kép tuỳ token hợp lệ — khớp cả hai.
        foreach (var field in new[] { "dwg", "dxf", "report", "drawingCode", "rev", "rulePackVersion" })
            Assert.True(body.Contains($"name={field}") || body.Contains($"name=\"{field}\""), $"thiếu field {field}");
        Assert.Contains("ACMV-SD-T05-001", body);
        Assert.Contains("2.0.0", body);
    }

    [Fact]
    public async Task Upload_khong_report_thi_khong_gui_field_report()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.Accepted, new { jobId = "j-2" })));
        var (kq, h) = await UploadVoi(handler, reportJson: null);
        Assert.True(kq.DuocNhan);
        Assert.DoesNotContain("report.json", h.BodyDaNhan[0]);
    }

    [Fact]
    public async Task Upload_khong_takeoff_thi_khong_gui_field_takeoff_upload_cu_chay_y_nguyen()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.Accepted, new { jobId = "j-2b" })));
        var (kq, h) = await UploadVoi(handler, reportJson: "{\"cheDo\":\"chuan-hoa\"}", takeoffJson: null);
        Assert.True(kq.DuocNhan);
        Assert.DoesNotContain("takeoff.json", h.BodyDaNhan[0]);
    }

    [Fact]
    public async Task Upload_kem_takeoff_json_gui_them_field_takeoff_M101_PR5()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.Accepted, new { jobId = "j-2c" })));
        var (kq, h) = await UploadVoi(
            handler, reportJson: "{\"cheDo\":\"chuan-hoa\"}", takeoffJson: "{\"rulePackVersion\":\"2.0.0\"}");
        Assert.True(kq.DuocNhan);
        var body = h.BodyDaNhan[0];
        Assert.True(body.Contains("name=takeoff") || body.Contains("name=\"takeoff\""));
        Assert.Contains("takeoff.json", body);
    }

    [Fact]
    public async Task Upload_422_tra_du_loi_kiem_dinh_khong_nem_AC5()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.UnprocessableEntity, new
        {
            jobId = "j-3",
            validation = new { ok = false, errors = new[] { "Rule pack 1.0.0 không phải bản đang phát hành" }, warnings = Array.Empty<string>() },
        })));
        var (kq, _) = await Upload(handler);
        Assert.False(kq.DuocNhan);
        Assert.Equal("j-3", kq.JobId);
        Assert.Contains(kq.LoiKiemDinh, l => l.Contains("Rule pack"));
    }

    [Fact]
    public async Task Upload_401_nem_huong_dan_ghep_lai_AC7()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.Unauthorized, new { error = "x" })));
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => Upload(handler));
        Assert.Contains("XBOSS_LOGIN", loi.Message);
    }

    [Fact]
    public async Task FetchUploadJob_doc_status_revision_idempotent()
    {
        var handler = new FakeHandler(_ => Task.FromResult(Json(HttpStatusCode.OK, new
        {
            status = "completed",
            revisionId = 42,
            idempotent = true,
            validation = new { ok = true, errors = Array.Empty<string>(), warnings = Array.Empty<string>() },
        })));
        var client = new XBossApiClient("https://xboss.local", handler);
        var job = await client.FetchUploadJobAsync("xbt_token", "j-1");
        Assert.Equal("completed", job.Status);
        Assert.Equal(42, job.RevisionId);
        Assert.True(job.Idempotent);
        Assert.True(job.Validation!.Ok);
        Assert.EndsWith("/api/engineering/cad/plugin-upload/j-1", handler.DaNhan[0].RequestUri!.ToString());
    }
}
