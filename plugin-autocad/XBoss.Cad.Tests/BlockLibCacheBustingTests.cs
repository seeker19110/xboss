using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Cache-busting <c>?v=&lt;version&gt;</c> khi hỏi thư viện block (route
/// <c>app/api/engineering/cad/block-lib/route.ts</c>).
///
/// Ngữ nghĩa của route, KHÔNG phải suy đoán: <c>v</c> không chọn bản để tải; gửi <c>v</c> khác bản
/// đang phát hành thì server trả <b>404</b> kèm thông điệp "phiên bản không còn là bản hiện hành".
/// Với plugin, 404 đó = "cache trên máy đã cũ" nên phải hỏi lại lần hai không kèm <c>v</c>; còn
/// 404 "chưa phát hành thư viện nào" thì lần hai vẫn 404 và caller nhận đúng thông điệp server.
/// ETag giữ nguyên vai trò cũ (304 = giữ cache), không bị <c>v</c> thay thế.
/// </summary>
public class BlockLibCacheBustingTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> tra) : HttpMessageHandler
    {
        public List<Uri> DaNhan { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request.RequestUri!);
            return Task.FromResult(tra(request));
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };

    private static HttpResponseMessage ManifestCua(string version) =>
        Json(HttpStatusCode.OK, new
        {
            version,
            manifest = new { version, blocks = new[] { new { id = "elbow-duct" } } },
        });

    private static HttpResponseMessage LechVersion(string dangXin, string hienHanh) =>
        Json(HttpStatusCode.NotFound, new
        {
            error = $"Phiên bản thư viện không còn là bản hiện hành (đang yêu cầu {dangXin}, " +
                    $"bản hiện hành là {hienHanh}) — tải lại trang để lấy bản mới nhất.",
        });

    private static bool CoV(HttpRequestMessage req) => req.RequestUri!.Query.Contains("v=");

    // ===== Gắn ?v= đúng chỗ =====

    [Fact]
    public async Task Co_cache_thi_manifest_gan_them_v_sau_manifest_1()
    {
        var handler = new FakeHandler(_ => ManifestCua("b1"));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, _) = await client.FetchBlockLibManifestAsync("xbk_t", null, "b1");

        Assert.Contains("elbow-duct", json);
        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?manifest=1&v=b1",
            handler.DaNhan[0].ToString());
        Assert.Single(handler.DaNhan);
    }

    [Fact]
    public async Task Chua_co_cache_thi_khong_gan_v_giu_nguyen_hanh_vi_cu()
    {
        var handler = new FakeHandler(_ => ManifestCua("b1"));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchBlockLibManifestAsync("xbk_t");
        await client.FetchBlockLibDwgAsync("xbk_t");

        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib?manifest=1", handler.DaNhan[0].ToString());
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib", handler.DaNhan[1].ToString());
    }

    [Fact]
    public async Task Tep_dwg_chot_theo_version_manifest_vua_nhan()
    {
        var noiDung = new byte[] { 0x41, 0x43, 0x31, 0x30 }; // "AC10" — vài byte đầu của DWG thật
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(noiDung),
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        var (dwg, _) = await client.FetchBlockLibDwgAsync("xbk_t", null, "b7");

        Assert.Equal(noiDung, dwg);
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib?v=b7", handler.DaNhan[0].ToString());
    }

    // ===== Server báo lệch version =====

    [Fact]
    public async Task Server_bao_lech_version_thi_hoi_lai_khong_kem_v_va_lay_duoc_ban_moi()
    {
        var handler = new FakeHandler(req => CoV(req) ? LechVersion("b1", "b2") : ManifestCua("b2"));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, _) = await client.FetchBlockLibManifestAsync("xbk_t", "\"b1-abc\"", "b1");

        Assert.Contains("b2", json);
        Assert.Equal(2, handler.DaNhan.Count);
        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?manifest=1&v=b1",
            handler.DaNhan[0].ToString());
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib?manifest=1", handler.DaNhan[1].ToString());
    }

    [Fact]
    public async Task Server_bao_lech_version_o_duong_tep_dwg_cung_hoi_lai_mot_lan()
    {
        var handler = new FakeHandler(req => CoV(req)
            ? LechVersion("b1", "b2")
            : new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent([1, 2, 3]) });
        var client = new XBossApiClient("https://xboss.local", handler);

        var (dwg, _) = await client.FetchBlockLibDwgAsync("xbk_t", null, "b1");

        Assert.Equal(new byte[] { 1, 2, 3 }, dwg);
        Assert.Equal(2, handler.DaNhan.Count);
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib", handler.DaNhan[1].ToString());
    }

    [Fact]
    public async Task Chua_phat_hanh_thu_vien_thi_van_nem_dung_thong_diep_huong_dan_cua_server()
    {
        // 404 lần hai (không còn v) = lỗi thật, không phải cache cũ — giữ nguyên thông điệp server.
        var handler = new FakeHandler(_ => Json(HttpStatusCode.NotFound, new
        {
            error = "Chưa phát hành thư viện block nào — vào /engineering/chuan-hoa-ban-ve.",
        }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var loi = await Assert.ThrowsAsync<XBossApiException>(
            () => client.FetchBlockLibManifestAsync("xbk_t", null, "b1"));

        Assert.Contains("Chưa phát hành thư viện block", loi.Message);
        Assert.Equal(2, handler.DaNhan.Count);
    }

    [Fact]
    public async Task Version_khop_va_ETag_khop_thi_van_304_giu_cache_chi_mot_request()
    {
        var handler = new FakeHandler(req =>
            req.Headers.IfNoneMatch.ToString().Contains("b1-abc")
                ? new HttpResponseMessage(HttpStatusCode.NotModified)
                : ManifestCua("b1"));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, etag) = await client.FetchBlockLibManifestAsync("xbk_t", "\"b1-abc\"", "b1");

        Assert.Null(json); // caller giữ nguyên bản cache
        Assert.Equal("\"b1-abc\"", etag);
        Assert.Single(handler.DaNhan);
    }

    [Fact]
    public async Task Tep_le_khong_kem_v_vi_nhanh_file_cua_route_tra_truoc_cho_kiem_v()
    {
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent([1, 2, 3]),
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchBlockLibTepLeAsync("xbk_t", "blocklib-van-1756-ab.dwg");

        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?file=blocklib-van-1756-ab.dwg",
            handler.DaNhan[0].ToString());
    }
}
