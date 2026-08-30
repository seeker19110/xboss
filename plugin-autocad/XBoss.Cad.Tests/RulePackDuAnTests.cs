using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 PR4 (khép vòng phía plugin) — rule pack THEO DỰ ÁN:
/// dựng URL đúng cho từng phạm vi, xử lý 409 "chọn dự án" rồi gọi lại, và khoá cache/ETag tách
/// theo dự án. Kiểm bằng HttpMessageHandler giả + hàm thuần, không mạng thật, không AutoCAD
/// (cùng khuôn <see cref="XBossApiClientTests"/>/<see cref="BoqSnapshotClientTests"/>).
/// </summary>
public class RulePackDuAnTests
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

    private const string DuongDanGoc = "https://xboss.local/api/engineering/cad/rule-pack";

    // ===== Dựng URL =====

    [Fact]
    public async Task Khong_theo_du_an_thi_URL_y_het_truoc_PR4()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new { version = "v8" }));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchRulePackAsync("xbk_t"); // mặc định = PhamViDuAn.ToanCuc

        Assert.Equal(DuongDanGoc, handler.DaNhan[0].RequestUri!.ToString());
    }

    [Fact]
    public async Task Da_chon_du_an_thi_gan_project_id()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new { version = "v8", projectId = 7 }));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchRulePackAsync("xbk_t", null, PhamViDuAn.Cua(7));

        Assert.Equal(DuongDanGoc + "?project=7", handler.DaNhan[0].RequestUri!.ToString());
        Assert.Equal("Bearer xbk_t", handler.DaNhan[0].Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task De_may_chu_tu_suy_thi_gan_project_rong()
    {
        // Khác hẳn "không gắn gì": máy chủ chỉ tra map BOQ khi tham số project CÓ MẶT.
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new { version = "v8", projectId = 3 }));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchRulePackAsync("xbk_t", null, PhamViDuAn.MayChuTuSuy);

        Assert.Equal(DuongDanGoc + "?project=", handler.DaNhan[0].RequestUri!.ToString());
    }

    // ===== 409 → chọn dự án → gọi lại =====

    [Fact]
    public async Task Thuoc_nhieu_du_an_thi_nem_kem_danh_sach_roi_goi_lai_duoc()
    {
        var handler = new FakeHandler(req =>
            req.RequestUri!.Query is "?project=" or ""
                ? Json(HttpStatusCode.Conflict, new
                {
                    error = "Bạn thuộc nhiều dự án — chỉ định ?project=<id>",
                    duAn = new object[]
                    {
                        new { id = 3, name = "TT AVIO Tháp A" },
                        new { id = 5, name = "Nhà máy B" },
                    },
                })
                : Json(HttpStatusCode.OK, new { version = "v8", projectId = 5 }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var loi = await Assert.ThrowsAsync<XBossCanChonDuAnException>(
            () => client.FetchRulePackAsync("xbk_t", null, PhamViDuAn.MayChuTuSuy));
        Assert.Contains("nhiều dự án", loi.Message);
        Assert.Equal(2, loi.DuAn.Count);
        Assert.Equal("Nhà máy B", loi.DuAn[1].Name);

        // Kỹ sư chọn dự án 5 → lệnh gọi lại đúng phạm vi đó.
        var (json, _) = await client.FetchRulePackAsync("xbk_t", null, PhamViDuAn.Cua(loi.DuAn[1].Id));
        Assert.Contains("\"projectId\":5", json);
        Assert.Equal(DuongDanGoc + "?project=5", handler.DaNhan[1].RequestUri!.ToString());
    }

    [Fact]
    public async Task Khong_quyen_voi_du_an_da_nho_thi_nem_de_lenh_lui_ve_ban_toan_cuc()
    {
        // Máy chủ trả 403 khi id nhớ trong máy không còn thuộc tài khoản — lệnh bắt XBossApiException
        // rồi tải lại bản toàn cục (không bao giờ chặn XBOSS_LOGIN vì chuyện mã BOQ).
        var handler = new FakeHandler(_ => Json(HttpStatusCode.Forbidden, new { error = "Không có quyền với dự án này" }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var loi = await Assert.ThrowsAsync<XBossApiException>(
            () => client.FetchRulePackAsync("xbk_t", null, PhamViDuAn.Cua(9)));
        Assert.Contains("Không có quyền", loi.Message);
    }

    // ===== ETag tách theo dự án =====

    [Fact]
    public async Task Etag_dung_dung_pham_vi_thi_304_giu_cache_cua_chinh_du_an_do()
    {
        // Máy chủ tính ETag riêng cho từng dự án: chỉ ETag của đúng dự án mới được 304.
        var handler = new FakeHandler(req =>
            req.Headers.IfNoneMatch.ToString().Contains("v8-du-an-7") && req.RequestUri!.Query == "?project=7"
                ? new HttpResponseMessage(HttpStatusCode.NotModified)
                : Json(HttpStatusCode.OK, new { version = "v8", projectId = 7 }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json304, etag304) = await client.FetchRulePackAsync("xbk_t", "\"v8-du-an-7\"", PhamViDuAn.Cua(7));
        Assert.Null(json304);
        Assert.Equal("\"v8-du-an-7\"", etag304);

        // Cùng ETag đó gửi cho dự án khác thì KHÔNG được 304 — phải tải đủ bản của dự án 9.
        var (json9, _) = await client.FetchRulePackAsync("xbk_t", "\"v8-du-an-7\"", PhamViDuAn.Cua(9));
        Assert.NotNull(json9);
    }

    // ===== Khoá cache thuần (RulePackCache) =====

    [Fact]
    public void Moi_pham_vi_mot_tep_cache_rieng()
    {
        Assert.Equal("rule-pack.json", RulePackCache.TenTep(PhamViDuAn.ToanCuc));
        Assert.Equal("rule-pack.du-an-7.json", RulePackCache.TenTep(PhamViDuAn.Cua(7)));
        Assert.NotEqual(RulePackCache.TenTep(PhamViDuAn.Cua(7)), RulePackCache.TenTep(PhamViDuAn.Cua(9)));

        // ETag đi theo tệp cache, không dùng chung.
        Assert.Equal("rule-pack.json.etag", RulePackCache.TenTepEtag(PhamViDuAn.ToanCuc));
        Assert.Equal("rule-pack.du-an-7.json.etag", RulePackCache.TenTepEtag(PhamViDuAn.Cua(7)));
        Assert.NotEqual(RulePackCache.TenTepEtag(PhamViDuAn.Cua(7)), RulePackCache.TenTepEtag(PhamViDuAn.ToanCuc));
    }

    [Fact]
    public void Chua_biet_du_an_thi_khong_duoc_dat_ten_cache_va_khong_duoc_gui_etag()
    {
        Assert.False(PhamViDuAn.MayChuTuSuy.DaXacDinh);
        Assert.True(PhamViDuAn.ToanCuc.DaXacDinh);
        Assert.True(PhamViDuAn.Cua(7).DaXacDinh);
        Assert.Throws<InvalidOperationException>(() => RulePackCache.TenTep(PhamViDuAn.MayChuTuSuy));
    }

    [Fact]
    public void Pham_vi_cua_pack_theo_DAU_cua_may_chu_khong_theo_cai_ta_hoi()
    {
        // Máy chủ cũ (trước PR4) bỏ qua ?project= và trả bản toàn cục → phải cất vào ô toàn cục,
        // nếu không thì bản KHÔNG có mã BOQ lại nằm trong ô cache của dự án.
        Assert.Equal(PhamViDuAn.ToanCuc, RulePackCache.PhamViCuaPack(null));
        Assert.Equal(PhamViDuAn.Cua(7), RulePackCache.PhamViCuaPack(7));
        Assert.Equal(PhamViDuAn.ToanCuc, RulePackCache.PhamViCuaPack(0));
    }

    [Fact]
    public void Doi_du_an_ma_chua_tai_ve_thi_lui_ve_ban_toan_cuc_chu_khong_dung_pack_du_an_cu()
    {
        // Thà cột mã BOQ trống còn hơn in mã của dự án khác.
        Assert.Equal("rule-pack.du-an-7.json", RulePackCache.TenTepDangDung(7, coCacheDuAn: true));
        Assert.Equal("rule-pack.json", RulePackCache.TenTepDangDung(7, coCacheDuAn: false));
        Assert.Equal("rule-pack.json", RulePackCache.TenTepDangDung(null, coCacheDuAn: true));
    }

    [Fact]
    public void Chua_nho_du_an_thi_hoi_may_chu_tu_suy_nho_roi_thi_hoi_thang()
    {
        Assert.Equal(PhamViDuAn.MayChuTuSuy, RulePackCache.PhamViDeHoi(null));
        Assert.Equal(PhamViDuAn.Cua(4), RulePackCache.PhamViDeHoi(4));
    }

    // ===== Dấu dự án trong chính rule pack =====

    [Fact]
    public void Rule_pack_may_chu_tra_ve_mang_dau_projectId()
    {
        var goc = File.ReadAllText(RepoPaths.RulePackPath).TrimStart();
        Assert.StartsWith("{", goc);
        var theoDuAn = "{\"projectId\": 7," + goc[1..];

        Assert.Equal(7L, RulePackLoader.Load(theoDuAn).ProjectId!.Value);
        // Bản toàn cục không có field này → null, và pack cũ vẫn nạp được y như trước.
        Assert.Null(RepoPaths.LoadRulePack().ProjectId);
    }
}
