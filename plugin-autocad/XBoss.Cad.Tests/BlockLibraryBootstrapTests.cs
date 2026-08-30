using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>Thư viện MEPF đóng kèm plugin chỉ là bootstrap offline, không được ghi đè cache server.</summary>
public sealed class BlockLibraryBootstrapTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"xboss-block-bootstrap-{Guid.NewGuid():N}");

    public BlockLibraryBootstrapTests() => Directory.CreateDirectory(_root);

    [Fact]
    public void Seed_khi_cache_chua_ton_tai_va_hash_asset_hop_le()
    {
        var source = Path.Combine(_root, "source");
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(source);
        var dwg = "AC1032-thu-vien-mepf"u8.ToArray();
        File.WriteAllBytes(Path.Combine(source, "blocks.dwg"), dwg);
        File.WriteAllText(Path.Combine(source, "manifest.json"), Manifest(BlockManifestLoader.TinhSha256(dwg)));

        var seeded = BlockLibraryBootstrap.SeedIfAbsent(source, cache);

        Assert.True(seeded);
        Assert.Equal(dwg, File.ReadAllBytes(Path.Combine(cache, "blocks.dwg")));
        var manifest = BlockManifestLoader.Load(File.ReadAllText(Path.Combine(cache, "manifest.json")));
        BlockManifestLoader.KiemTraHashTep(manifest, Path.Combine(cache, "blocks.dwg"));
    }

    [Fact]
    public void Khong_ghi_de_cache_da_co_du_chi_asset_dong_goi_moi_hon()
    {
        var source = Path.Combine(_root, "source");
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(source);
        Directory.CreateDirectory(cache);
        File.WriteAllBytes(Path.Combine(source, "blocks.dwg"), "asset-moi"u8.ToArray());
        File.WriteAllText(Path.Combine(source, "manifest.json"), Manifest(BlockManifestLoader.TinhSha256("asset-moi"u8.ToArray())));
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), "cache-server"u8.ToArray());
        File.WriteAllText(Path.Combine(cache, "manifest.json"), "manifest-server");

        var seeded = BlockLibraryBootstrap.SeedIfAbsent(source, cache);

        Assert.False(seeded);
        Assert.Equal("cache-server", File.ReadAllText(Path.Combine(cache, "blocks.dwg")));
        Assert.Equal("manifest-server", File.ReadAllText(Path.Combine(cache, "manifest.json")));
    }

    [Fact]
    public async Task Cho_writer_dang_giu_khoa_va_khong_tron_cap_cache_cua_writer()
    {
        var source = Path.Combine(_root, "source");
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(source);
        var asset = "asset-dong-goi"u8.ToArray();
        File.WriteAllBytes(Path.Combine(source, "blocks.dwg"), asset);
        File.WriteAllText(Path.Combine(source, "manifest.json"), Manifest(BlockManifestLoader.TinhSha256(asset)));

        var khoa = BlockLibraryBootstrap.AcquireCacheLock(cache);
        var seedTask = Task.Run(() => BlockLibraryBootstrap.SeedIfAbsent(source, cache));
        await Task.Delay(100);
        Assert.False(seedTask.IsCompleted);

        var serverDwg = "cache-server"u8.ToArray();
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), serverDwg);
        File.WriteAllText(Path.Combine(cache, "manifest.json"), Manifest(BlockManifestLoader.TinhSha256(serverDwg)));
        khoa.Dispose();

        Assert.False(await seedTask);
        Assert.Equal(serverDwg, File.ReadAllBytes(Path.Combine(cache, "blocks.dwg")));
        var manifest = BlockManifestLoader.Load(File.ReadAllText(Path.Combine(cache, "manifest.json")));
        BlockManifestLoader.KiemTraHashTep(manifest, serverDwg);
    }

    [Fact]
    public void Ghi_de_cache_va_khoi_phuc_cap_da_commit_sau_giao_dich_ke_tiep_bi_ngat()
    {
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(cache);
        var oldDwg = "cache-cu"u8.ToArray();
        var oldManifest = Manifest(BlockManifestLoader.TinhSha256(oldDwg));
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), oldDwg);
        File.WriteAllText(Path.Combine(cache, "manifest.json"), oldManifest);

        var newDwg = "cache-moi"u8.ToArray();
        var newManifest = Manifest(BlockManifestLoader.TinhSha256(newDwg));
        BlockLibraryBootstrap.WriteCachePair(cache, newManifest, newDwg, overwrite: true);
        BlockManifestLoader.KiemTraHashTep(
            BlockManifestLoader.Load(File.ReadAllText(Path.Combine(cache, "manifest.json"))),
            Path.Combine(cache, "blocks.dwg"));

        // Sau lần old→new đã commit, mô phỏng GIAO DỊCH KẾ TIẾP chết sau khi publish DWG:
        // backup của giao dịch đó chính là cặp new đang dùng và phải được phục hồi nguyên cặp.
        File.Copy(Path.Combine(cache, "blocks.dwg"), Path.Combine(cache, ".cache-write.dwg.bak"), true);
        File.Copy(Path.Combine(cache, "manifest.json"), Path.Combine(cache, ".cache-write.manifest.bak"), true);
        File.WriteAllText(Path.Combine(cache, ".cache-write.pending"), "11");
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), "tep-bi-cat-doan"u8.ToArray());

        using (BlockLibraryBootstrap.AcquireCacheLock(cache)) { }

        Assert.Equal(newDwg, File.ReadAllBytes(Path.Combine(cache, "blocks.dwg")));
        Assert.Equal(newManifest, File.ReadAllText(Path.Combine(cache, "manifest.json")));
        Assert.False(File.Exists(Path.Combine(cache, ".cache-write.pending")));
    }

    [Fact]
    public void Journal_hong_khong_khoa_vinh_vien_cache_live_van_hop_le()
    {
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(cache);
        var dwg = "cache-hop-le"u8.ToArray();
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), dwg);
        File.WriteAllText(
            Path.Combine(cache, "manifest.json"), Manifest(BlockManifestLoader.TinhSha256(dwg)));
        File.WriteAllBytes(Path.Combine(cache, ".cache-write.pending"), []);

        using (BlockLibraryBootstrap.AcquireCacheLock(cache)) { }

        Assert.False(File.Exists(Path.Combine(cache, ".cache-write.pending")));
        BlockManifestLoader.KiemTraHashTep(
            BlockManifestLoader.Load(File.ReadAllText(Path.Combine(cache, "manifest.json"))),
            Path.Combine(cache, "blocks.dwg"));
    }

    [Fact]
    public void Journal_hop_le_nhung_thieu_backup_khong_chan_duong_nap_lai_cache()
    {
        var cache = Path.Combine(_root, "cache");
        Directory.CreateDirectory(cache);
        File.WriteAllBytes(Path.Combine(cache, "blocks.dwg"), "tep-dang-do"u8.ToArray());
        File.WriteAllText(Path.Combine(cache, ".cache-write.pending"), "10");

        using (BlockLibraryBootstrap.AcquireCacheLock(cache)) { }

        Assert.False(File.Exists(Path.Combine(cache, ".cache-write.pending")));
        // Cache có thể vẫn hỏng, nhưng writer sau phải lấy được khóa để XBOSS_LOGIN/nạp tay sửa nó.
        using (BlockLibraryBootstrap.AcquireCacheLock(cache)) { }
    }

    [Fact]
    public void Asset_mepf_dong_goi_khop_hash_va_khai_dung_block_that()
    {
        var pluginDir = Directory.GetParent(RepoPaths.DoiChungDir)!.FullName;
        var assetDir = Path.Combine(pluginDir, "block-library");
        var manifest = BlockManifestLoader.Load(
            File.ReadAllText(Path.Combine(assetDir, BlockLibraryBootstrap.ManifestFileName)));

        BlockManifestLoader.KiemTraHashTep(
            manifest, Path.Combine(assetDir, BlockLibraryBootstrap.DwgFileName));
        Assert.Equal("mepf-offline-v1", manifest.Version);
        Assert.Equal(12, manifest.Blocks.Count);
        Assert.Equal("0-M-H-ELBOW-90", manifest.TimTheoId("elbow-duct")?.BlockName);
        Assert.Equal("0-M-F-TEE", manifest.TimTheoId("tee-duct")?.BlockName);
        Assert.Equal(BlockKind.Support, manifest.TimTheoId("support-pipe")?.KindEnum);
        Assert.Equal("SLOPE%-STRO", manifest.TimTheoId(BlockManifest.IdMuiTenDoDoc)?.BlockName);
        Assert.Empty(manifest.TheoLoai(BlockKind.Equipment));
        Assert.Empty(manifest.TheoLoai(BlockKind.Titleblock));
    }

    [Fact]
    public void Script_dong_goi_chep_ca_manifest_va_dwg_vao_bundle()
    {
        var pluginDir = Directory.GetParent(RepoPaths.DoiChungDir)!.FullName;
        var script = File.ReadAllText(Path.Combine(pluginDir, "dong-goi.ps1"));

        Assert.Contains("block-library", script, StringComparison.Ordinal);
        Assert.Contains("BlockLibrary", script, StringComparison.Ordinal);
        Assert.Contains("manifest.json", script, StringComparison.Ordinal);
        Assert.Contains("blocks.dwg", script, StringComparison.Ordinal);
    }

    [Fact]
    public void Ghi_tep_nguyen_tu_thay_noi_dung_va_khong_de_lai_tep_tam()
    {
        var path = Path.Combine(_root, "cache", "blocks-tron-duan.dwg");

        BlockLibraryBootstrap.WriteAtomicFile(path, "lan-mot"u8.ToArray());
        BlockLibraryBootstrap.WriteAtomicFile(path, "lan-hai"u8.ToArray());

        Assert.Equal("lan-hai", File.ReadAllText(path));
        Assert.Empty(Directory.GetFiles(Path.GetDirectoryName(path)!, "*.write-*"));
    }

    [Fact]
    public void Cache_tron_M113_dung_cung_khoa_va_ghi_nguyen_tu()
    {
        var pluginDir = Directory.GetParent(RepoPaths.DoiChungDir)!.FullName;
        var service = File.ReadAllText(Path.Combine(
            pluginDir, "XBoss.Cad.Acad", "Services", "BlockLibraryService.cs"));
        var batDau = service.IndexOf("private static void GhiCacheTron(", StringComparison.Ordinal);
        var ketThuc = service.IndexOf("internal static async Task<(bool ThanhCong", batDau, StringComparison.Ordinal);
        Assert.True(batDau >= 0 && ketThuc > batDau);
        var thanHam = service[batDau..ketThuc];

        Assert.Contains("BlockLibraryBootstrap.AcquireCacheLock(ThuMucCache)", thanHam, StringComparison.Ordinal);
        Assert.Contains("BlockLibraryBootstrap.PublishCacheSet", thanHam, StringComparison.Ordinal);
        Assert.DoesNotContain("File.WriteAllBytes(DwgTron", thanHam, StringComparison.Ordinal);
    }

    [Fact]
    public void Cache_set_phuc_hoi_toan_bo_snapshot_cu_khi_crash_giua_luc_publish()
    {
        var cache = Path.Combine(_root, "cache-set");
        Directory.CreateDirectory(cache);
        File.WriteAllText(Path.Combine(cache, "global.dwg"), "global-cu");
        File.WriteAllText(Path.Combine(cache, "project.dwg"), "project-cu");
        File.WriteAllText(Path.Combine(cache, "manifest.json"), "manifest-cu");
        File.WriteAllText(Path.Combine(cache, "meta.json"), "meta-cu");

        using (BlockLibraryBootstrap.AcquireCacheLock(cache))
        {
            Assert.Throws<InvalidOperationException>(() => BlockLibraryBootstrap.PublishCacheSet(
                cache,
                "mixed",
                [
                    new("global.dwg", "global-moi"u8.ToArray()),
                    new("project.dwg", "project-moi"u8.ToArray()),
                    new("manifest.json", "manifest-moi"u8.ToArray()),
                    new("meta.json", "meta-moi"u8.ToArray()),
                ],
                commitFileName: "meta.json",
                afterPublish: soTep =>
                {
                    if (soTep == 1) throw new InvalidOperationException("mo-phong-crash");
                }));
        }

        Assert.Equal("global-moi", File.ReadAllText(Path.Combine(cache, "global.dwg")));
        Assert.True(Directory.GetFiles(cache, ".cache-set-*.pending").Length == 1);

        // Lần lấy khóa kế tiếp mô phỏng process mới sau crash: phải phục hồi NGUYÊN snapshot cũ.
        using (BlockLibraryBootstrap.AcquireCacheLock(cache)) { }

        Assert.Equal("global-cu", File.ReadAllText(Path.Combine(cache, "global.dwg")));
        Assert.Equal("project-cu", File.ReadAllText(Path.Combine(cache, "project.dwg")));
        Assert.Equal("manifest-cu", File.ReadAllText(Path.Combine(cache, "manifest.json")));
        Assert.Equal("meta-cu", File.ReadAllText(Path.Combine(cache, "meta.json")));
        Assert.Empty(Directory.GetFiles(cache, ".cache-set-*"));
    }

    private static string Manifest(string sha256) => $$"""
        {
          "version": "mepf-test",
          "dwgSha256": "{{sha256}}",
          "blocks": [
            { "id": "elbow-duct", "blockName": "ELBOW", "kind": "fitting", "system": "HVAC" }
          ]
        }
        """;

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }
}
