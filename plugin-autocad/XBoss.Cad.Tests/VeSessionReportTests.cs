using System.Text.Json;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Reporting;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 §14 (PR5) — báo cáo phiên vẽ dựng từ XData <c>XBOSS_VE</c> đang sống trong bản vẽ.
/// Quan trọng nhất: đếm đúng theo hệ, nêu đúng size ngoài danh mục, và KHÔNG im lặng khi bản vẽ
/// trộn nhiều version rule pack/thư viện (đó chính là lúc khối lượng bóc ra không tin được).
/// </summary>
public class VeSessionReportTests
{
    private static readonly VeSessionMeta Meta = new()
    {
        RulePackVersion = "v7",
        ThuVienVersion = "b1",
        TenBanVe = "AVIO-A-SHOP-01.dwg",
        NgayIso = "2026-08-25",
        NguoiVe = "ksdien",
    };

    private static VeXDataInfo Tim(string he, string item, string size, bool custom = false, string rp = "v7") =>
        new()
        {
            VaiTro = VaiTroVe.Tim,
            HeId = he,
            ItemId = item,
            Size = size,
            SizeTuNhap = custom,
            RulePackVersion = rp,
        };

    private static VeXDataInfo Khoi(VaiTroVe vaiTro, string he, string? thuVien = "b1") => new()
    {
        VaiTro = vaiTro,
        HeId = he,
        RulePackVersion = "v7",
        ThuVienVersion = thuVien,
    };

    [Fact]
    public void Dem_tuyen_va_block_theo_he()
    {
        var bc = VeSessionReport.Dung(
            [
                Tim("HVAC", "duct-supp", "300x200"),
                Tim("HVAC", "duct-supp", "400x250"),
                Khoi(VaiTroVe.Bien, "HVAC"),
                Khoi(VaiTroVe.Bien, "HVAC"),
                Khoi(VaiTroVe.Nhan, "HVAC"),
                Khoi(VaiTroVe.PhuKien, "HVAC"),
                Khoi(VaiTroVe.ThietBi, "HVAC"),
                Khoi(VaiTroVe.GiaDo, "HVAC"),
                Khoi(VaiTroVe.LoCho, "HVAC"),
                Tim("PIPING", "pipe-sanr", "DN100"),
                Khoi(VaiTroVe.TuyenCat, "PIPING"),
                Khoi(VaiTroVe.MatCat, "PIPING"),
                Khoi(VaiTroVe.DinhNghiaBlock, ""),
                Khoi(VaiTroVe.BangThongKe, ""),
            ],
            Meta);

        Assert.Equal(2, bc.HeThong.Count);
        var hvac = bc.HeThong.Single(h => h.HeId == "HVAC");
        Assert.Equal(2, hvac.SoTuyen);
        Assert.Equal(2, hvac.SoNetBien);
        Assert.Equal(1, hvac.SoNhan);
        Assert.Equal(1, hvac.SoPhuKien);
        Assert.Equal(1, hvac.SoThietBi);
        Assert.Equal(1, hvac.SoGiaDo);
        Assert.Equal(1, hvac.SoLoCho);
        Assert.Equal(4, hvac.SoBlock); // phụ kiện + thiết bị + giá đỡ + lỗ chờ

        var piping = bc.HeThong.Single(h => h.HeId == "PIPING");
        Assert.Equal(1, piping.SoTuyen);
        Assert.Equal(2, piping.SoMatCat); // tuyến cắt + đối tượng hình cắt

        // Định nghĩa block và bảng thống kê không thuộc hệ nào → đếm riêng, không đẻ ra hệ ma.
        Assert.Equal(1, bc.SoDinhNghiaBlock);
        Assert.Equal(1, bc.SoBangThongKe);
        Assert.Equal(3, bc.TongTuyen);
        Assert.Empty(bc.CanhBao);
    }

    [Fact]
    public void Gom_size_ngoai_danh_muc_va_canh_bao()
    {
        var bc = VeSessionReport.Dung(
            [
                Tim("PIPING", "pipe-sanr", "DN175", custom: true),
                Tim("PIPING", "pipe-sanr", "DN175", custom: true),
                Tim("PIPING", "pipe-sanr", "DN100"),
            ],
            Meta);

        var s = Assert.Single(bc.SizeCustom);
        Assert.Equal("DN175", s.Size);
        Assert.Equal(2, s.SoTuyen);
        Assert.Contains(bc.CanhBao, c => c.Contains("NGOÀI danh mục"));
    }

    [Fact]
    public void Canh_bao_khi_ban_ve_tron_nhieu_version_rule_pack()
    {
        var bc = VeSessionReport.Dung(
            [Tim("HVAC", "duct-supp", "300x200"), Tim("HVAC", "duct-supp", "300x200", rp: "v4")],
            Meta);

        var khac = Assert.Single(bc.RulePackKhac);
        Assert.Equal("v4", khac.Version);
        Assert.Equal(1, khac.SoDoiTuong);
        Assert.Contains(bc.CanhBao, c => c.Contains("trộn nhiều version rule pack"));
    }

    [Fact]
    public void Canh_bao_khi_khoi_den_tu_version_thu_vien_khac()
    {
        var bc = VeSessionReport.Dung([Khoi(VaiTroVe.PhuKien, "HVAC", thuVien: "b0-mau")], Meta);
        Assert.Contains(bc.CanhBao, c => c.Contains("b0-mau"));

        // Máy chưa có thư viện (ThuVienVersion null) → không có gì để so, KHÔNG báo oan.
        var chuaCo = VeSessionReport.Dung(
            [Khoi(VaiTroVe.PhuKien, "HVAC", thuVien: "b0-mau")], Meta with { ThuVienVersion = null });
        Assert.Empty(chuaCo.ThuVienKhac);
        Assert.Empty(chuaCo.CanhBao);
    }

    [Fact]
    public void Nhat_ky_dung_do_block_vao_bao_cao_va_json_doc_duoc()
    {
        var bc = VeSessionReport.Dung(
            [Tim("HVAC", "duct-supp", "300x200", custom: true)],
            Meta,
            ["Block \"FCU\" trùng tên — kỹ sư chọn GIỮ định nghĩa trong bản vẽ."]);

        Assert.Single(bc.NhatKy);
        var text = bc.ToVietnameseText();
        Assert.Contains("Nhật ký phiên", text);
        Assert.Contains("FCU", text);
        Assert.Contains("v7", text);

        using var doc = JsonDocument.Parse(bc.ToJson());
        var goc = doc.RootElement;
        Assert.Equal("v7", goc.GetProperty("rulePackVersion").GetString());
        Assert.Equal("b1", goc.GetProperty("thuVienVersion").GetString());
        Assert.Equal("AVIO-A-SHOP-01.dwg", goc.GetProperty("tenBanVe").GetString());
        Assert.Equal(1, goc.GetProperty("heThong")[0].GetProperty("soTuyen").GetInt32());
        Assert.Equal("300x200", goc.GetProperty("sizeCustom")[0].GetProperty("size").GetString());
        Assert.Equal(1, goc.GetProperty("nhatKy").GetArrayLength());
    }

    // ===== Mục ngắt nét giao chéo (M109 FR9) =====

    private static VeXDataInfo NgatNet(
        string heDuoi, string item, string size, string timDuoi, string timTren, bool daoTay = false) =>
        new()
        {
            VaiTro = VaiTroVe.NgatNet,
            HeId = heDuoi,
            ItemId = item,
            Size = size,
            RulePackVersion = "v7",
            HandleTim = timDuoi,
            HandleTimGiao = timTren,
            DaoTay = daoTay,
        };

    [Fact]
    public void Muc_ngat_net_gop_theo_tuyen_di_duoi_va_dem_dao_tay()
    {
        var bc = VeSessionReport.Dung(
            [
                Tim("PIPING", "pipe-domw", "DN100"),
                NgatNet("PIPING", "pipe-domw", "DN100", "1A", "2B"),
                NgatNet("PIPING", "pipe-domw", "DN100", "1A", "2B"),
                NgatNet("PIPING", "pipe-domw", "DN100", "1A", "3C", daoTay: true),
                NgatNet("ELV", "tray-elv", "200x100", "4D", "2B"),
            ],
            Meta);

        Assert.Equal(2, bc.NgatNet.Count);
        var piping = bc.NgatNet.Single(c => c.HeId == "PIPING");
        Assert.Equal(3, piping.SoDoiTuong);
        Assert.Equal(1, piping.SoDaoTay);
        Assert.Equal(0, bc.NgatNet.Single(c => c.HeId == "ELV").SoDaoTay);

        // Đếm theo hệ ĐI DƯỚI: hệ đi trên không sinh đối tượng ngắt nét nào.
        Assert.Equal(3, bc.HeThong.Single(h => h.HeId == "PIPING").SoNgatNet);

        // Đảo tay phải nổi lên cảnh báo — đó là chỗ duy nhất người nghiệm thu bản vẽ thấy được.
        Assert.Contains(bc.CanhBao, c => c.Contains("ĐẢO TAY", StringComparison.Ordinal));

        var text = bc.ToVietnameseText();
        Assert.Contains("Ngắt nét giao chéo", text, StringComparison.Ordinal);
        Assert.Contains("đảo tay", text, StringComparison.Ordinal);

        using var doc = JsonDocument.Parse(bc.ToJson());
        var ngatNet = doc.RootElement.GetProperty("ngatNet");
        Assert.Equal(2, ngatNet.GetArrayLength());
        Assert.Equal(1, ngatNet[1].GetProperty("soDaoTay").GetInt32());
    }

    [Fact]
    public void Khong_co_dao_tay_thi_khong_canh_bao_thua()
    {
        var bc = VeSessionReport.Dung([NgatNet("PIPING", "pipe-domw", "DN100", "1A", "2B")], Meta);

        Assert.Equal(0, Assert.Single(bc.NgatNet).SoDaoTay);
        Assert.DoesNotContain(bc.CanhBao, c => c.Contains("ĐẢO TAY", StringComparison.Ordinal));
    }

    [Fact]
    public void Ban_ve_trong_van_ra_bao_cao_hop_le()
    {
        var bc = VeSessionReport.Dung([], Meta);
        Assert.Empty(bc.HeThong);
        Assert.Equal(0, bc.TongTuyen);
        Assert.Equal(0, bc.TongBlock);
        Assert.Contains("chưa có đối tượng nào", bc.ToVietnameseText());
    }

    [Fact]
    public void Muc_nhan_ban_tang_gop_theo_cap_tang_nguon_va_tang_chep()
    {
        // M111 FR10 — đọc từ dấu bản chép SỐNG trong bản vẽ (TangNguon/NhanTang), nên mở lại bản vẽ
        // ở máy khác vẫn dựng lại được đúng con số này.
        var chep = (string nguon, string dich) =>
            Tim("HVAC", "duct-supp", "300x200") with { TangNguon = nguon, NhanTang = dich };
        var bc = VeSessionReport.Dung(
            [
                Tim("HVAC", "duct-supp", "300x200"),
                chep("05", "06"),
                chep("05", "06"),
                chep("05", "07"),
            ],
            Meta);

        Assert.Equal(2, bc.NhanTang.Count);
        Assert.Equal(2, bc.NhanTang[0].SoDoiTuong);
        Assert.Equal("06", bc.NhanTang[0].NhanTang);
        Assert.Equal("05", bc.NhanTang[0].TangNguon);
        Assert.Equal(1, bc.NhanTang[1].SoDoiTuong);
        Assert.Contains("tầng 05 → tầng 07", bc.ToVietnameseText(), StringComparison.Ordinal);
        Assert.Equal(2, JsonDocument.Parse(bc.ToJson()).RootElement.GetProperty("nhanTang").GetArrayLength());
    }

    [Fact]
    public void Ban_ve_chua_nhan_ban_tang_thi_muc_do_rong()
    {
        Assert.Empty(VeSessionReport.Dung([Tim("HVAC", "duct-supp", "300x200")], Meta).NhanTang);
    }

    [Fact]
    public void Doi_tuong_mat_HeId_van_duoc_dem_vao_nhom_rieng()
    {
        // XData bị sửa tay/hỏng: thà gom vào "(không rõ hệ)" còn hơn lặng lẽ đếm thiếu.
        var bc = VeSessionReport.Dung([Tim("", "duct-supp", "300x200")], Meta);
        Assert.Equal("(không rõ hệ)", Assert.Single(bc.HeThong).HeId);
    }
}
