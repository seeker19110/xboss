using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M110 PR1 — phần Core THUẦN của bộ lệnh revision cloud: hình cloud quanh bao hình (FR2), mốc so
/// sánh + phân loại thêm/xóa/đổi (§4), và XData vai trò <c>Revision</c> (FR3).
///
/// Lệnh AutoCAD không chạy được trên CI nên mọi thứ có thể sai về SỐ đều đẩy xuống Core và kẹp ở
/// đây; Adapter (PR2) chỉ đổ kết quả vào <c>Polyline</c>/block tam giác.
/// </summary>
public class RevisionCoreTests
{
    // ===== Bao hình + cloud (FR2, §5 boundingPaddingMm/cloudArcMm) =====

    [Fact]
    public void Bao_hinh_tu_diem_va_noi_rong_theo_boundingPaddingMm()
    {
        var bao = BaoHinh.TuDiem([new Diem2(1000, 2000), new Diem2(4000, 500), new Diem2(2000, 2500)]);

        Assert.NotNull(bao);
        Assert.Equal(new BaoHinh(1000, 500, 4000, 2500), bao!.Value);

        var noi = bao.Value.NoiRong(200);
        Assert.Equal(new BaoHinh(800, 300, 4200, 2700), noi);
        Assert.Equal(3400, noi.Rong);
        Assert.Equal(2400, noi.Cao);
    }

    [Fact]
    public void Bao_hinh_khong_diem_nao_thi_null_khong_khoanh_buc()
    {
        Assert.Null(BaoHinh.TuDiem([]));
    }

    [Fact]
    public void Hop_bao_hinh_cu_va_moi_cho_doi_tuong_da_doi()
    {
        var cu = new BaoHinh(0, 0, 100, 100);
        var moi = new BaoHinh(50, -20, 300, 60);

        Assert.Equal(new BaoHinh(0, -20, 300, 100), cu.Hop(moi));
    }

    [Fact]
    public void So_cung_moi_canh_theo_cloudArcMm_nhan_ti_le_in()
    {
        // Vùng 3000×1000 (đã nới 0), cung 300mm ở tỉ lệ 1:1 ⇒ 10 + 10 cung cạnh dài, 3 + 3 cạnh đứng.
        var bo = RevisionCloud.Dung(new BaoHinh(0, 0, 3000, 1000), 0, 300, 1);

        Assert.Equal(26, bo.SoCung);
        Assert.Equal(bo.SoCung, bo.Dinh.Count);

        // Cùng vùng đó in ở tỉ lệ 1:50 ⇒ cung thật dài gấp 50 lần, mỗi cạnh chỉ còn 1 cung.
        var bo50 = RevisionCloud.Dung(new BaoHinh(0, 0, 3000, 1000), 0, 300, 50);
        Assert.Equal(4, bo50.SoCung);
    }

    [Fact]
    public void Cloud_om_dung_vung_da_noi_va_tam_giac_o_goc_tren_phai()
    {
        var bo = RevisionCloud.Dung(new BaoHinh(1000, 1000, 2000, 1500), 200, 300, 1);

        Assert.Equal(new BaoHinh(800, 800, 2200, 1700), bo.Vung);
        Assert.Equal(new Diem2(2200, 1700), bo.ViTriTamGiac);
        Assert.All(bo.Dinh, d => Assert.True(
            d.X >= 800 - 1e-9 && d.X <= 2200 + 1e-9 && d.Y >= 800 - 1e-9 && d.Y <= 1700 + 1e-9,
            "Đỉnh cloud nằm ngoài vùng đã nới"));

        // Bụng cung quay RA NGOÀI: đi ngược chiều kim ⇒ bulge âm ở mọi đỉnh.
        Assert.All(bo.Dinh, d => Assert.True(d.Bulge < 0));
    }

    [Fact]
    public void Canh_ngan_hon_mot_cung_van_duoc_mot_cung()
    {
        Assert.Equal(1, RevisionCloud.SoCungCanh(10, 300));
        Assert.Equal(1, RevisionCloud.SoCungCanh(0, 300));
        Assert.Equal(4, RevisionCloud.Dung(new BaoHinh(0, 0, 10, 10), 0, 300, 1).SoCung);
    }

    [Fact]
    public void Tham_so_vo_nghia_thi_nem_thay_vi_ve_bua()
    {
        var bao = new BaoHinh(0, 0, 100, 100);
        Assert.Throws<ArgumentOutOfRangeException>(() => RevisionCloud.Dung(bao, 0, 0, 1));
        Assert.Throws<ArgumentOutOfRangeException>(() => RevisionCloud.Dung(bao, 0, 300, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => RevisionCloud.Dung(bao, -1, 300, 1));
    }

    // ===== Băm hình học (§4) =====

    [Fact]
    public void Bam_hinh_hoc_on_dinh_qua_lam_tron_0_1mm()
    {
        var a = RevisionSnapshot.BamHinhHoc([new Diem2(0, 0), new Diem2(1000.00, 500.02)]);
        var b = RevisionSnapshot.BamHinhHoc([new Diem2(0.004, -0.004), new Diem2(999.98, 500.0)]);

        Assert.Equal(a, b);
        Assert.Equal(64, a.Length);
    }

    [Fact]
    public void Bam_hinh_hoc_doi_khi_doi_qua_nguong_0_1mm()
    {
        var a = RevisionSnapshot.BamHinhHoc([new Diem2(0, 0), new Diem2(1000, 500)]);
        var b = RevisionSnapshot.BamHinhHoc([new Diem2(0, 0), new Diem2(1000.2, 500)]);

        Assert.NotEqual(a, b);
    }

    [Fact]
    public void Bam_hinh_hoc_co_thu_tu_dinh_dao_thu_tu_la_hash_doi()
    {
        var a = RevisionSnapshot.BamHinhHoc([new Diem2(0, 0), new Diem2(1000, 500)]);
        var b = RevisionSnapshot.BamHinhHoc([new Diem2(1000, 500), new Diem2(0, 0)]);

        Assert.NotEqual(a, b);
    }

    // ===== So mốc (§4, AC2) =====

    private static MucMoc Muc(string handle, VaiTroVe vaiTro, string size, string hash, BaoHinh bao) =>
        new(handle, vaiTro, "HVAC", "duct-supp", size, hash, bao);

    [Fact]
    public void So_moc_ra_dung_3_nhom_them_xoa_doi()
    {
        var baoCu = new BaoHinh(0, 0, 100, 100);
        var baoMoi = new BaoHinh(500, 500, 600, 600);

        var moc = new List<MucMoc>
        {
            Muc("A1", VaiTroVe.Tim, "300x200", "h-doi-cho", baoCu),          // dời tuyến → Đổi
            Muc("A2", VaiTroVe.Tim, "300x200", "h-giu-nguyen", baoCu),        // đổi cỡ  → Đổi
            Muc("A3", VaiTroVe.PhuKien, "DN50", "h-phukien", baoCu),          // bị xóa  → Xóa
            Muc("A4", VaiTroVe.Tim, "200x200", "h-yen", baoCu),               // không đụng
        };
        var hienTai = new List<MucMoc>
        {
            Muc("A1", VaiTroVe.Tim, "300x200", "h-da-doi", baoMoi),
            Muc("A2", VaiTroVe.Tim, "400x200", "h-giu-nguyen", baoCu),
            Muc("A4", VaiTroVe.Tim, "200x200", "h-yen", baoCu),
            Muc("A9", VaiTroVe.ThietBi, "FCU-01", "h-thietbi", baoMoi),       // mới thêm → Thêm
        };

        var thayDoi = RevisionSnapshot.SoMoc(moc, hienTai);

        Assert.Equal(4, thayDoi.Count);
        Assert.Equal(LoaiThayDoi.Doi, thayDoi.Single(t => t.Handle == "A1").Loai);
        Assert.Equal(LoaiThayDoi.Doi, thayDoi.Single(t => t.Handle == "A2").Loai);
        Assert.Equal(LoaiThayDoi.Them, thayDoi.Single(t => t.Handle == "A9").Loai);
        Assert.DoesNotContain(thayDoi, t => t.Handle == "A4");

        // Đổi vị trí → vùng khoanh là HỢP bao hình cũ + mới (§4).
        Assert.Equal(baoCu.Hop(baoMoi), thayDoi.Single(t => t.Handle == "A1").Vung);

        // Phụ kiện đã xóa → khoanh tại VỊ TRÍ CŨ lấy từ mốc (AC2).
        var xoa = thayDoi.Single(t => t.Handle == "A3");
        Assert.Equal(LoaiThayDoi.Xoa, xoa.Loai);
        Assert.Equal(baoCu, xoa.Vung);
        Assert.Equal(VaiTroVe.PhuKien, xoa.VaiTro);
    }

    [Fact]
    public void Chua_tung_chot_revision_thi_moi_doi_tuong_deu_la_them()
    {
        var thayDoi = RevisionSnapshot.SoMoc(
            [], [Muc("A1", VaiTroVe.Tim, "300x200", "h", new BaoHinh(0, 0, 10, 10))]);

        Assert.Equal(LoaiThayDoi.Them, Assert.Single(thayDoi).Loai);
    }

    [Fact]
    public void Moc_khong_khop_handle_nao_thi_bi_coi_la_vo_hieu()
    {
        var bao = new BaoHinh(0, 0, 10, 10);
        var moc = new List<MucMoc> { Muc("A1", VaiTroVe.Tim, "300x200", "h", bao) };
        var khac = new List<MucMoc> { Muc("Z9", VaiTroVe.Tim, "300x200", "h", bao) };

        Assert.True(RevisionSnapshot.MocVoHieu(moc, khac));
        Assert.False(RevisionSnapshot.MocVoHieu(moc, moc));
        Assert.False(RevisionSnapshot.MocVoHieu([], khac));
    }

    [Fact]
    public void Chi_theo_doi_4_vai_tro_hinh_hoc_nghiep_vu()
    {
        Assert.True(RevisionSnapshot.TheoDoi(VaiTroVe.Tim));
        Assert.True(RevisionSnapshot.TheoDoi(VaiTroVe.PhuKien));
        Assert.True(RevisionSnapshot.TheoDoi(VaiTroVe.ThietBi));
        Assert.True(RevisionSnapshot.TheoDoi(VaiTroVe.LoCho));
        Assert.False(RevisionSnapshot.TheoDoi(VaiTroVe.Nhan));
        Assert.False(RevisionSnapshot.TheoDoi(VaiTroVe.Revision));
    }

    [Fact]
    public void Ma_hoa_giai_ma_moc_giu_nguyen_noi_dung_va_bo_qua_dong_hong()
    {
        var moc = new List<MucMoc>
        {
            Muc("A1", VaiTroVe.Tim, "300x200", "abc123", new BaoHinh(-10.5, 0, 100.25, 50)),
            Muc("A2", VaiTroVe.LoCho, "DN50", "def456", new BaoHinh(0, 0, 1, 1)),
        };

        var dong = RevisionSnapshot.MaHoa(moc);
        var lai = RevisionSnapshot.GiaiMa([.. dong, "dòng-hỏng", "a|b|c"]);

        Assert.Equal(moc, lai);
    }

    // ===== XData vai trò Revision (FR3) =====

    [Fact]
    public void XData_revision_giu_so_revision_handle_cap_doi_va_handle_trong_vung()
    {
        var tt = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Revision,
            RulePackVersion = "v12",
            SoRevision = 2,
            HandleCapDoi = "3F1",
            HandleTrongVung = ["A1", "A2", "A3"],
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(tt));

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.Revision, lai!.VaiTro);
        Assert.Equal(2, lai.SoRevision);
        Assert.Equal("3F1", lai.HandleCapDoi);
        Assert.Equal(new[] { "A1", "A2", "A3" }, lai.HandleTrongVung);
    }

    [Fact]
    public void XData_khong_phai_revision_thi_khong_mang_khoa_revision()
    {
        var lai = VeXData.GiaiMa(VeXData.MaHoa(new VeXDataInfo { VaiTro = VaiTroVe.Tim }));

        Assert.NotNull(lai);
        Assert.Null(lai!.SoRevision);
        Assert.Null(lai.HandleCapDoi);
        Assert.Empty(lai.HandleTrongVung);
    }
}
