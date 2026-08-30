using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Cờ <c>duocThemTrucTiep</c> của <c>GET /api/engineering/cad/block-proposals</c> (M104 §3):
/// vai trò này có được thêm block THẲNG vào thư viện trên web (bỏ qua hàng chờ) hay không.
///
/// Plugin phải ĐỌC cờ từ server chứ không tự suy theo vai trò nhớ trong máy — quyền là việc của
/// server. Cờ chỉ dùng để nói đúng việc tiếp theo cho kỹ sư ở <c>XBOSS_VE_DEXUAT</c>; đường ghi
/// thẳng vẫn chỉ có trên web (route đó không nhận token thiết bị).
/// </summary>
public class BlockDeXuatQuyenTests
{
    private sealed class FakeHandler(HttpResponseMessage tra) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(tra);
    }

    private static Task<XBossApiClient.DanhSachDeXuat> Lay(object body)
    {
        var handler = new FakeHandler(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
        });
        return new XBossApiClient("https://xboss.local", handler).LayDeXuatBlockAsync("xbt_token");
    }

    [Fact]
    public async Task Doc_duoc_co_duocThemTrucTiep_khi_server_bat()
    {
        var kq = await Lay(new
        {
            deXuat = new[] { new { blockName = "XB-VAN-BI", status = "pending", statusNhan = "Chờ duyệt" } },
            laNguoiDuyet = false,
            duocThemTrucTiep = true,
        });

        Assert.True(kq.DuocThemTrucTiep);
        Assert.False(kq.LaNguoiDuyet); // hai cờ độc lập: kỹ sư không duyệt được nhưng vẫn thêm thẳng được
        Assert.Single(kq.DeXuat);
    }

    [Fact]
    public async Task Server_tat_co_thi_doc_ra_false()
    {
        var kq = await Lay(new { deXuat = Array.Empty<object>(), laNguoiDuyet = false, duocThemTrucTiep = false });
        Assert.False(kq.DuocThemTrucTiep);
    }

    [Fact]
    public async Task Server_cu_khong_tra_co_thi_mac_dinh_false_giu_nguyen_thong_diep_cu()
    {
        var kq = await Lay(new { deXuat = Array.Empty<object>(), laNguoiDuyet = true });
        Assert.True(kq.LaNguoiDuyet);
        Assert.False(kq.DuocThemTrucTiep);
    }
}
