using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR2 — manifest thư viện block. Nạp manifest MẪU THẬT trong repo
/// (plugin-autocad/doi-chung/) để tầng 2 (plugin) và tầng 3 (máy chủ, tests/cad-block-lib.test.ts)
/// kiểm cùng một tệp — cùng triết lý chống trôi của bộ đối chứng M99.
/// </summary>
public class BlockManifestTests
{
    private static string ManifestMauPath =>
        Path.Combine(RepoPaths.DoiChungDir, "block-lib-manifest-mau.json");

    /// <summary>Nội dung tệp .dwg mẫu — hash của nó phải khớp dwgSha256 trong manifest mẫu.</summary>
    private static byte[] DwgMau() =>
        File.ReadAllBytes(Path.Combine(RepoPaths.DoiChungDir, "block-lib-mau.dwg.txt"));

    private static BlockManifest NapMau() => BlockManifestLoader.Load(File.ReadAllText(ManifestMauPath));

    [Fact]
    public void Nap_duoc_manifest_mau_tu_repo()
    {
        var m = NapMau();
        Assert.Equal("b0-mau", m.Version);
        Assert.Equal(5, m.Blocks.Count);
        Assert.Equal(BlockKind.Fitting, m.TimTheoId("elbow-duct")!.KindEnum);
        Assert.True(m.TimTheoId("elbow-duct")!.RotateToPath);
        Assert.Equal("A1", m.TimTheoId("titleblock-a1")!.Paper);
        Assert.Single(m.TheoLoai(BlockKind.Titleblock));
        Assert.Single(m.TheoLoai(BlockKind.Support));
        Assert.Single(m.TheoLoai(BlockKind.Sleeve));
    }

    [Fact]
    public void Hash_khop_tep_dwg_mau()
    {
        var m = NapMau();
        BlockManifestLoader.KiemTraHashTep(m, DwgMau()); // không ném là đạt
    }

    [Fact]
    public void Tu_choi_khi_hash_tep_lech()
    {
        var m = NapMau();
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTep(m, "tệp đã bị tráo"u8.ToArray()));
        Assert.Contains("không khớp manifest", loi.Message);
    }

    [Fact]
    public void Tu_choi_khi_thieu_tep_cache()
    {
        var m = NapMau();
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTep(m, Path.Combine(Path.GetTempPath(), "khong-ton-tai-xboss.dwg")));
        Assert.Contains("Không thấy tệp", loi.Message);
    }

    [Fact]
    public void Tu_choi_kind_la()
    {
        var json = File.ReadAllText(ManifestMauPath).Replace("\"kind\": \"fitting\"", "\"kind\": \"phu-kien\"");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("kind lạ", loi.Message);
    }

    [Fact]
    public void Tu_choi_thiet_bi_thieu_thuoc_tinh_TAG()
    {
        var json = File.ReadAllText(ManifestMauPath)
            .Replace("[\"TAG\", \"MODEL\", \"SIZE\"]", "[\"MODEL\", \"SIZE\"]");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("TAG", loi.Message);
    }

    [Fact]
    public void Tu_choi_khung_ten_thieu_kho_giay()
    {
        var json = File.ReadAllText(ManifestMauPath).Replace("\"paper\": \"A1\",", "");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("paper", loi.Message);
    }

    [Fact]
    public void Tu_choi_hai_muc_trung_ten_block_chi_khac_hoa_thuong()
    {
        var json = File.ReadAllText(ManifestMauPath).Replace("\"XB-SUP-DUCT\"", "\"xb-duct-elbow\"");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("hoa thường", loi.Message);
    }

    [Fact]
    public void Tu_choi_dwgSha256_khong_phai_hex_64()
    {
        var m = NapMau();
        var json = File.ReadAllText(ManifestMauPath).Replace(m.DwgSha256, "abc123");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("dwgSha256", loi.Message);
    }

    [Fact]
    public void Tu_choi_json_hong_voi_thong_diep_tieng_viet()
    {
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load("{ hong"));
        Assert.Contains("JSON", loi.Message);
    }

    [Fact]
    public void Bo_qua_field_khong_biet_de_manifest_ve_sau_mo_rong_thuan()
    {
        var json = File.ReadAllText(ManifestMauPath)
            .Replace("\"version\": \"b0-mau\",", "\"version\": \"b0-mau\", \"khoaTuongLai\": { \"x\": 1 },");
        Assert.Equal("b0-mau", BlockManifestLoader.Load(json).Version);
    }

    /// <summary>
    /// Chống trôi tên giữa manifest ↔ takeoff (M100 §18 rủi ro số 1): mọi block kind=equipment khai
    /// takeoffItemId phải trỏ tới item measure=count của rule pack THẬT, và tên block phải khớp
    /// blockNameMatchAny của item đó theo đúng bộ khớp token-boundary dùng chung.
    /// </summary>
    [Fact]
    public void Thiet_bi_trong_manifest_mau_khop_takeoff_cua_rule_pack_that()
    {
        var manifest = NapMau();
        var pack = RepoPaths.LoadRulePack();

        var thietBi = manifest.TheoLoai(BlockKind.Equipment).ToList();
        Assert.NotEmpty(thietBi);
        foreach (var b in thietBi)
        {
            Assert.False(string.IsNullOrWhiteSpace(b.TakeoffItemId), $"Block {b.Id} thiếu takeoffItemId");
            var item = pack.Takeoff.Items.FirstOrDefault(i => i.Id == b.TakeoffItemId);
            Assert.NotNull(item);
            Assert.Equal(TakeoffMeasure.Count, item!.MeasureKind);
            Assert.NotNull(item.BlockNameMatchAny);
            Assert.True(
                TokenMatcher.MatchesAny(b.BlockName, item.BlockNameMatchAny!),
                $"Tên block {b.BlockName} không khớp blockNameMatchAny của item {item.Id}");
        }
    }

    // ===== M100 PR4 — tra block thiết bị từ id rule pack (XBOSS_VE_THIETBI) =====

    [Fact]
    public void Tim_thiet_bi_theo_id_item_takeoff_cua_rule_pack()
    {
        var m = NapMau();

        // v4 khai equipment: ["fcu-unit", …]; manifest mẫu trỏ ngược lại bằng takeoffItemId.
        var fcu = m.TimThietBiTheoItem("fcu-unit");
        Assert.NotNull(fcu);
        Assert.Equal("FCU", fcu!.BlockName);
        Assert.Equal(BlockKind.Equipment, fcu.KindEnum);

        // Thiết bị chưa có trong thư viện → null (lệnh vẽ báo "thư viện chưa có", không chèn bừa).
        Assert.Null(m.TimThietBiTheoItem("ahu-unit"));
        // Không nhận nhầm block khác loại dù trùng id.
        Assert.Null(m.TimThietBiTheoItem("elbow-duct"));
        Assert.Null(m.TimThietBiTheoItem("titleblock-a1"));
    }

    // ===== M104 §1 — thư viện ĐA TỆP: entry có tệp .dwg riêng (block thêm thẳng từ web) =====

    /// <summary>Nội dung tệp .dwg lẻ giả lập của một block thêm từ web.</summary>
    private static byte[] TepLeMau() => "AC1032-tep-block-them-tu-web"u8.ToArray();

    /// <summary>
    /// Manifest đa tệp: 1 block ở tệp nền (không fileKey) + 1 block ở tệp riêng (có fileKey,
    /// fileSha256 và previewSvg — khóa mà plugin CỐ Ý không model).
    /// </summary>
    private static string ManifestDaTep(
        string? fileKey = "blocklib-van-web-1756000000-ab12cd.dwg", string? fileSha256 = null) =>
        $$"""
        {
          "version": "b9-datep",
          "dwgSha256": "{{new string('a', 64)}}",
          "blocks": [
            { "id": "elbow-duct", "blockName": "XB-DUCT-ELBOW", "kind": "fitting", "system": "duct" },
            { "id": "van-web", "blockName": "XB-VAN-WEB", "kind": "fitting", "system": "pipe",
              {{(fileKey is null ? "" : $"\"fileKey\": \"{fileKey}\",")}}
              "fileSha256": "{{fileSha256 ?? BlockManifestLoader.TinhSha256(TepLeMau())}}",
              "previewSvg": "<svg viewBox=\"0 0 10 10\"><path d=\"M0 0\"/></svg>" }
          ]
        }
        """;

    [Fact]
    public void Nap_duoc_manifest_co_fileKey_va_bo_qua_previewSvg()
    {
        var m = BlockManifestLoader.Load(ManifestDaTep());

        var nen = m.TimTheoId("elbow-duct")!;
        Assert.False(nen.CoTepRieng);
        Assert.Null(nen.FileKey);

        var web = m.TimTheoId("van-web")!;
        Assert.True(web.CoTepRieng);
        Assert.Equal("blocklib-van-web-1756000000-ab12cd.dwg", web.FileKey);
        Assert.Equal(BlockManifestLoader.TinhSha256(TepLeMau()), web.FileSha256);
        Assert.Equal(["van-web"], m.TepRieng().Select(b => b.Id));
    }

    /// <summary>Tương thích ngược: manifest phát hành trước M104 không có block nào ở tệp riêng.</summary>
    [Fact]
    public void Manifest_cu_khong_khai_fileKey_thi_khong_co_tep_rieng_nao()
    {
        var m = NapMau();
        Assert.Empty(m.TepRieng());
        Assert.All(m.Blocks, b =>
        {
            Assert.False(b.CoTepRieng);
            Assert.Null(b.FileKey);
            Assert.Null(b.FileSha256);
        });
    }

    [Fact]
    public void Tu_choi_fileKey_thieu_fileSha256()
    {
        var json = ManifestDaTep().Replace($"\"fileSha256\": \"{BlockManifestLoader.TinhSha256(TepLeMau())}\",", "");
        var loi = Assert.Throws<BlockManifestException>(() => BlockManifestLoader.Load(json));
        Assert.Contains("fileSha256", loi.Message);
    }

    [Fact]
    public void Tu_choi_fileSha256_thieu_fileKey()
    {
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.Load(ManifestDaTep(fileKey: null)));
        Assert.Contains("fileKey", loi.Message);
    }

    /// <summary>
    /// fileKey biến thành TÊN TỆP trong cache — khoá mang đường dẫn phải bị chặn ngay lúc nạp
    /// manifest, không đợi tới lúc ghi tệp.
    /// </summary>
    [Theory]
    [InlineData("../../blocks.dwg")]
    [InlineData("..\\\\..\\\\blocks.dwg")]
    [InlineData("thu muc/blocklib-x.dwg")]
    [InlineData("..")]
    public void Tu_choi_fileKey_mang_duong_dan(string khoaXau)
    {
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.Load(ManifestDaTep(fileKey: khoaXau)));
        Assert.Contains("fileKey", loi.Message);
    }

    [Theory]
    [InlineData("blocklib-van-1756-ab.dwg", true)]
    [InlineData("bat-ky-ten-nao.dwg", true)] // không ràng tiền tố của máy chủ hôm nay
    [InlineData("", false)]
    [InlineData(".", false)]
    [InlineData("..", false)]
    [InlineData("a/b.dwg", false)]
    [InlineData("a\\b.dwg", false)]
    [InlineData("tep lạ.dwg", false)]
    public void Khoa_tep_chi_nhan_ten_tep_thuan(string khoa, bool hopLe) =>
        Assert.Equal(hopLe, BlockManifestLoader.LaKhoaTepHopLe(khoa));

    [Fact]
    public void Hash_tep_le_khop_thi_nhan()
    {
        var web = BlockManifestLoader.Load(ManifestDaTep()).TimTheoId("van-web")!;
        BlockManifestLoader.KiemTraHashTepLe(web, TepLeMau()); // không ném là đạt
    }

    [Fact]
    public void Tu_choi_khi_hash_tep_le_lech()
    {
        var web = BlockManifestLoader.Load(ManifestDaTep()).TimTheoId("van-web")!;
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTepLe(web, "tệp lẻ đã bị tráo"u8.ToArray()));
        Assert.Contains("XB-VAN-WEB", loi.Message);
        Assert.Contains("không khớp manifest", loi.Message);
    }

    [Fact]
    public void Tu_choi_khi_thieu_tep_le_trong_cache()
    {
        var web = BlockManifestLoader.Load(ManifestDaTep()).TimTheoId("van-web")!;
        var loi = Assert.Throws<BlockManifestException>(
            () => BlockManifestLoader.KiemTraHashTepLe(web, Path.Combine(Path.GetTempPath(), "khong-co-xboss-le.dwg")));
        Assert.Contains("Không thấy tệp block", loi.Message);
    }

    /// <summary>Block ở tệp nền không có gì để đối chiếu — gọi nhầm phải ném, không "đạt" im lặng.</summary>
    [Fact]
    public void Kiem_hash_tep_le_tren_block_o_tep_nen_thi_nem()
    {
        var nen = BlockManifestLoader.Load(ManifestDaTep()).TimTheoId("elbow-duct")!;
        Assert.Throws<BlockManifestException>(() => BlockManifestLoader.KiemTraHashTepLe(nen, TepLeMau()));
    }

    [Fact]
    public void Tim_thiet_bi_uu_tien_takeoffItemId_hon_id_manifest()
    {
        var m = BlockManifestLoader.Load("""
            {
              "version": "b-thu",
              "dwgSha256": "0000000000000000000000000000000000000000000000000000000000000000",
              "blocks": [
                { "id": "fcu-unit", "blockName": "FCU-CU", "kind": "equipment", "attributes": ["TAG"] },
                { "id": "fcu-moi", "blockName": "FCU", "kind": "equipment", "attributes": ["TAG"],
                  "takeoffItemId": "fcu-unit" }
              ]
            }
            """);

        // Trùng id manifest thua block trỏ đúng item takeoff — đó mới là block XBOSS_BOCKL đếm.
        Assert.Equal("fcu-moi", m.TimThietBiTheoItem("fcu-unit")!.Id);
    }
}
