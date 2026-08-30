using XBoss.Cad.Core.Api;
using XBoss.Cad.Core.Inspection;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.Ui;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M102 — logic dựng bảng điều khiển (<see cref="BangDieuKhienModel"/>) + tóm tắt sidecar
/// (<see cref="SidecarSummary"/>). Sidecar test bằng JSON sinh từ CHÍNH các lớp báo cáo thật
/// (InspectionReport/StandardizeReport/TakeoffJsonReport) — đổi format báo cáo mà quên bảng
/// điều khiển là đỏ ngay tại đây.
/// </summary>
public sealed class BangDieuKhienTests
{
    private static TrangThaiPhien TrangThaiDu() => new()
    {
        ServerUrl = "https://xboss.congty.vn",
        DaGhepThietBi = true,
        RulePackVersion = "v7",
        SoQuyTacBoc = 12,
        SoNhomLayer = 5,
        TenBanVe = "M-DUCT-T05.dwg",
        ThuVienVersion = "b3",
        SoBlockThuVien = 9,
    };

    [Fact]
    public void PhienDayDu_BonKhoi_ChiConNutDeXuatBlock()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu());
        Assert.Equal(4, khoi.Count);
        Assert.Contains(khoi[1].Dong, d => d.NoiDung.Contains("v7") && d.NoiDung.Contains("12 quy tắc") && d.MucDo == MucDo.Tot);
        // Kết nối/rule pack/bản vẽ đều đủ ⇒ không gợi ý gì; khối thư viện luôn có lối đề xuất block.
        Assert.Null(khoi[0].LenhGoiY);
        Assert.Null(khoi[1].LenhGoiY);
        Assert.Null(khoi[3].LenhGoiY);
        Assert.Equal("XBOSS_VE_DEXUAT", khoi[2].LenhGoiY);
        Assert.Equal("Đề xuất block…", khoi[2].NhanLenh);
    }

    [Fact]
    public void ChuaGhepThietBi_CanhBaoVaGoiYDangNhap()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with { DaGhepThietBi = false, ServerUrl = null });
        Assert.Equal("XBOSS_LOGIN", khoi[0].LenhGoiY);
        Assert.Contains(khoi[0].Dong, d => d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void ChuaNapRulePack_CanhBaoVaGoiYNapRulePack()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with { RulePackVersion = null });
        Assert.Equal("XBOSS_RULEPACK", khoi[1].LenhGoiY);
        Assert.Contains(khoi[1].Dong, d => d.NoiDung.Contains("Chưa nạp") && d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void RulePackCacheHong_HienDungLyDo()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with
        { RulePackVersion = null, LoiRulePack = "Rule pack cache hỏng (thiếu version) — nạp lại bằng XBOSS_RULEPACK." });
        Assert.Contains(khoi[1].Dong, d => d.NoiDung.Contains("cache hỏng") && d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void ChuaCoBanVe_VaChuaCoBaoCao_HienThongDiepRo()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with { TenBanVe = null });
        Assert.Contains(khoi[3].Dong, d => d.NoiDung.Contains("Chưa lưu/chưa mở"));
        Assert.Contains(khoi[3].Dong, d => d.NoiDung.Contains("Chưa có báo cáo"));
    }

    // ── Khối "Thư viện block" + đề xuất (M103 §4) ──

    [Fact]
    public void ChuaCoThuVienBlock_GoiYNapThuVienChuKhongPhaiDeXuat()
    {
        // Không có thư viện thì không dựng được ứng viên ⇒ nút phải đưa về đường nạp thư viện.
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with { ThuVienVersion = null, SoBlockThuVien = 0 });
        Assert.Equal("XBOSS_VE_THUVIEN", khoi[2].LenhGoiY);
        Assert.Contains(khoi[2].Dong, d => d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void ThuVienHong_HienDungLyDo()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with
        { ThuVienVersion = null, LoiThuVien = "Thư viện block trong cache KHÔNG dùng được: hash lệch" });
        Assert.Contains(khoi[2].Dong, d => d.NoiDung.Contains("hash lệch") && d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void DeXuatChoDuyet_HienTenBlockVaDemDung()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with
        {
            DeXuat =
            [
                new() { BlockName = "XB-VAN-BI", Status = "pending", StatusNhan = "Chờ duyệt" },
                new() { BlockName = "XB-FCU-2", Status = "approved", StatusNhan = "Đã duyệt", PublishedVersion = "b4" },
            ],
        });
        Assert.Contains(khoi[2].Dong, d => d.Muc == "Đề xuất của tôi" && d.NoiDung.Contains("1 chờ duyệt") && d.NoiDung.Contains("XB-VAN-BI"));
        Assert.Contains(khoi[2].Dong, d => d.Muc == "Gần nhất" && d.NoiDung.Contains("thư viện b4") && d.MucDo == MucDo.Tot);
    }

    [Fact]
    public void DeXuatBiTuChoi_HienLyDoTuChoi()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with
        {
            LaNguoiDuyet = true,
            DeXuat = [new() { BlockName = "XB-CO-90", Status = "rejected", StatusNhan = "Từ chối", RejectReason = "Trùng với co có sẵn" }],
        });
        // Admin/PM thấy đề xuất của cả đội ⇒ nhãn phải khác "của tôi".
        Assert.Contains(khoi[2].Dong, d => d.Muc == "Đề xuất (cả đội)");
        Assert.Contains(khoi[2].Dong, d => d.NoiDung.Contains("Trùng với co có sẵn") && d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void KhongHoiDuocServer_HienLyDoChuKhongCoiLaKhongCoDeXuat()
    {
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu() with { LoiDeXuat = "Không kết nối được server (timeout)" });
        Assert.Contains(khoi[2].Dong, d => d.NoiDung.Contains("Không kết nối được server"));
        Assert.DoesNotContain(khoi[2].Dong, d => d.NoiDung.Contains("Không có đề xuất nào"));
    }

    // ── SidecarSummary trên JSON từ các lớp báo cáo THẬT ──

    [Fact]
    public void TomTatKiemTra_CoLoi_DemDungTongSoLoi()
    {
        var json = new InspectionReport
        {
            RulePackVersion = "v7",
            Findings =
            [
                new InspectionFinding { Id = "layer-sai", Ten = "Layer sai chuẩn", Handles = ["A1", "A2"], ChiTiet = [] },
                new InspectionFinding { Id = "font-cu", Ten = "Font cũ", Handles = [], ChiTiet = ["style X"] },
            ],
            CanhBao = [],
        }.DongDau("M-DUCT-T05.dwg", "2026-08-25").ToJson();

        var dong = SidecarSummary.TomTat("Kiểm tra", json);
        Assert.NotNull(dong);
        Assert.Equal(MucDo.CanhBao, dong.MucDo);
        Assert.Contains("3 lỗi", dong.NoiDung);
        Assert.Contains("v7", dong.NoiDung);
        Assert.Contains("2026-08-25", dong.NoiDung);
    }

    [Fact]
    public void TomTatKiemTra_KhongLoi_LaMauTot()
    {
        var json = new InspectionReport { RulePackVersion = "v7", Findings = [], CanhBao = [] }.ToJson();
        var dong = SidecarSummary.TomTat("Kiểm tra", json);
        Assert.NotNull(dong);
        Assert.Equal(MucDo.Tot, dong.MucDo);
        Assert.Contains("0 lỗi", dong.NoiDung);
    }

    [Fact]
    public void TomTatChuanHoa_DemSoBuocSua()
    {
        var json = new StandardizeReport
        {
            RulePackVersion = "v7",
            TenBanVe = "a.dwg",
            NgayIso = "2026-08-25",
            CheDo = "chuan-hoa",
            Steps = [new StepDiff { Buoc = "layer", HangMuc = "M-DUCT", Truoc = "DUCT", Sau = "M-DUCT", SoLuong = 4 }],
            CanhBao = [],
        }.ToJson();
        var dong = SidecarSummary.TomTat("Chuẩn hóa", json);
        Assert.NotNull(dong);
        Assert.Contains("1 bước sửa", dong.NoiDung);
    }

    [Fact]
    public void TomTatBocKhoiLuong_DemSoDong()
    {
        var json = new TakeoffJsonReport
        {
            RulePackVersion = "v7",
            TenDuAn = "TT AVIO",
            GoiThau = "ACMV",
            TenBanVe = "a.dwg",
            NguoiBoc = "ks",
            NgayIso = "2026-08-25",
            Lines =
            [
                new TakeoffJsonLine
                {
                    ItemId = "duct", BoqCode = "AC-01", Group = "Ống gió", Ten = "Ống gió", QuyCach = "",
                    DonVi = "m", SoDoiTuong = 3, KhoiLuong = 45.2, Handles = ["H1"],
                },
            ],
            CanhBao = [],
        }.ToJson();
        var dong = SidecarSummary.TomTat("Bóc KL", json);
        Assert.NotNull(dong);
        Assert.Contains("1 dòng khối lượng", dong.NoiDung);
    }

    [Theory]
    [InlineData("{ hỏng")]           // JSON vỡ
    [InlineData("[1,2,3]")]          // không phải object
    [InlineData("{\"la\":\"gì\"}")]  // object nhưng thiếu mọi khóa quen
    public void SidecarHongHoacLa_TraNullKhongNem(string json)
    {
        Assert.Null(SidecarSummary.TomTat("Chuẩn hóa", json));
        Assert.Null(SidecarSummary.TomTat("nhãn-lạ", json));
    }

    // ── SoLoiKiemTra: dấu hiệu "nền đã sạch" của trình dẫn quy trình (M106 FR8) ──

    [Fact]
    public void SoLoiKiemTra_DocDungTuBaoCaoThat()
    {
        var sach = new InspectionReport { RulePackVersion = "v7", Findings = [], CanhBao = [] }.ToJson();
        var coLoi = new InspectionReport
        {
            RulePackVersion = "v7",
            Findings = [new InspectionFinding { Id = "lech-z", Ten = "Lệch Z", Handles = ["A1", "A2"], ChiTiet = [] }],
            CanhBao = [],
        }.ToJson();

        Assert.Equal(0, SidecarSummary.SoLoiKiemTra(sach));
        Assert.Equal(2, SidecarSummary.SoLoiKiemTra(coLoi));
    }

    [Theory]
    [InlineData("{ hỏng")]
    [InlineData("[1,2,3]")]
    [InlineData("{\"la\":\"gì\"}")]
    public void SoLoiKiemTra_SidecarHong_TraNull_ChuKhongPhai0(string json)
    {
        // null = "chưa biết nền có sạch không" — trình dẫn phải để bước 2 là CHƯA, chứ trả 0 là
        // dẫn kỹ sư đi tiếp trên một cái nền không ai kiểm.
        Assert.Null(SidecarSummary.SoLoiKiemTra(json));
    }

    [Fact]
    public void CacLoaiSidecar_KhopDuoiTepMaAdapterGhi()
    {
        // Đuôi tệp phải khớp đúng chuỗi các lệnh Adapter dùng khi ghi báo cáo cạnh DWG.
        Assert.Equal(
            [".xboss-kiemtra.json", ".xboss-report.json", ".xboss-takeoff.json", ".xboss-ve.json"],
            SidecarSummary.CacLoai.Select(l => l.DuoiTep));
    }

    // ── Dòng "Phiên bản plugin" (M118 PR3 — FR3/AC5) ──

    [Fact]
    public void ChuaCoPluginVersion_KhongThemDongPhienBan()
    {
        // Không có PluginVersion (adapter cũ/lỗi đọc assembly) ⇒ không thêm dòng thay vì hiện rác.
        var khoi = BangDieuKhienModel.Dung(TrangThaiDu());
        Assert.DoesNotContain(khoi[0].Dong, d => d.Muc == "Phiên bản plugin");
    }

    [Fact]
    public void PhienBanLech_CanhBaoKemCaHaiSo()
    {
        var khoi = BangDieuKhienModel.Dung(
            TrangThaiDu() with { PluginVersion = "1.0.0", ServerPluginVersion = "1.2.0" });
        Assert.Contains(khoi[0].Dong, d =>
            d.Muc == "Phiên bản plugin" && d.NoiDung.Contains("1.0.0") && d.NoiDung.Contains("1.2.0") &&
            d.MucDo == MucDo.CanhBao);
    }

    [Fact]
    public void PhienBanKhop_KhongCanhBao()
    {
        var khoi = BangDieuKhienModel.Dung(
            TrangThaiDu() with { PluginVersion = "1.2.0", ServerPluginVersion = "1.2.0" });
        Assert.Contains(khoi[0].Dong, d =>
            d.Muc == "Phiên bản plugin" && d.NoiDung.Contains("1.2.0") && d.MucDo == MucDo.Tot);
    }

    [Fact]
    public void ChuaHoiDuocServer_HienChuaRo_KhongCanhBao()
    {
        var khoi = BangDieuKhienModel.Dung(
            TrangThaiDu() with { PluginVersion = "1.0.0", ServerPluginVersion = null });
        Assert.Contains(khoi[0].Dong, d =>
            d.Muc == "Phiên bản plugin" && d.NoiDung.Contains("chưa rõ") && d.MucDo == MucDo.BinhThuong);
    }
}
