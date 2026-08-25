using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR7 — rải giá đỡ dọc tuyến (§6.7, FR9c, AC12). Adapter chỉ chèn block, toàn bộ luật
/// "đặt mấy cái, đặt ở đâu, chạy lại có thêm không" bị kẹp ở đây.
/// </summary>
public class SupportSpacingTests
{
    /// <summary>Tuyến thẳng nằm ngang dài <paramref name="dai"/> đơn vị bản vẽ.</summary>
    private static List<DinhPolyline> Thang(double dai) => [new(0, 0, 0), new(dai, 0, 0)];

    // ===== AC12 =====

    [Fact]
    public void AC12_tuyen_10m_khoang_cach_2400_ra_dung_5_gia_do_hai_dau()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), khoangCach: 2400);

        Assert.Equal(5, kq.CanDat.Count);
        Assert.Empty(kq.DaCo);
        Assert.Equal(new double[] { 0, 2500, 5000, 7500, 10_000 }, kq.CanDat.Select(v => v.KhoangCachDoc));
        Assert.Equal(2500, kq.BuocThat, 9);
        Assert.Equal(VaiTroViTriGiaDo.DauCuoi, kq.CanDat[0].VaiTro);
        Assert.Equal(VaiTroViTriGiaDo.DauCuoi, kq.CanDat[^1].VaiTro);
    }

    [Fact]
    public void AC12_buoc_that_vuot_chuan_thi_phai_canh_bao_khong_im_lang()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), khoangCach: 2400);

        // 5 giá đỡ ⇒ 4 khoảng × 2500 > 2400: sự thật này phải hiện ra dòng lệnh, không giấu.
        Assert.Single(kq.CanhBao);
        Assert.Contains("2400", kq.CanhBao[0]);
        Assert.Contains("KHONGVUOT", kq.CanhBao[0]);
    }

    [Fact]
    public void AC12_chay_lai_tren_tuyen_da_co_gia_do_thi_khong_them_cai_nao()
    {
        var kq = SupportSpacing.Tinh(
            Thang(10_000), khoangCach: 2400, daCoDoc: [0, 2500, 5000, 7500, 10_000]);

        Assert.Empty(kq.CanDat);
        Assert.Equal(5, kq.DaCo.Count);
        Assert.Equal(5, kq.TongViTri);
    }

    [Fact]
    public void Chay_lai_khi_moi_co_mot_nua_thi_chi_bo_sung_doan_thieu()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), khoangCach: 2400, daCoDoc: [0, 2500]);

        Assert.Equal(new double[] { 5000, 7500, 10_000 }, kq.CanDat.Select(v => v.KhoangCachDoc));
        Assert.Equal(2, kq.DaCo.Count);
    }

    [Fact]
    public void Che_do_KHONGVUOT_ra_6_gia_do_buoc_2000_va_khong_canh_bao()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), 2400, cheDo: CheDoChiaGiaDo.KhongVuot);

        Assert.Equal(6, kq.CanDat.Count);
        Assert.Equal(2000, kq.BuocThat, 9);
        Assert.Empty(kq.CanhBao);
    }

    // ===== Chia đều =====

    [Fact]
    public void Chieu_dai_chia_het_thi_buoc_that_dung_bang_chuan()
    {
        var kq = SupportSpacing.Tinh(Thang(9600), 2400);

        Assert.Equal(5, kq.CanDat.Count);
        Assert.Equal(2400, kq.BuocThat, 9);
        Assert.Empty(kq.CanhBao);
    }

    [Fact]
    public void Tuyen_ngan_hon_mot_buoc_van_co_gia_do_hai_dau()
    {
        var kq = SupportSpacing.Tinh(Thang(1000), 2400);

        Assert.Equal(2, kq.CanDat.Count);
        Assert.Equal(new double[] { 0, 1000 }, kq.CanDat.Select(v => v.KhoangCachDoc));
    }

    [Fact]
    public void Khoang_cach_chua_khai_thi_tu_choi_kem_ly_do_khong_bia_so()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), 0);

        Assert.Empty(kq.CanDat);
        Assert.Contains("supportSpacingMm", kq.CanhBao[0]);
    }

    [Fact]
    public void Tuyen_khong_co_chieu_dai_thi_bao_ro_khong_nem_loi()
    {
        var kq = SupportSpacing.Tinh([new DinhPolyline(0, 0, 0), new DinhPolyline(0, 0, 0)], 2400);

        Assert.Empty(kq.CanDat);
        Assert.Single(kq.CanhBao);
    }

    // ===== Phụ kiện nặng =====

    [Fact]
    public void Phu_kien_nang_luon_co_gia_do_du_khong_roi_vao_luoi_chia_deu()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), 2400, phuKienDoc: [6000]);

        var tai6000 = Assert.Single(kq.CanDat, v => Math.Abs(v.KhoangCachDoc - 6000) < 1e-9);
        Assert.Equal(VaiTroViTriGiaDo.PhuKien, tai6000.VaiTro);
        Assert.Equal(6, kq.CanDat.Count);
    }

    [Fact]
    public void Phu_kien_nang_sat_vi_tri_chia_deu_thi_khong_dat_hai_cai_canh_nhau()
    {
        // dung sai mặc định = 1/4 bước (2500/4 = 625) ⇒ 5200 nuốt vị trí chia đều 5000.
        var kq = SupportSpacing.Tinh(Thang(10_000), 2400, phuKienDoc: [5200]);

        Assert.Equal(5, kq.CanDat.Count);
        Assert.DoesNotContain(kq.CanDat, v => Math.Abs(v.KhoangCachDoc - 5000) < 1e-9);
        Assert.Contains(kq.CanDat, v => Math.Abs(v.KhoangCachDoc - 5200) < 1e-9);
    }

    // ===== Hình học =====

    [Fact]
    public void Gia_do_xoay_vuong_goc_tuyen()
    {
        var kq = SupportSpacing.Tinh(Thang(10_000), 2400);

        Assert.Equal(0, kq.CanDat[1].GocTiepTuyen, 9);
        Assert.Equal(Math.PI / 2, kq.CanDat[1].GocVuongGoc, 9);
        Assert.Equal(2500, kq.CanDat[1].Diem.X, 6);
        Assert.Equal(0, kq.CanDat[1].Diem.Y, 6);
    }

    [Fact]
    public void Tuyen_gay_khuc_dat_dung_diem_tren_doan_sau()
    {
        List<DinhPolyline> chuL = [new(0, 0, 0), new(3000, 0, 0), new(3000, 3000, 0)];

        var kq = SupportSpacing.Tinh(chuL, 2000);

        Assert.Equal(4, kq.CanDat.Count); // 6000 / 2000 = 3 khoảng
        var tai4000 = kq.CanDat[2];
        Assert.Equal(4000, tai4000.KhoangCachDoc, 9);
        Assert.Equal(3000, tai4000.Diem.X, 6);
        Assert.Equal(1000, tai4000.Diem.Y, 6);
        Assert.Equal(Math.PI / 2, tai4000.GocTiepTuyen, 6); // đang đi lên theo +Y
    }

    [Fact]
    public void Doan_cung_tinh_dung_chieu_dai_va_diem_giua()
    {
        // Nửa đường tròn bán kính 1000 (bulge = 1): dài = π·1000.
        List<DinhPolyline> cung = [new(0, 0, 1), new(2000, 0, 0)];

        Assert.Equal(Math.PI * 1000, SupportSpacing.ChieuDaiTuyen(cung), 6);

        // Nửa vòng: tâm (1000,0), bulge dương = NGƯỢC chiều kim ⇒ điểm giữa cung nằm dưới trục X
        // (đúng quy ước BulgeMath đang dùng cho EdgeOffset/FittingPlacement).
        var giua = SupportSpacing.TaiKhoangCach(cung, Math.PI * 500);
        Assert.NotNull(giua);
        Assert.Equal(1000, giua!.Value.Diem.X, 6);
        Assert.Equal(-1000, giua.Value.Diem.Y, 6);
        Assert.Equal(0, giua.Value.Goc, 6); // đáy vòng tròn: tiếp tuyến nằm ngang, đi theo +X
    }

    [Fact]
    public void Quy_doi_diem_tren_ban_ve_ve_khoang_cach_doc_tuyen()
    {
        List<DinhPolyline> chuL = [new(0, 0, 0), new(3000, 0, 0), new(3000, 3000, 0)];

        Assert.Equal(2000, SupportSpacing.KhoangCachDocCua(chuL, new Diem2(2000, 0))!.Value, 6);
        // Điểm bấm lệch khỏi tim vẫn quy về đúng vị trí trên tim.
        Assert.Equal(4500, SupportSpacing.KhoangCachDocCua(chuL, new Diem2(3050, 1500))!.Value, 6);
    }

    [Fact]
    public void Tuyen_kin_khong_dat_hai_gia_do_chong_nhau_o_diem_khep()
    {
        List<DinhPolyline> vuong = [new(0, 0, 0), new(1000, 0, 0), new(1000, 1000, 0), new(0, 1000, 0)];

        var kq = SupportSpacing.Tinh(vuong, 1000, kin: true);

        Assert.Equal(4000, kq.ChieuDai, 6);
        Assert.Equal(4, kq.CanDat.Count);
        Assert.Equal(new double[] { 0, 1000, 2000, 3000 }, kq.CanDat.Select(v => v.KhoangCachDoc));
    }
}
