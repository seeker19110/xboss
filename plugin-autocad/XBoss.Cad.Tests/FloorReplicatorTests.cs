using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M111 §8 — logic thuần của lệnh nhân bản tầng điển hình: vị trí đặt từng tầng, đổi tag
/// <c>{floor}</c>, đổi tên vùng bóc, và KẾ HOẠCH ánh xạ handle (bảng ánh xạ giả lập, không cần
/// AutoCAD). Hai bất biến §2 được canh trực tiếp ở đây: tầng đích không bao giờ dời 0 (không đè
/// tầng nguồn) và handle ngoài tập chọn bị GỠ chứ không giữ (không handle mồ côi).
/// </summary>
public class FloorReplicatorTests
{
    private const string Pattern = "{type}-{floor}-{seq}";

    private static FloorPolicySection ChinhSach(
        string layoutMode = "offsetY", double stepMm = 30000, int gridColumns = 4) => new()
    {
        Enabled = true,
        Floors = ["05", "06", "07"],
        LayoutMode = layoutMode,
        StepMm = stepMm,
        GridColumns = gridColumns,
        ZoneNamePattern = "{zone}-T{floor}",
        CopyRoles = ["Tim", "Bien", "Nhan", "ThietBi"],
    };

    // ===== Vị trí đặt =====

    [Fact]
    public void OffsetY_doi_theo_truc_Y_dung_boi_so_buoc()
    {
        var fp = ChinhSach();

        Assert.Equal(new Diem2(0, 30000), FloorReplicator.ViTriDatTang(fp, 0));
        Assert.Equal(new Diem2(0, 60000), FloorReplicator.ViTriDatTang(fp, 1));
    }

    [Fact]
    public void OffsetX_doi_theo_truc_X()
    {
        var fp = ChinhSach("offsetX");

        Assert.Equal(new Diem2(30000, 0), FloorReplicator.ViTriDatTang(fp, 0));
        Assert.Equal(new Diem2(60000, 0), FloorReplicator.ViTriDatTang(fp, 1));
    }

    [Fact]
    public void Luoi_xep_day_hang_roi_xuong_dong_theo_gridColumns()
    {
        var fp = ChinhSach("luoi", gridColumns: 3);

        // Ô 0 dành cho chính tầng nguồn nên tầng đích đầu tiên là ô 1.
        Assert.Equal(new Diem2(30000, 0), FloorReplicator.ViTriDatTang(fp, 0));
        Assert.Equal(new Diem2(60000, 0), FloorReplicator.ViTriDatTang(fp, 1));
        Assert.Equal(new Diem2(0, 30000), FloorReplicator.ViTriDatTang(fp, 2)); // ô 3 → hàng 2
    }

    [Fact]
    public void Moi_tang_dich_deu_doi_khac_0_va_khong_trung_nhau_guardrail_1()
    {
        foreach (var kieu in new[] { "offsetY", "offsetX", "luoi" })
        {
            var fp = ChinhSach(kieu);
            var keHoach = FloorReplicator.LapKeHoachDat(fp, ["06", "07", "08", "09", "10"]);

            Assert.All(keHoach, k => Assert.NotEqual(new Diem2(0, 0), k.Doi));
            Assert.Equal(keHoach.Count, keHoach.Select(k => k.Doi).Distinct().Count());
            Assert.Equal(["06", "07", "08", "09", "10"], keHoach.Select(k => k.NhanTang));
        }
    }

    // ===== Đổi tag (FR5) =====

    [Fact]
    public void Doi_tag_chi_thay_floor_giu_nguyen_type_va_seq()
    {
        Assert.Equal("FCU-06-01", FloorReplicator.DoiTagTheoTang(Pattern, "FCU-05-01", "06"));
        Assert.Equal("AHU-10-12", FloorReplicator.DoiTagTheoTang(Pattern, "AHU-05-12", "10"));
    }

    [Fact]
    public void Tag_khong_khop_pattern_thi_giu_nguyen_va_vao_canh_bao()
    {
        var tags = new List<TagHienCo>
        {
            new("A1", "FCU-05-01", "FCU", Khoa: false),
            new("A2", "FCU cu khong theo mau", "FCU", Khoa: false),
            new("A3", "", "FCU", Khoa: false),
        };

        var keHoach = FloorReplicator.LapKeHoachDoiTag(Pattern, tags, "07");

        Assert.Equal(new GanTag("A1", "FCU-05-01", "FCU-07-01"), Assert.Single(keHoach.Doi));
        Assert.Equal("FCU cu khong theo mau", Assert.Single(keHoach.KhongDoiDuoc));
        Assert.Null(FloorReplicator.DoiTagTheoTang(Pattern, "FCU cu khong theo mau", "07"));
    }

    [Fact]
    public void Tag_da_dung_tang_dich_thi_khong_bao_la_doi()
    {
        var tags = new List<TagHienCo> { new("A1", "FCU-07-01", "FCU", Khoa: false) };

        Assert.Empty(FloorReplicator.LapKeHoachDoiTag(Pattern, tags, "07").Doi);
    }

    // ===== Đổi tên vùng (FR6) =====

    [Fact]
    public void Ten_vung_doi_theo_zoneNamePattern()
    {
        var fp = ChinhSach();

        var keHoach = FloorReplicator.LapKeHoachDoiTenVung(fp, ["Zone-A", "Zone-B"], [], "08");

        Assert.Equal([("Zone-A", "Zone-A-T08"), ("Zone-B", "Zone-B-T08")], keHoach.Doi);
        Assert.Empty(keHoach.Trung);
    }

    [Fact]
    public void Ten_vung_dich_trung_vung_da_co_thi_bao_trung_de_lenh_dung_AC9()
    {
        var fp = ChinhSach();

        var keHoach = FloorReplicator.LapKeHoachDoiTenVung(fp, ["Zone-A"], ["Zone-A-T08"], "08");

        Assert.Equal("Zone-A-T08", Assert.Single(keHoach.Trung));
    }

    // ===== Kế hoạch ánh xạ handle (FR4 — guardrail 2) =====

    [Fact]
    public void Handle_trong_tap_chon_duoc_thay_bang_handle_ban_chep()
    {
        var anhXa = new Dictionary<string, string>
        {
            ["1A"] = "9A", // tim
            ["1B"] = "9B", // biên
            ["1C"] = "9C", // nhãn
        };
        var nguon = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HandleBien = ["1B"],
            HandleNhan = ["1C"],
        };

        var ra = FloorReplicator.AnhXaXData(nguon, anhXa, "05", "06");

        Assert.Equal(["9B"], ra.XData.HandleBien);
        Assert.Equal(["9C"], ra.XData.HandleNhan);
        Assert.Empty(ra.HandleDaGo);
        Assert.Equal("05", ra.XData.TangNguon);
        Assert.Equal("06", ra.XData.NhanTang);
    }

    [Fact]
    public void Handle_ngoai_tap_chon_bi_go_chu_khong_giu_tro_ve_tang_nguon()
    {
        var anhXa = new Dictionary<string, string> { ["1B"] = "9B" };
        var nguon = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Bien,
            HandleTim = "1A",          // tim KHÔNG nằm trong tập chọn
            HandleBien = ["1B", "1Z"], // 1Z ngoài tập chọn
            HandleTuyenCat = "1Y",     // tuyến cắt không được chép
        };

        var ra = FloorReplicator.AnhXaXData(nguon, anhXa, "05", "06");

        Assert.Null(ra.XData.HandleTim);
        Assert.Equal(["9B"], ra.XData.HandleBien);
        Assert.Null(ra.XData.HandleTuyenCat);
        Assert.Equal(["1A", "1Z", "1Y"], ra.HandleDaGo);
    }

    [Fact]
    public void Moi_handle_con_lai_trong_XData_ban_chep_deu_thuoc_ban_chep_AC3()
    {
        var anhXa = new Dictionary<string, string> { ["1A"] = "9A", ["1B"] = "9B" };
        var banChep = new HashSet<string>(anhXa.Values);
        var nguon = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HandleTim = "1A",
            HandleBien = ["1B", "1Z"],
            HandleNhan = ["1Q"],
            HandleTuyenCat = "1Y",
        };

        var ra = FloorReplicator.AnhXaXData(nguon, anhXa, "05", "06");

        var conLai = new List<string?> { ra.XData.HandleTim, ra.XData.HandleTuyenCat }
            .Concat(ra.XData.HandleBien)
            .Concat(ra.XData.HandleNhan)
            .OfType<string>();
        Assert.All(conLai, h => Assert.Contains(h, banChep));
    }

    // ===== Dấu bản chép trong XData (FR9) =====

    [Fact]
    public void XData_ban_chep_ma_hoa_va_giai_ma_giu_nguyen_dau_tang()
    {
        var ra = FloorReplicator.AnhXaXData(
            new VeXDataInfo { VaiTro = VaiTroVe.ThietBi }, new Dictionary<string, string>(), "05", "06");

        var vong = VeXData.GiaiMa(VeXData.MaHoa(ra.XData))!;

        Assert.Equal("05", vong.TangNguon);
        Assert.Equal("06", vong.NhanTang);
        Assert.True(FloorReplicator.LaBanChepCuaTang(vong, "06"));
        Assert.False(FloorReplicator.LaBanChepCuaTang(vong, "07"));
    }

    [Fact]
    public void Doi_tuong_ve_tay_khong_bi_coi_la_ban_chep()
    {
        var xdata = new VeXDataInfo { VaiTro = VaiTroVe.Tim };

        Assert.False(FloorReplicator.LaBanChepCuaTang(xdata, "06"));
    }

    // ===== Lọc vai trò (FR1/FR7) =====

    [Fact]
    public void Chi_chep_vai_tro_khai_trong_copyRoles()
    {
        var fp = ChinhSach();

        Assert.True(fp.DuocChep(VaiTroVe.Tim));
        Assert.True(fp.DuocChep(VaiTroVe.ThietBi));
        Assert.False(fp.DuocChep(VaiTroVe.MatCat));
        Assert.False(fp.DuocChep(VaiTroVe.BangThongKe));
        Assert.Equal([VaiTroVe.Tim, VaiTroVe.Bien, VaiTroVe.Nhan, VaiTroVe.ThietBi], fp.VaiTroChep);
    }

    [Fact]
    public void Kieu_dat_la_thi_bao_loi_tieng_Viet()
    {
        var loi = Assert.Throws<RulePackException>(() => FloorReplicator.DocKieuDat("offsetZ"));

        Assert.Contains("offsetZ", loi.Message, StringComparison.Ordinal);
    }
}
