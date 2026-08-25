using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 §6.3 PR4 — client tải KL BOQ hợp đồng (`GET /api/engineering/cad/boq-snapshot`), CHỈ ĐỌC.
/// Kiểm bằng HttpMessageHandler giả, không mạng thật (cùng khuôn XBossApiClientTests).
/// </summary>
public class BoqSnapshotClientTests
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

    private static object BodyMau() => new
    {
        projectId = 7,
        rulePackVersion = "v7",
        chupLuc = "2026-08-25T02:00:00.000Z",
        dong = new object[]
        {
            new { takeoffItemId = "duct-supp", boqCode = "HVAC-01", ten = "Ống gió cấp", donVi = "m", qtyContract = 120.5 },
            new { takeoffItemId = "chw-pipe", boqCode = "HVAC-09", ten = (string?)null, donVi = (string?)null, qtyContract = (double?)null },
        },
    };

    [Fact]
    public async Task Tai_snapshot_kem_project_va_bearer_token()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, BodyMau()));
        var client = new XBossApiClient("https://xboss.local", handler);

        var kq = await client.FetchBoqSnapshotAsync("xbk_abc", 7);

        Assert.Equal(7, kq.ProjectId);
        Assert.Equal("v7", kq.RulePackVersion);
        Assert.Equal(2, kq.Dong.Count);
        Assert.Equal(120.5, kq.Dong[0].QtyContract);
        // Chưa khớp dòng BOQ nào → null, KHÔNG được biến thành 0 (0 là "khớp và bằng 0").
        Assert.Null(kq.Dong[1].QtyContract);
        Assert.Null(kq.Dong[1].Ten);

        var req = handler.DaNhan[0];
        Assert.Equal(HttpMethod.Get, req.Method); // chỉ ĐỌC — không có đường ghi
        Assert.Equal("https://xboss.local/api/engineering/cad/boq-snapshot?project=7", req.RequestUri!.ToString());
        Assert.Equal("Bearer", req.Headers.Authorization!.Scheme);
        Assert.Equal("xbk_abc", req.Headers.Authorization.Parameter);
    }

    [Fact]
    public async Task Khong_truyen_project_thi_de_may_chu_tu_suy()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, BodyMau()));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchBoqSnapshotAsync("xbk_abc");

        Assert.Equal("https://xboss.local/api/engineering/cad/boq-snapshot",
            handler.DaNhan[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task Thuoc_nhieu_du_an_thi_nem_kem_danh_sach_de_hoi_ky_su()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Conflict, new
        {
            error = "Bạn thuộc nhiều dự án — chỉ định ?project=<id>",
            duAn = new object[] { new { id = 3, name = "TT AVIO Tháp A" }, new { id = 5, name = "Nhà máy B" } },
        }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var loi = await Assert.ThrowsAsync<XBossCanChonDuAnException>(
            () => client.FetchBoqSnapshotAsync("xbk_abc"));

        Assert.Contains("nhiều dự án", loi.Message);
        Assert.Equal(2, loi.DuAn.Count);
        Assert.Equal(3, loi.DuAn[0].Id);
        Assert.Equal("Nhà máy B", loi.DuAn[1].Name);
    }

    [Fact]
    public async Task Token_het_han_va_khong_co_quyen_deu_nem_thong_diep_tieng_viet()
    {
        var client401 = new XBossApiClient("https://xboss.local",
            new FakeHandler(_ => Json(HttpStatusCode.Unauthorized, new { error = "Chưa đăng nhập" })));
        var loi401 = await Assert.ThrowsAsync<XBossApiException>(
            () => client401.FetchBoqSnapshotAsync("xbk_cu"));
        Assert.Contains("XBOSS_LOGIN", loi401.Message);

        var client403 = new XBossApiClient("https://xboss.local",
            new FakeHandler(_ => Json(HttpStatusCode.Forbidden,
                new { error = "Không có quyền xem khối lượng BOQ hợp đồng" })));
        var loi403 = await Assert.ThrowsAsync<XBossApiException>(
            () => client403.FetchBoqSnapshotAsync("xbk_abc"));
        Assert.Contains("Không có quyền", loi403.Message);
    }

    [Fact]
    public async Task Body_khong_phai_json_thi_nem_thong_diep_ro_rang_khong_nem_JsonException()
    {
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("<html>proxy chặn</html>", Encoding.UTF8, "text/html"),
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        var loi = await Assert.ThrowsAsync<XBossApiException>(
            () => client.FetchBoqSnapshotAsync("xbk_abc", 1));
        Assert.Contains("không phải JSON hợp lệ", loi.Message);
    }
}
