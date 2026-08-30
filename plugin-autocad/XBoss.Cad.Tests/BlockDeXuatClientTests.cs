using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M103 §3/§4 — <c>XBossApiClient.GuiDeXuatBlockAsync</c> / <c>LayDeXuatBlockAsync</c> với
/// HttpMessageHandler giả (không mạng thật): multipart đúng 3 phần, và ba đường từ chối của
/// server (409 trùng tên, 409 stale, 422) đều phải ra thông điệp tiếng Việt CHỈ RÕ việc tiếp theo
/// — kỹ sư đứng ở AutoCAD không đọc được log server.
/// </summary>
public class BlockDeXuatClientTests
{
    private sealed class FakeHandler(Func<HttpRequestMessage, HttpResponseMessage> tra) : HttpMessageHandler
    {
        public List<HttpRequestMessage> DaNhan { get; } = [];
        public List<string> BodyDaNhan { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DaNhan.Add(request);
            BodyDaNhan.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));
            return tra(request);
        }
    }

    private static HttpResponseMessage Json(HttpStatusCode code, object body) =>
        new(code) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json") };

    private static string JsonMau() =>
        File.ReadAllText(Path.Combine(RepoPaths.DoiChungDir, "block-lib-manifest-mau.json"));

    private static DeXuatBlockGoi Goi()
    {
        var goc = BlockManifestLoader.Load(JsonMau());
        var meta = new BlockDeXuat
        {
            BlockName = "XB-DUCT-TE",
            Kind = BlockKind.Fitting,
            SystemId = "HVAC",
            TakeoffItemId = "duct-fitting",
        };
        const string sha = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
        return new DeXuatBlockGoi
        {
            Meta = meta,
            BaseLibVersion = goc.Version,
            CandidateManifest = BlockUngVien.DungManifest(JsonMau(), meta, [], sha),
            Sha256 = sha,
            CandidateDwg = [1, 2, 3],
            SidecarDxf = Encoding.UTF8.GetBytes("0\nSECTION"),
        };
    }

    private static async Task<(XBossApiClient.DeXuatKetQua Kq, FakeHandler H)> Gui(FakeHandler handler)
    {
        var client = new XBossApiClient("https://xboss.local", handler);
        return (await client.GuiDeXuatBlockAsync("xbt_token", Goi()), handler);
    }

    [Fact]
    public async Task Gui_201_tra_id_va_dung_3_phan_multipart()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Created, new { id = 7, idempotent = false, coPreview = true }));
        var (kq, h) = await Gui(handler);

        Assert.True(kq.DuocNhan);
        Assert.Equal(7, kq.Id);
        Assert.True(kq.CoPreview);
        Assert.False(kq.Idempotent);
        Assert.Equal("https://xboss.local/api/engineering/cad/block-proposals", h.DaNhan[0].RequestUri!.ToString());
        Assert.Equal("Bearer", h.DaNhan[0].Headers.Authorization!.Scheme);

        var body = h.BodyDaNhan[0];
        foreach (var phan in new[] { "candidateDwg", "sidecarDxf", "meta" })
            Assert.True(body.Contains($"name={phan}") || body.Contains($"name=\"{phan}\""), $"thiếu phần {phan}");
        Assert.Contains("XB-DUCT-TE", body);
        Assert.Contains("baseLibVersion", body);
        Assert.Contains("candidateManifest", body);
    }

    [Fact]
    public async Task Gui_200_cung_duoc_coi_la_nhan()
    {
        // Hợp đồng là 201, nhưng mọi mã 2xx đều là "server đã nhận" — không kén mã thành công.
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new { id = 12, idempotent = false, coPreview = true }));
        var (kq, _) = await Gui(handler);
        Assert.True(kq.DuocNhan);
        Assert.Equal(12, kq.Id);
    }

    [Fact]
    public async Task Gui_201_idempotent_khong_tao_ban_doi()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Created, new { id = 7, idempotent = true, coPreview = false }));
        var (kq, _) = await Gui(handler);
        Assert.True(kq.DuocNhan);
        Assert.True(kq.Idempotent);
        Assert.False(kq.CoPreview);
    }

    [Fact]
    public async Task Gui_409_trung_ten_bao_doi_ten_khong_nem()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Conflict, new
        {
            error = "Thư viện hiện hành đã có block \"XB-DUCT-TE\".",
            loai = "trung-ten",
        }));
        var (kq, _) = await Gui(handler);

        Assert.False(kq.DuocNhan);
        Assert.Equal(XBossApiClient.LoaiXungDotDeXuat.TrungTen, kq.XungDot);
        Assert.Contains("ĐỔI TÊN", kq.ThongDiep!);
        Assert.Contains("XB-DUCT-TE", kq.ThongDiep!);
    }

    [Fact]
    public async Task Gui_409_stale_bao_chay_lai_lenh_de_tai_thu_vien_moi()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Conflict, new
        {
            error = "Thư viện đã đổi",
            loai = "stale",
            versionHienHanh = "b7",
        }));
        var (kq, _) = await Gui(handler);

        Assert.False(kq.DuocNhan);
        Assert.Equal(XBossApiClient.LoaiXungDotDeXuat.Stale, kq.XungDot);
        Assert.Equal("b7", kq.VersionHienHanh);
        Assert.Contains("b7", kq.ThongDiep!);
        Assert.Contains("XBOSS_VE_DEXUAT", kq.ThongDiep!);
    }

    [Fact]
    public async Task Gui_409_chua_co_thu_vien_bao_phat_hanh_thu_vien_goc()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Conflict, new { error = "x", loai = "chua-co-thu-vien" }));
        var (kq, _) = await Gui(handler);
        Assert.Equal(XBossApiClient.LoaiXungDotDeXuat.ChuaCoThuVien, kq.XungDot);
        Assert.Contains("Phát hành thư viện gốc", kq.ThongDiep!);
    }

    [Fact]
    public async Task Gui_422_tra_du_danh_sach_loi_khong_nem()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.UnprocessableEntity, new
        {
            errors = new[] { "Thiếu system_id cho kind fitting", "Sidecar DXF không có định nghĩa block XB-DUCT-TE" },
        }));
        var (kq, _) = await Gui(handler);

        Assert.False(kq.DuocNhan);
        Assert.Equal(XBossApiClient.LoaiXungDotDeXuat.KhongCo, kq.XungDot);
        Assert.Equal(2, kq.LoiKiemDinh.Count);
        Assert.Contains(kq.LoiKiemDinh, l => l.Contains("Sidecar DXF"));
    }

    [Fact]
    public async Task Gui_401_nem_huong_dan_ghep_lai()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Unauthorized, new { error = "x" }));
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => Gui(handler));
        Assert.Contains("XBOSS_LOGIN", loi.Message);
    }

    [Fact]
    public async Task Gui_403_nem_thong_diep_thieu_quyen()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Forbidden, new { error = "x" }));
        var loi = await Assert.ThrowsAsync<XBossApiException>(() => Gui(handler));
        Assert.Contains("quyền", loi.Message);
    }

    [Fact]
    public async Task Lay_danh_sach_de_xuat_doc_du_truong_hien_tren_bang()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new
        {
            deXuat = new[]
            {
                new { blockName = "XB-VAN-BI", status = "pending", statusNhan = "Chờ duyệt", rejectReason = (string?)null, publishedVersion = (string?)null },
                new { blockName = "XB-CO-90", status = "rejected", statusNhan = "Từ chối", rejectReason = (string?)"Trùng co có sẵn", publishedVersion = (string?)null },
            },
            laNguoiDuyet = true,
        }));
        var client = new XBossApiClient("https://xboss.local", handler);
        var kq = await client.LayDeXuatBlockAsync("xbt_token");

        Assert.True(kq.LaNguoiDuyet);
        Assert.Equal(2, kq.DeXuat.Count);
        Assert.Equal("pending", kq.DeXuat[0].Status);
        Assert.Equal("Trùng co có sẵn", kq.DeXuat[1].RejectReason);
        Assert.EndsWith("/api/engineering/cad/block-proposals", handler.DaNhan[0].RequestUri!.ToString());
    }
}
