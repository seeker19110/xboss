using System.Text.Json;
using System.Text.Json.Nodes;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M103 §4 — phần THUẦN của lệnh <c>XBOSS_VE_DEXUAT</c>: quy tắc metadata theo loại block và
/// manifest "thư viện ứng viên" (manifest hiện hành + đúng 1 entry mới).
/// Dựng trên manifest MẪU THẬT trong repo (<c>doi-chung/block-lib-manifest-mau.json</c>) — cùng
/// tệp mà tầng máy chủ kiểm, nên trôi hợp đồng là đỏ ở đây.
/// </summary>
public class BlockDeXuatTests
{
    private const string ShaUngVien = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

    private static string JsonMau() =>
        File.ReadAllText(Path.Combine(RepoPaths.DoiChungDir, "block-lib-manifest-mau.json"));

    private static BlockManifest NapMau() => BlockManifestLoader.Load(JsonMau());

    /// <summary>Manifest ứng viên đã parse lại thành model (để soi từng entry cho gọn).</summary>
    private static BlockManifest UngVien(string jsonGoc, BlockDeXuat meta, IReadOnlyList<string> thuocTinh) =>
        BlockManifestLoader.Load(BlockUngVien.DungManifest(jsonGoc, meta, thuocTinh, ShaUngVien).ToJsonString());

    private static BlockDeXuat PhuKien() => new()
    {
        BlockName = "XB-DUCT-TE",
        Kind = BlockKind.Fitting,
        SystemId = "HVAC",
        TakeoffItemId = "duct-fitting",
        Note = "Tê ống gió 3 ngả",
    };

    // ===== Quy tắc metadata theo kind =====

    [Fact]
    public void PhuKien_du_he_va_item_thi_gui_duoc()
    {
        Assert.Null(BlockDeXuatRules.LyDoChuaGui(PhuKien(), []));
    }

    [Theory]
    [InlineData(BlockKind.Fitting)]
    [InlineData(BlockKind.Equipment)]
    [InlineData(BlockKind.Support)]
    [InlineData(BlockKind.Sleeve)]
    public void Thieu_he_hoac_item_thi_khoa_nut_gui(BlockKind kind)
    {
        var goc = PhuKien() with { Kind = kind };
        Assert.Contains("hệ", BlockDeXuatRules.LyDoChuaGui(goc with { SystemId = null }, [])!);
        Assert.Contains("item bóc tách", BlockDeXuatRules.LyDoChuaGui(goc with { TakeoffItemId = null }, [])!);
    }

    [Fact]
    public void KhungTen_can_kho_giay_va_khong_can_he_item()
    {
        var kt = new BlockDeXuat { BlockName = "XB-TB-A0", Kind = BlockKind.Titleblock };
        Assert.Contains("khổ giấy", BlockDeXuatRules.LyDoChuaGui(kt, [])!);
        Assert.Null(BlockDeXuatRules.LyDoChuaGui(kt with { PaperSize = "A0" }, []));

        // Hệ/item KHÔNG được điền cho khung tên (server chỉ nhận paper_size cho kind này).
        Assert.Contains("Khung tên", BlockDeXuatRules.LyDoChuaGui(kt with { PaperSize = "A0", SystemId = "HVAC" }, [])!);
        Assert.Contains("Khung tên", BlockDeXuatRules.LyDoChuaGui(kt with { PaperSize = "A0", TakeoffItemId = "x" }, [])!);
    }

    [Fact]
    public void Kho_giay_chi_danh_cho_khung_ten()
    {
        Assert.Contains("Khổ giấy", BlockDeXuatRules.LyDoChuaGui(PhuKien() with { PaperSize = "A1" }, [])!);
    }

    [Fact]
    public void Ten_rong_hoac_ky_tu_cam_bi_chan()
    {
        Assert.Contains("Chưa nhập tên", BlockDeXuatRules.LyDoChuaGui(PhuKien() with { BlockName = "  " }, [])!);
        Assert.Contains("ký tự", BlockDeXuatRules.LyDoChuaGui(PhuKien() with { BlockName = "XB/TE" }, [])!);
    }

    [Fact]
    public void Trung_ten_trong_manifest_bi_chan_ngay_tai_hop_thoai_khong_phan_biet_hoa_thuong()
    {
        var ten = NapMau().Blocks.Select(b => b.BlockName).ToList();
        var lyDo = BlockDeXuatRules.LyDoChuaGui(PhuKien() with { BlockName = "xb-duct-elbow" }, ten);
        Assert.Contains("đã có block tên", lyDo!);
    }

    // ===== Manifest ứng viên =====

    [Fact]
    public void Manifest_ung_vien_giu_nguyen_block_cu_va_them_dung_mot_entry()
    {
        var goc = NapMau();
        var moi = UngVien(JsonMau(), PhuKien(), []);

        Assert.Equal(goc.Blocks.Count + 1, moi.Blocks.Count);
        Assert.Equal(goc.Version, moi.Version);      // version mới do SERVER đặt lúc duyệt
        Assert.Equal(ShaUngVien, moi.DwgSha256);     // hash tệp .dwg ứng viên
        foreach (var cu in goc.Blocks)
            Assert.Contains(moi.Blocks, b => b.Id == cu.Id && b.BlockName == cu.BlockName && b.Kind == cu.Kind);

        var them = moi.Blocks[^1];
        Assert.Equal("XB-DUCT-TE", them.BlockName);
        Assert.Equal("fitting", them.Kind);
        Assert.Equal("HVAC", them.System);
        Assert.Equal("duct-fitting", them.TakeoffItemId);
        Assert.Null(them.Paper);
    }

    [Fact]
    public void Manifest_ung_vien_dat_id_khong_trung_id_da_co()
    {
        // Tên block khác nhưng slug trùng id "fcu-unit" đã có ⇒ phải tự thêm hậu tố.
        var moi = UngVien(JsonMau(), PhuKien() with { BlockName = "FCU unit" }, ["TAG"]);
        Assert.Equal("fcu-unit-2", moi.Blocks[^1].Id);
    }

    [Fact]
    public void Thiet_bi_thieu_TAG_thi_manifest_ung_vien_bi_tu_choi()
    {
        var loi = Assert.Throws<BlockManifestException>(() => UngVien(
            JsonMau(), PhuKien() with { BlockName = "XB-AHU-1", Kind = BlockKind.Equipment }, []));
        Assert.Contains("TAG", loi.Message);
    }

    [Fact]
    public void Khung_ten_thieu_attribute_thi_manifest_ung_vien_bi_tu_choi()
    {
        var loi = Assert.Throws<BlockManifestException>(() => UngVien(
            JsonMau(),
            new BlockDeXuat { BlockName = "XB-TB-A0", Kind = BlockKind.Titleblock, PaperSize = "A0" },
            []));
        Assert.Contains("attributes", loi.Message);
    }

    [Fact]
    public void Trung_ten_block_thi_manifest_ung_vien_khong_dung_duoc()
    {
        var loi = Assert.Throws<BlockManifestException>(() => UngVien(
            JsonMau(), PhuKien() with { BlockName = "XB-DUCT-ELBOW" }, []));
        Assert.Contains("đã được một mục khác dùng", loi.Message);
    }

    [Fact]
    public void Manifest_ung_vien_giu_nguyen_khoa_plugin_chua_model()
    {
        // M104 §1: entry manifest có thể mang fileKey/fileSha256/previewSvg (block thêm từ web).
        // Plugin không model các khóa này — nhưng ứng viên MẤT chúng là máy chủ từ chối
        // ("block bị sửa/mất fileKey so với thư viện hiện hành"), nên phải giữ nguyên cây JSON.
        var goc = JsonNode.Parse(JsonMau())!.AsObject();
        var entry = goc["blocks"]!.AsArray()[0]!.AsObject();
        entry["fileKey"] = "blocklib-abc123.dwg";
        entry["fileSha256"] = new string('a', 64);
        entry["previewSvg"] = "<svg/>";
        goc["khoaVersionSau"] = "giu-nguyen";

        var ungVien = BlockUngVien.DungManifest(goc.ToJsonString(), PhuKien(), [], ShaUngVien);

        var giuLai = ungVien["blocks"]!.AsArray()[0]!.AsObject();
        Assert.Equal("blocklib-abc123.dwg", (string?)giuLai["fileKey"]);
        Assert.Equal(new string('a', 64), (string?)giuLai["fileSha256"]);
        Assert.Equal("<svg/>", (string?)giuLai["previewSvg"]);
        Assert.Equal("giu-nguyen", (string?)ungVien["khoaVersionSau"]);
    }

    // ===== Đoán sẵn hệ / item =====

    [Fact]
    public void Doan_he_theo_layer_cua_khoi_theo_thu_tu_first_match()
    {
        var layerMap = new LayerMapSection
        {
            Groups =
            [
                new LayerGroup { Id = "HVAC", MatchAny = ["DUCT", "HVAC"] },
                new LayerGroup { Id = "PIPING", MatchAny = ["PIPE"] },
            ],
        };
        Assert.Equal("HVAC", BlockUngVien.DoanHeTheoLayer(layerMap, "M-DUCT-SUPP"));
        Assert.Equal("PIPING", BlockUngVien.DoanHeTheoLayer(layerMap, "P-PIPE-DOMW"));
        Assert.Null(BlockUngVien.DoanHeTheoLayer(layerMap, "A-WALL"));
        Assert.Null(BlockUngVien.DoanHeTheoLayer(layerMap, null));
    }

    [Fact]
    public void Doan_item_theo_ten_block_chi_lay_item_dem_duoc()
    {
        var takeoff = new TakeoffSection
        {
            Items =
            [
                new TakeoffItem { Id = "duct-len", Measure = "length", LayerMatchAny = ["DUCT"] },
                new TakeoffItem { Id = "fcu-unit", Measure = "count", BlockNameMatchAny = ["FCU"] },
            ],
        };
        Assert.Equal("fcu-unit", BlockUngVien.DoanItemTheoTenBlock(takeoff, "FCU-01"));
        Assert.Null(BlockUngVien.DoanItemTheoTenBlock(takeoff, "XB-DUCT-TE"));
    }

    // ===== Phần meta của multipart =====

    [Fact]
    public void MetaJson_du_khoa_theo_hop_dong_API()
    {
        var goc = NapMau();
        var goi = new DeXuatBlockGoi
        {
            Meta = PhuKien(),
            BaseLibVersion = goc.Version,
            CandidateManifest = BlockUngVien.DungManifest(JsonMau(), PhuKien(), [], ShaUngVien),
            Sha256 = ShaUngVien,
            CandidateDwg = [1, 2, 3],
            SidecarDxf = [4, 5],
        };

        using var doc = JsonDocument.Parse(goi.MetaJson());
        var root = doc.RootElement;
        Assert.Equal("XB-DUCT-TE", root.GetProperty("blockName").GetString());
        Assert.Equal("fitting", root.GetProperty("kind").GetString());
        Assert.Equal("HVAC", root.GetProperty("systemId").GetString());
        Assert.Equal("duct-fitting", root.GetProperty("takeoffItemId").GetString());
        Assert.Equal(goc.Version, root.GetProperty("baseLibVersion").GetString());
        Assert.Equal(ShaUngVien, root.GetProperty("sha256").GetString());
        Assert.Equal(ShaUngVien, root.GetProperty("candidateManifest").GetProperty("dwgSha256").GetString());
        Assert.Equal(goc.Blocks.Count + 1, root.GetProperty("candidateManifest").GetProperty("blocks").GetArrayLength());
        // Khóa không áp dụng cho kind này thì KHÔNG gửi (server phân biệt "không có" với "rỗng").
        Assert.False(root.TryGetProperty("paperSize", out _));
        // Máy chủ đọc "candidate_manifest" (snake_case, không có lối camelCase) — phải có cả hai.
        Assert.Equal(
            root.GetProperty("candidateManifest").GetRawText(),
            root.GetProperty("candidate_manifest").GetRawText());
    }

    [Fact]
    public void MetaJson_khung_ten_gui_kho_giay_khong_gui_he_item()
    {
        var goc = NapMau();
        var meta = new BlockDeXuat { BlockName = "XB-TB-A0", Kind = BlockKind.Titleblock, PaperSize = "A0" };
        var goi = new DeXuatBlockGoi
        {
            Meta = meta with { SystemId = "HVAC", TakeoffItemId = "fcu-unit" }, // rác từ form cũ
            BaseLibVersion = goc.Version,
            CandidateManifest = BlockUngVien.DungManifest(JsonMau(), meta, ["DU_AN"], ShaUngVien),
            Sha256 = ShaUngVien,
            CandidateDwg = [1],
            SidecarDxf = [2],
        };

        using var doc = JsonDocument.Parse(goi.MetaJson());
        var root = doc.RootElement;
        Assert.Equal("A0", root.GetProperty("paperSize").GetString());
        Assert.False(root.TryGetProperty("systemId", out _));
        Assert.False(root.TryGetProperty("takeoffItemId", out _));
    }
}
