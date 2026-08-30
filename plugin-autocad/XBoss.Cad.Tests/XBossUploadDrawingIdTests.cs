using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// XBOSS_UPLOAD gửi kèm <c>drawingId</c> khi kỹ sư gõ <c>#&lt;mã số&gt;</c>.
///
/// Vì sao cần: route <c>POST /api/engineering/cad/plugin-upload</c> nhận CẢ <c>drawingCode</c> lẫn
/// <c>drawingId</c> và tra theo id TRƯỚC. <c>drawings.code</c> chỉ duy nhất trong phạm vi một dự
/// án, nên khi hai dự án trùng mã, gửi mỗi code sẽ rơi vào bản vẽ của dự án khác (403/404) mà kỹ
/// sư không có cách nào chỉ định đúng bản ghi.
/// </summary>
public class XBossUploadDrawingIdTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> tra) : HttpMessageHandler
    {
        public List<HttpRequestMessage> DaNhan { get; } = [];
        public List<string> BodyDaNhan { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request);
            // Đọc body TRƯỚC khi content bị dispose (multipart chỉ đọc được lúc này).
            BodyDaNhan.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));
            return tra(request);
        }
    }

    private static FakeHandler HandlerNhan(string jobId) =>
        new(_ => new HttpResponseMessage(HttpStatusCode.Accepted)
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { jobId }), Encoding.UTF8, "application/json"),
        });

    private static Task<XBossApiClient.UploadKetQua> Upload(
        FakeHandler handler, string drawingCode, long? drawingId) =>
        new XBossApiClient("https://xboss.local", handler).UploadAsync(
            "xbt_token", drawingCode, "B", "2.0.0",
            "T05.dwg", [1, 2, 3], Encoding.UTF8.GetBytes("0\nSECTION"), reportJson: null,
            drawingId: drawingId);

    // ===== Multipart dựng đúng theo hai nguồn định danh =====

    [Fact]
    public async Task Khong_co_drawingId_thi_gui_y_nhu_cu_chi_drawingCode()
    {
        var handler = HandlerNhan("j-1");
        var kq = await Upload(handler, "ACMV-SD-T05-001", drawingId: null);

        Assert.True(kq.DuocNhan);
        var body = handler.BodyDaNhan[0];
        Assert.Contains("name=\"drawingCode\"", body);
        Assert.Contains("ACMV-SD-T05-001", body);
        Assert.DoesNotContain("name=\"drawingId\"", body);
    }

    [Fact]
    public async Task Co_ca_hai_thi_gui_ca_hai_de_server_uu_tien_drawingId()
    {
        var handler = HandlerNhan("j-2");
        var kq = await Upload(handler, "ACMV-SD-T05-001", drawingId: 9042);

        Assert.True(kq.DuocNhan);
        var body = handler.BodyDaNhan[0];
        // Chuẩn WHATWG (req.formData()/undici): name PHẢI trong nháy kép, cấm filename*.
        Assert.Contains("name=\"drawingCode\"", body);
        Assert.Contains("name=\"drawingId\"", body);
        Assert.Contains("ACMV-SD-T05-001", body);
        // Khớp cả dấu ngăn "\r\n\r\n" trước nội dung: chuỗi số trần có thể trùng ngẫu nhiên với
        // vài ký tự trong boundary (toàn chữ số hex), còn dòng trống thì không bao giờ.
        Assert.Contains("\r\n\r\n9042\r\n", body);
    }

    [Fact]
    public async Task Chi_co_drawingId_thi_khong_gui_field_drawingCode_rong()
    {
        var handler = HandlerNhan("j-3");
        var kq = await Upload(handler, "", drawingId: 9042);

        Assert.True(kq.DuocNhan);
        var body = handler.BodyDaNhan[0];
        Assert.DoesNotContain("name=\"drawingCode\"", body);
        Assert.Contains("name=\"drawingId\"", body);
        Assert.Contains("\r\n\r\n9042\r\n", body);
    }

    [Fact]
    public async Task Khong_co_ca_code_lan_id_thi_nem_ngay_khong_ton_bang_thong_cong_truong()
    {
        var handler = HandlerNhan("j-4");
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => Upload(handler, "   ", drawingId: null));

        Assert.Contains("số bản vẽ", loi.Message);
        Assert.Empty(handler.DaNhan); // chưa gửi byte nào lên mạng
    }

    // ===== Đọc câu trả lời của kỹ sư (thuần, dùng ở XBossUploadCommand) =====

    [Theory]
    [InlineData("#128")]
    [InlineData(" #128 ")]
    [InlineData("id:128")]
    [InlineData("ID:128")]
    public void PhanTich_hieu_cu_phap_ma_so_ban_ve(string nhap)
    {
        var kq = MaBanVeDich.PhanTich(nhap);
        Assert.True(kq.HopLe);
        Assert.Equal(128L, kq.Id);
        Assert.Null(kq.Code);
        Assert.Equal("#128", kq.MoTa);
    }

    [Theory]
    [InlineData("ACMV-SD-T05-001")]
    [InlineData("1204")] // code hoàn toàn có thể toàn số — KHÔNG được đoán thành id
    public void PhanTich_mac_dinh_van_la_so_ban_ve_trong_so(string nhap)
    {
        var kq = MaBanVeDich.PhanTich(nhap);
        Assert.True(kq.HopLe);
        Assert.Null(kq.Id);
        Assert.Equal(nhap, kq.Code);
        Assert.Equal(nhap, kq.MoTa);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("#")]
    [InlineData("#abc")]
    [InlineData("#0")]
    [InlineData("#-3")]
    public void PhanTich_bao_loi_tieng_Viet_thay_vi_gui_bua(string nhap)
    {
        var kq = MaBanVeDich.PhanTich(nhap);
        Assert.False(kq.HopLe);
        Assert.False(string.IsNullOrWhiteSpace(kq.Loi));
        Assert.Null(kq.Id);
    }
}
