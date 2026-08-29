using System.Net;
using System.Text;
using System.Text.Json;
using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Ui;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Thư viện block HAI TẦNG theo dự án (M113 §4/§6 — PR4 phía plugin):
/// client gửi/không gửi <c>?project=</c>, manifest đã trộn đọc được <c>nguon</c>/<c>libVersion</c>
/// và BỎ QUA AN TOÀN khi máy chủ bản cũ không trả hai trường đó, tệp lẻ hỏi đúng tầng, và bảng
/// điều khiển hiện version của cả hai bộ (FR6).
/// </summary>
public class BlockLibDuAnTests
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

    private const string ShaNen = "aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44";
    private const string ShaDuAn = "11aa22bb33cc44dd55ee66ff11aa22bb33cc44dd55ee66ff11aa22bb33cc44dd";

    private static HttpResponseMessage ManifestTron() =>
        Json(HttpStatusCode.OK, new
        {
            projectId = 7,
            version = "b3",
            dwgSha256 = ShaNen,
            boDuAn = new { version = "b1", dwgSha256 = ShaDuAn },
            manifest = new
            {
                version = "b1",
                dwgSha256 = ShaNen,
                blocks = new object[]
                {
                    new { id = "elbow-duct", blockName = "XB_ELBOW", kind = "fitting", nguon = "global", libVersion = "b3" },
                    new
                    {
                        id = "titleblock-a1", blockName = "XB_TITLE_A1", kind = "titleblock",
                        paper = "A1", attributes = new[] { "DU_AN" }, nguon = "project", libVersion = "b1",
                    },
                },
            },
        });

    // ===== Client: có/không gửi ?project= =====

    [Fact]
    public async Task Manifest_tron_gui_project_va_boc_duoc_bo_du_an()
    {
        var handler = new FakeHandler(_ => ManifestTron());
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, _, bo) = await client.FetchBlockLibManifestTronAsync("xbk_t", 7);

        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?project=7&manifest=1",
            handler.DaNhan[0].ToString());
        Assert.Contains("titleblock-a1", json);
        Assert.Equal("b1", bo!.Version);
        Assert.Equal(ShaDuAn, bo.DwgSha256);
    }

    [Fact]
    public async Task Duong_toan_cuc_KHONG_bao_gio_gan_project_giu_nguyen_luong_M103()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new
        {
            version = "b3",
            manifest = new { version = "b3", blocks = new[] { new { id = "elbow-duct" } } },
        }));
        var client = new XBossApiClient("https://xboss.local", handler);

        await client.FetchBlockLibManifestAsync("xbk_t");
        await client.FetchBlockLibDwgAsync("xbk_t");

        Assert.All(handler.DaNhan, u => Assert.DoesNotContain("project=", u.Query));
    }

    [Fact]
    public async Task Dwg_cua_bo_du_an_hoi_kem_project()
    {
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent([1, 2, 3]),
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        var (dwg, _) = await client.FetchBlockLibDwgDuAnAsync("xbk_t", 7);

        Assert.Equal(3, dwg!.Length);
        Assert.Equal("https://xboss.local/api/engineering/cad/block-lib?project=7", handler.DaNhan[0].ToString());
    }

    [Fact]
    public async Task Tep_le_hoi_dung_tang_libVersion_va_project()
    {
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent([9]),
        });
        var client = new XBossApiClient("https://xboss.local", handler);

        // Block của dự án: kèm cả libVersion lẫn project.
        await client.FetchBlockLibTepLeAsync("xbk_t", "blocklib-van-1.dwg", null, "b1", 7);
        // Block toàn cục trong CÙNG bản trộn: chỉ kèm libVersion, KHÔNG kèm project (máy chủ tìm
        // tệp lẻ trong đúng một tầng — gửi kèm dự án là 404).
        await client.FetchBlockLibTepLeAsync("xbk_t", "blocklib-van-2.dwg", null, "b3");

        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?file=blocklib-van-1.dwg&libVersion=b1&project=7",
            handler.DaNhan[0].ToString());
        Assert.Equal(
            "https://xboss.local/api/engineering/cad/block-lib?file=blocklib-van-2.dwg&libVersion=b3",
            handler.DaNhan[1].ToString());
    }

    [Fact]
    public async Task Manifest_tron_304_giu_cache()
    {
        var handler = new FakeHandler(_ => new HttpResponseMessage(HttpStatusCode.NotModified));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, etag, bo) = await client.FetchBlockLibManifestTronAsync("xbk_t", 7, "\"b3-b1\"");

        Assert.Null(json);
        Assert.Null(bo);
        Assert.Equal("\"b3-b1\"", etag);
    }

    [Fact]
    public async Task May_chu_khong_kem_boDuAn_thi_bo_qua_an_toan()
    {
        var handler = new FakeHandler(_ => Json(HttpStatusCode.OK, new
        {
            version = "b3",
            manifest = new { version = "b3", blocks = new[] { new { id = "elbow-duct" } } },
        }));
        var client = new XBossApiClient("https://xboss.local", handler);

        var (json, _, bo) = await client.FetchBlockLibManifestTronAsync("xbk_t", 7);

        Assert.NotNull(json);
        Assert.Null(bo); // dự án chưa có bộ riêng — không có tệp thứ hai nào để tải
    }

    // ===== Model manifest: nguon/libVersion =====

    [Fact]
    public void Manifest_tron_doc_duoc_nguon_va_libVersion()
    {
        var manifest = BlockManifestLoader.Load($$"""
        {
          "version": "b1",
          "dwgSha256": "{{ShaNen}}",
          "blocks": [
            {"id":"elbow-duct","blockName":"XB_ELBOW","kind":"fitting","nguon":"global","libVersion":"b3"},
            {"id":"titleblock-a1","blockName":"XB_TITLE_A1","kind":"titleblock","paper":"A1",
             "attributes":["DU_AN"],"nguon":"project","libVersion":"b1"}
          ]
        }
        """);

        var toanCuc = manifest.TimTheoId("elbow-duct")!;
        var cuaDuAn = manifest.TimTheoId("titleblock-a1")!;
        Assert.False(toanCuc.LaCuaDuAn);
        Assert.Equal("Toàn cục", toanCuc.NhanNguon);
        Assert.True(cuaDuAn.LaCuaDuAn);
        Assert.Equal("Dự án", cuaDuAn.NhanNguon);
        Assert.Equal("b1", cuaDuAn.LibVersion);
        Assert.True(manifest.CoBlockToanCuc);
        Assert.True(manifest.CoBlockDuAn);
    }

    [Fact]
    public void May_chu_ban_cu_khong_tra_nguon_thi_coi_nhu_toan_cuc()
    {
        var manifest = BlockManifestLoader.Load($$"""
        {"version":"b3","dwgSha256":"{{ShaNen}}",
         "blocks":[{"id":"elbow-duct","blockName":"XB_ELBOW","kind":"fitting"}]}
        """);

        var def = manifest.TimTheoId("elbow-duct")!;
        Assert.Null(def.Nguon);
        Assert.Null(def.LibVersion);
        Assert.False(def.LaCuaDuAn);
        Assert.True(manifest.CoBlockToanCuc);
        Assert.False(manifest.CoBlockDuAn); // không đòi tệp nền thứ hai — guardrail 1
    }

    // ===== Hash kiểm theo TỪNG bộ (§4.5) =====

    [Fact]
    public void Hash_theo_tung_bo_lech_la_tu_choi_thang()
    {
        var noiDung = "bo-du-an"u8.ToArray();
        var shaThat = BlockManifestLoader.TinhSha256(noiDung);

        BlockManifestLoader.KiemTraHashTepTheoSha("bộ riêng của dự án #7 (b1)", shaThat, noiDung);

        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTepTheoSha("bộ riêng của dự án #7 (b1)", ShaDuAn, noiDung));
        Assert.Contains("dự án #7", loi.Message);

        // Thiếu sha (máy chủ không kèm boDuAn) = không kiểm được ⇒ cũng từ chối, không "dùng tạm".
        Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTepTheoSha("bộ riêng của dự án #7", "", noiDung));
    }

    [Fact]
    public void Sieu_du_lieu_cache_tron_ghi_doc_lai_duoc()
    {
        var bo = new BoTronCache
        {
            DuAnId = 7,
            VersionToanCuc = "b3",
            VersionDuAn = "b1",
            DwgSha256DuAn = ShaDuAn,
        };

        var lai = BoTronCache.DocJson(bo.GhiJson())!;
        Assert.Equal(7, lai.DuAnId);
        Assert.Equal(ShaDuAn, lai.DwgSha256DuAn);
        Assert.Equal("toàn cục b3 + dự án #7 b1", lai.MoTaHaiBo);
        Assert.Null(BoTronCache.DocJson("{khong-phai-json"));
    }

    // ===== FR6: bảng điều khiển hiện version cả hai bộ =====

    [Fact]
    public void Bang_dieu_khien_hien_version_ca_hai_bo()
    {
        var khoi = BangDieuKhienModel.Dung(new TrangThaiPhien
        {
            ThuVienVersion = "b1",
            SoBlockThuVien = 12,
            ThuVienHaiBo = "toàn cục b3 + dự án #7 b1",
            SoBlockDuAn = 2,
        }).Single(k => k.TieuDe == "Thư viện block");

        var dong = khoi.Dong.Single(d => d.Muc == "Bộ đang dùng");
        Assert.Contains("toàn cục b3 + dự án #7 b1", dong.NoiDung);
        Assert.Contains("2 block của dự án", dong.NoiDung);
    }

    [Fact]
    public void Chua_dung_ban_tron_thi_bang_dieu_khien_giu_nguyen_nhu_truoc()
    {
        var khoi = BangDieuKhienModel.Dung(new TrangThaiPhien
        {
            ThuVienVersion = "b3",
            SoBlockThuVien = 10,
        }).Single(k => k.TieuDe == "Thư viện block");

        Assert.DoesNotContain(khoi.Dong, d => d.Muc == "Bộ đang dùng");
    }

    [Fact]
    public void Doc_cache_tron_bien_loi_quyen_doc_thanh_thong_diep_tieng_viet()
    {
        var pluginDir = Directory.GetParent(RepoPaths.DoiChungDir)!.FullName;
        var service = File.ReadAllText(Path.Combine(
            pluginDir, "XBoss.Cad.Acad", "Services", "BlockLibraryService.cs"));
        var batDau = service.IndexOf("private static (BlockManifest? Manifest, string? Loi) DocCacheTron", StringComparison.Ordinal);
        var ketThuc = service.IndexOf("private static string MoTaBoDuAn", batDau, StringComparison.Ordinal);
        Assert.True(batDau >= 0 && ketThuc > batDau);
        var thanHam = service[batDau..ketThuc];

        Assert.Contains("catch (UnauthorizedAccessException e)", thanHam, StringComparison.Ordinal);
        Assert.Contains("Không có quyền đọc thư viện block bản trộn trong cache", thanHam, StringComparison.Ordinal);
    }
}
