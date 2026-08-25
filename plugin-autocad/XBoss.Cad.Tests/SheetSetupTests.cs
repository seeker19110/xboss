using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR6 — luật đặt tên layout/mặt cắt, quy đổi tỉ lệ viewport (AC10) và tra khung tên trong
/// manifest thư viện (§15). Adapter chỉ gọi API AutoCAD, mọi luật bị kẹp ở đây.
/// </summary>
public class SheetSetupTests
{
    // ===== Tỉ lệ viewport (AC10) =====

    [Fact]
    public void AC10_ti_le_1_50_tren_ban_ve_mm_cho_1000mm_mo_hinh_bang_20mm_giay()
    {
        var tiLe = SheetSetup.TiLeViewport(50, 1.0);

        Assert.Equal(0.02, tiLe, 12);
        Assert.Equal(20, 1000 * tiLe, 9); // 1000mm mô hình = 20mm giấy
    }

    [Fact]
    public void Ban_ve_don_vi_met_van_ra_dung_ti_le_giay()
    {
        Assert.Equal(20, SheetSetup.TiLeViewport(50, 1000.0), 9);
        Assert.Equal(10, SheetSetup.TiLeViewport(100, 1000.0), 9);
    }

    [Fact]
    public void Ti_le_hoac_don_vi_khong_hop_le_thi_nem_loi()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SheetSetup.TiLeViewport(0, 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => SheetSetup.TiLeViewport(50, 0));
    }

    // ===== Tên layout =====

    [Fact]
    public void Layout_dau_tien_cua_he_danh_so_01()
    {
        Assert.Equal(
            "SHOP-HVAC-01",
            SheetSetup.TenLayoutKeTiep("SHOP-{system}-{seq}", "HVAC", ["Model", "Layout1"]));
    }

    [Fact]
    public void Layout_ke_tiep_lay_so_lon_nhat_cong_mot_khong_phan_biet_hoa_thuong()
    {
        var ten = SheetSetup.TenLayoutKeTiep(
            "SHOP-{system}-{seq}", "HVAC", ["SHOP-HVAC-01", "shop-hvac-07", "SHOP-PIPING-09"]);

        Assert.Equal("SHOP-HVAC-08", ten);
    }

    [Fact]
    public void Layout_cua_he_khac_khong_lam_nhay_so_cua_he_dang_in()
    {
        Assert.Equal(
            "SHOP-PIPING-01",
            SheetSetup.TenLayoutKeTiep("SHOP-{system}-{seq}", "PIPING", ["SHOP-HVAC-12"]));
    }

    [Fact]
    public void Pattern_khong_co_seq_thi_them_hau_to_khi_trung_ten()
    {
        Assert.Equal("SHOP-HVAC", SheetSetup.TenLayoutKeTiep("SHOP-{system}", "HVAC", []));
        Assert.Equal("SHOP-HVAC-2", SheetSetup.TenLayoutKeTiep("SHOP-{system}", "HVAC", ["shop-hvac"]));
    }

    // ===== Tên mặt cắt =====

    [Fact]
    public void Mat_cat_dau_tien_la_A_A_roi_B_B()
    {
        Assert.Equal("A-A", SheetSetup.TenMatCatKeTiep("{alpha}-{alpha}", []));
        Assert.Equal("B-B", SheetSetup.TenMatCatKeTiep("{alpha}-{alpha}", ["A-A"]));
        Assert.Equal("C-C", SheetSetup.TenMatCatKeTiep("{alpha}-{alpha}", ["B-B", "a-a"]));
    }

    [Fact]
    public void Het_chu_cai_thi_chuyen_sang_AA()
    {
        var daDung = Enumerable.Range(0, 26).Select(i => $"{(char)('A' + i)}-{(char)('A' + i)}").ToList();

        Assert.Equal("AA-AA", SheetSetup.TenMatCatKeTiep("{alpha}-{alpha}", daDung));
    }

    [Fact]
    public void Ten_da_dung_khong_theo_pattern_thi_khong_lam_nhay_chu()
    {
        Assert.Equal("A-A", SheetSetup.TenMatCatKeTiep("{alpha}-{alpha}", ["MẶT CẮT", "1-1"]));
    }

    [Fact]
    public void Chu_cai_thu_n_theo_kieu_cot_excel()
    {
        Assert.Equal("A", SheetSetup.ChuCaiThu(0));
        Assert.Equal("Z", SheetSetup.ChuCaiThu(25));
        Assert.Equal("AA", SheetSetup.ChuCaiThu(26));
        Assert.Equal("AB", SheetSetup.ChuCaiThu(27));
    }

    // ===== Khổ giấy của máy in =====

    [Fact]
    public void Chon_kho_giay_uu_tien_ISO_khong_mo_rong_le()
    {
        string[] danhSach =
        [
            "ANSI_A_(8.50_x_11.00_Inches)",
            "ISO_full_bleed_A1_(841.00_x_594.00_MM)",
            "ISO_A1_(841.00_x_594.00_MM)",
            "ISO_A10_(37.00_x_26.00_MM)",
        ];

        Assert.Equal("ISO_A1_(841.00_x_594.00_MM)", SheetSetup.ChonTenKhoGiay(danhSach, "A1"));
    }

    [Fact]
    public void Chon_kho_giay_khong_nham_A1_voi_A10()
    {
        Assert.Equal(
            "ISO_A10_(37.00_x_26.00_MM)",
            SheetSetup.ChonTenKhoGiay(["ISO_A10_(37.00_x_26.00_MM)"], "A10"));
        Assert.Null(SheetSetup.ChonTenKhoGiay(["ISO_A10_(37.00_x_26.00_MM)"], "A1"));
    }

    [Fact]
    public void May_in_khong_co_kho_thi_tra_null_de_Adapter_canh_bao()
    {
        Assert.Null(SheetSetup.ChonTenKhoGiay(["ANSI_A_(8.50_x_11.00_Inches)"], "A1"));
        Assert.Null(SheetSetup.ChonTenKhoGiay([], "A1"));
    }

    // ===== Khung tên trong manifest =====

    private static BlockManifest Manifest(params BlockDef[] blocks) => new()
    {
        Version = "b-test",
        DwgSha256 = new string('a', 64),
        Blocks = blocks,
    };

    private static BlockDef KhungTen(string id, string ten, string paper) => new()
    {
        Id = id,
        BlockName = ten,
        Kind = "titleblock",
        Paper = paper,
        Attributes = ["DU_AN", "TI_LE"],
    };

    [Fact]
    public void Titleblock_id_khai_dung_kho_thi_lay_dung_block()
    {
        var manifest = Manifest(KhungTen("titleblock-a1", "XB-TB-A1", "A1"));
        var sheetSetup = new SheetSetupSection { TitleblockId = "titleblock-a1" };

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, sheetSetup, "A1");

        Assert.Null(loi);
        Assert.Equal("XB-TB-A1", khung!.BlockName);
    }

    [Fact]
    public void Titleblock_id_khong_co_trong_manifest_thi_bao_loi_ro_rang()
    {
        var manifest = Manifest(KhungTen("titleblock-a1", "XB-TB-A1", "A1"));
        var sheetSetup = new SheetSetupSection { TitleblockId = "titleblock-a0" };

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, sheetSetup, "A1");

        Assert.Null(khung);
        Assert.Contains("titleblock-a0", loi);
        Assert.Contains("manifest", loi);
    }

    [Fact]
    public void Khac_kho_thi_tim_khung_ten_dung_kho_trong_manifest()
    {
        var manifest = Manifest(
            KhungTen("titleblock-a1", "XB-TB-A1", "A1"),
            KhungTen("titleblock-a3", "XB-TB-A3", "A3"));
        var sheetSetup = new SheetSetupSection { TitleblockId = "titleblock-a1" };

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, sheetSetup, "A3");

        Assert.Null(loi);
        Assert.Equal("XB-TB-A3", khung!.BlockName);
    }

    [Fact]
    public void Thu_vien_thieu_khung_ten_cho_kho_dang_in_thi_bao_loi()
    {
        var manifest = Manifest(KhungTen("titleblock-a1", "XB-TB-A1", "A1"));
        var sheetSetup = new SheetSetupSection { TitleblockId = "titleblock-a1" };

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, sheetSetup, "A2");

        Assert.Null(khung);
        Assert.Contains("A2", loi);
    }

    [Fact]
    public void Rule_pack_khong_khai_titleblockId_thi_tra_ve_theo_kho_giay()
    {
        var manifest = Manifest(KhungTen("titleblock-a2", "XB-TB-A2", "A2"));

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, new SheetSetupSection(), "A2");

        Assert.Null(loi);
        Assert.Equal("XB-TB-A2", khung!.BlockName);
    }

    [Fact]
    public void Manifest_mau_trong_repo_co_khung_ten_A1_dung_theo_rule_pack_hien_hanh()
    {
        // Đối chứng thật: rule pack v4 đang phát hành + manifest mẫu trong plugin-autocad/doi-chung.
        var manifest = BlockManifestLoader.Load(
            File.ReadAllText(Path.Combine(RepoPaths.DoiChungDir, "block-lib-manifest-mau.json")));
        var pack = DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));

        var (khung, loi) = SheetSetup.TimKhungTen(manifest, pack.SheetSetup, "A1");

        Assert.Null(loi);
        Assert.Equal("XB-TB-A1", khung!.BlockName);
        Assert.Contains("DU_AN", khung.Attributes);
    }
}
