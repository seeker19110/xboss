using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>Test XBossApiClient bằng HttpMessageHandler giả — không mạng thật (M99 PR2 §15).</summary>
public class XBossApiClientTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> tra) : HttpMessageHandler
    {
        public List<HttpRequestMessage> DaNhan { get; } = [];
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request);
            return Task.FromResult(tra(request));
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        };

    [Fact]
    public async Task StartPairing_doc_dung_ma_ghep()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new
        {
            userCode = "AB2C-DE3F",
            deviceCode = "xdc_" + new string('a', 64),
            expiresIn = 600,
            confirmPath = "/engineering/thiet-bi-cad",
        }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.StartPairingAsync("May-Tram-01");
        Assert.Equal("AB2C-DE3F", kq.UserCode);
        Assert.StartsWith("xdc_", kq.DeviceCode);
        Assert.Equal(600, kq.ExpiresInSeconds);
        Assert.Equal("https://xboss.local/api/devices/pair", handler.DaNhan[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task StartPairing_loi_server_nem_thong_diep_tieng_viet()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.TooManyRequests, new
        {
            error = "Vượt giới hạn xin mã ghép thiết bị — thử lại sau",
        }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => client.StartPairingAsync("X"));
        Assert.Contains("Vượt giới hạn", loi.Message);
    }

    [Fact]
    public async Task PollClaim_pending_roi_ok_tra_key_dung_1_lan()
    {
        var lan = 0;
        var handler = new FakeHandler(_ =>
        {
            lan++;
            return lan < 3
                ? Json(HttpStatusCode.Accepted, new { status = "pending" })
                : Json(HttpStatusCode.OK, new { status = "ok", key = "xbk_abc", expiresAt = "2026-11-22", deviceName = "May-01" });
        });
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.PollClaimAsync(
            "xdc_" + new string('a', 64),
            TimeSpan.FromSeconds(5),
            TimeSpan.FromMinutes(10),
            cho: (_, _) => Task.CompletedTask); // không chờ thật trong test
        Assert.Equal(XBossApiClient.ClaimStatus.Ok, kq.Status);
        Assert.Equal("xbk_abc", kq.Ok!.Key);
        Assert.Equal(3, lan);
    }

    [Fact]
    public async Task PollClaim_het_timeout_khi_mai_pending()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Accepted, new { status = "pending" }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.PollClaimAsync(
            "xdc_x", TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(12),
            cho: (_, _) => Task.CompletedTask);
        Assert.Equal(XBossApiClient.ClaimStatus.HetHan, kq.Status);
    }

    [Theory]
    [InlineData(HttpStatusCode.Gone, XBossApiClient.ClaimStatus.HetHan)]
    [InlineData(HttpStatusCode.Forbidden, XBossApiClient.ClaimStatus.TuChoi)]
    public async Task Claim_trang_thai_cuoi_khong_nem(HttpStatusCode code, XBossApiClient.ClaimStatus mongDoi)
    {
        var handler = new FakeHandler(_ => Json(code, new { error = "..." }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.ClaimAsync("xdc_x");
        Assert.Equal(mongDoi, kq.Status);
    }

    [Fact]
    public async Task FetchRulePack_gui_bearer_va_etag_nhan_304_giu_cache()
    {
        var handler = new FakeHandler(req =>
            req.Headers.IfNoneMatch.ToString().Contains("v2-abc")
                ? new HttpResponseMessage(HttpStatusCode.NotModified)
                : Json(HttpStatusCode.OK, new { version = "v2" }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json304, etag304) = await client.FetchRulePackAsync("xbk_t", "\"v2-abc\"");
        Assert.Null(json304);
        Assert.Equal("\"v2-abc\"", etag304);

        var (json, _) = await client.FetchRulePackAsync("xbk_t");
        Assert.Contains("\"v2\"", json);
        Assert.Equal("Bearer xbk_t", handler.DaNhan[1].Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task FetchRulePack_401_nem_huong_dan_login_lai_AC7()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Unauthorized, new { error = "x" }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => client.FetchRulePackAsync("xbk_thu-hoi"));
        Assert.Contains("XBOSS_LOGIN", loi.Message);
    }

    // ===== Thư viện block (M100 PR4 — AC8) =====

    [Fact]
    public async Task FetchBlockLibManifest_boc_dung_phan_manifest_va_gui_manifest_1()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new
        {
            version = "b1",
            dwgSha256 = new string('a', 64),
            manifest = new { version = "b1", dwgSha256 = new string('a', 64), blocks = new[] { new { id = "elbow-duct" } } },
        }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, _) = await client.FetchBlockLibManifestAsync("xbk_t");
        Assert.Contains("\"blocks\"", json);
        Assert.Contains("elbow-duct", json);
        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?manifest=1",
            handler.DaNhan[0].RequestUri!.ToString());
        Assert.Equal("Bearer xbk_t", handler.DaNhan[0].Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task FetchBlockLib_304_giu_cache_cuc_bo()
    {
        var handler = new FakeHandler(req =>
            req.Headers.IfNoneMatch.ToString().Contains("b1-abc")
                ? new HttpResponseMessage(HttpStatusCode.NotModified)
                : Json(HttpStatusCode.OK, new { version = "b1", manifest = new { blocks = Array.Empty<object>() } }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, etag) = await client.FetchBlockLibManifestAsync("xbk_t", "\"b1-abc\"");
        Assert.Null(json);
        Assert.Equal("\"b1-abc\"", etag);

        var (dwg, _) = await client.FetchBlockLibDwgAsync("xbk_t", "\"b1-abc\"");
        Assert.Null(dwg);
    }

    [Fact]
    public async Task FetchBlockLibDwg_tra_dung_byte_va_etag()
    {
        var noiDung = new byte[] { 0x41, 0x43, 0x31, 0x30 }; // "AC10" — vài byte đầu của tệp DWG thật
        var handler = new FakeHandler(_ =>
        {
            var res = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(noiDung) };
            res.Headers.ETag = new System.Net.Http.Headers.EntityTagHeaderValue("\"b1-abc\"");
            return res;
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        var (dwg, etag) = await client.FetchBlockLibDwgAsync("xbk_t");
        Assert.Equal(noiDung, dwg);
        Assert.Equal("\"b1-abc\"", etag);
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib", handler.DaNhan[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task FetchBlockLib_404_giu_nguyen_thong_diep_huong_dan_cua_server()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.NotFound, new
        {
            error = "Chưa phát hành thư viện block nào — vào /engineering/chuan-hoa-ban-ve.",
        }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => client.FetchBlockLibManifestAsync("xbk_t"));
        Assert.Contains("Chưa phát hành thư viện block", loi.Message);
    }

    [Fact]
    public async Task FetchBlockLib_401_nem_huong_dan_login_lai()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Unauthorized, new { error = "x" }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => client.FetchBlockLibDwgAsync("xbk_thu-hoi"));
        Assert.Contains("XBOSS_LOGIN", loi.Message);
    }
}
