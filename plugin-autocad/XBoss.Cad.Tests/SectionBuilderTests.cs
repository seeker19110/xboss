using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR6 — dựng khung mặt cắt (AC11, FR9b). Toàn bộ hình học của <c>XBOSS_VE_MATCAT</c> nằm ở
/// đây vì Adapter không build được trên CI: Adapter chỉ còn bấm điểm, hỏi cao độ và vẽ.
/// </summary>
public class SectionBuilderTests
{
    private static TimMatCat Tim(
        string handle, string itemId, string size, string sizeKind, params (double X, double Y)[] dinh) =>
        new()
        {
            Handle = handle,
            HeId = "HVAC",
            ItemId = itemId,
            Size = size,
            SizeKind = sizeKind,
            Layer = "M-DUCT-SUPP",
            Dinh = dinh.Select(d => new DinhPolyline(d.X, d.Y, 0)).ToList(),
        };

    /// <summary>Tuyến đứng (song song trục Y) đi qua x — cắt ngang tuyến cắt nằm ngang.</summary>
    private static TimMatCat TimDung(string handle, string itemId, string size, string sizeKind, double x) =>
        Tim(handle, itemId, size, sizeKind, (x, -2000), (x, 2000));

    // ===== AC11 =====

    [Fact]
    public void AC11_ba_tuyen_ra_ba_ky_hieu_dung_loai_kich_thuoc_va_khoang_cach_ngang()
    {
        var tim = new[]
        {
            TimDung("A1", "duct-supp", "300x200", "WxH", 1000),
            TimDung("B2", "chw-pipe", "DN50", "DN", 3000),
            TimDung("C3", "tray-pwr", "200x100", "WxH", 6000),
        };

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), tim, 1.0);

        Assert.Empty(kq.CanhBao);
        Assert.Equal(3, kq.KyHieu.Count);

        Assert.Equal(LoaiKyHieuMatCat.ChuNhat, kq.KyHieu[0].Loai);
        Assert.Equal(300, kq.KyHieu[0].RongDv, 6);
        Assert.Equal(200, kq.KyHieu[0].CaoDv, 6);
        Assert.Equal("300x200", kq.KyHieu[0].Nhan);
        Assert.Equal(0, kq.KyHieu[0].LechNgang, 6);

        Assert.Equal(LoaiKyHieuMatCat.Tron, kq.KyHieu[1].Loai);
        Assert.Equal(50, kq.KyHieu[1].RongDv, 6);
        Assert.Equal(50, kq.KyHieu[1].CaoDv, 6);
        Assert.Equal(2000, kq.KyHieu[1].LechNgang, 6);

        Assert.Equal(LoaiKyHieuMatCat.MangCap, kq.KyHieu[2].Loai);
        Assert.Equal(200, kq.KyHieu[2].RongDv, 6);
        Assert.Equal(100, kq.KyHieu[2].CaoDv, 6);
        Assert.Equal(5000, kq.KyHieu[2].LechNgang, 6);

        // Khoảng cách ngang giữa các ký hiệu = khoảng cách thật giữa các tim (2000 và 3000).
        Assert.Equal(2000, kq.KyHieu[1].LechNgang - kq.KyHieu[0].LechNgang, 6);
        Assert.Equal(3000, kq.KyHieu[2].LechNgang - kq.KyHieu[1].LechNgang, 6);
    }

    [Fact]
    public void Ke_tuyen_cat_nguoc_chieu_thi_thu_tu_ky_hieu_dao_lai()
    {
        var tim = new[]
        {
            TimDung("A1", "duct-supp", "300x200", "WxH", 1000),
            TimDung("C3", "tray-pwr", "200x100", "WxH", 6000),
        };

        var kq = SectionBuilder.Dung(new Diem2(10000, 0), new Diem2(0, 0), tim, 1.0);

        Assert.Equal(2, kq.KyHieu.Count);
        Assert.Equal("C3", kq.KyHieu[0].Tim.Handle);
        Assert.Equal(5000, kq.KyHieu[1].LechNgang, 6);
    }

    // ===== Tuyến song song =====

    [Fact]
    public void Tuyen_song_song_va_nam_tren_tuyen_cat_thi_bo_qua_kem_canh_bao()
    {
        var doc = Tim("D4", "duct-supp", "300x200", "WxH", (500, 0), (5000, 0));

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [doc], 1.0);

        Assert.Empty(kq.KyHieu);
        var canhBao = Assert.Single(kq.CanhBao);
        Assert.Contains("song song", canhBao);
        Assert.Contains("D4", canhBao);
    }

    [Fact]
    public void Tuyen_song_song_nhung_o_xa_thi_khong_canh_bao_oan()
    {
        var doc = Tim("D4", "duct-supp", "300x200", "WxH", (500, 5000), (5000, 5000));

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [doc], 1.0);

        Assert.Empty(kq.KyHieu);
        Assert.Empty(kq.CanhBao);
    }

    [Fact]
    public void Tuyen_lech_4_do_van_coi_la_song_song_con_10_do_thi_cat_binh_thuong()
    {
        // Ngưỡng song song = 5°: 4° → bỏ qua, 10° → dựng ký hiệu.
        static TimMatCat Xien(string handle, double goc) => Tim(
            handle, "duct-supp", "300x200", "WxH",
            (2000, 0),
            (2000 + 3000 * Math.Cos(goc * Math.PI / 180), 3000 * Math.Sin(goc * Math.PI / 180)));

        var lech4 = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [Xien("X4", 4)], 1.0);
        Assert.Empty(lech4.KyHieu);
        Assert.Single(lech4.CanhBao);

        var lech10 = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [Xien("X10", 10)], 1.0);
        Assert.Single(lech10.KyHieu);
        Assert.Empty(lech10.CanhBao);
    }

    // ===== Trạng thái biên =====

    [Fact]
    public void Tuyen_khong_cat_qua_thi_khong_sinh_ky_hieu_va_khong_canh_bao()
    {
        var kq = SectionBuilder.Dung(
            new Diem2(0, 0), new Diem2(10000, 0), [TimDung("Z9", "duct-supp", "300x200", "WxH", 20000)], 1.0);

        Assert.Empty(kq.KyHieu);
        Assert.Empty(kq.CanhBao);
    }

    [Fact]
    public void Size_khong_doc_duoc_thi_bo_qua_kem_canh_bao_khong_bia_kich_thuoc()
    {
        var kq = SectionBuilder.Dung(
            new Diem2(0, 0), new Diem2(10000, 0), [TimDung("E5", "duct-supp", "ống to", "WxH", 1000)], 1.0);

        Assert.Empty(kq.KyHieu);
        Assert.Contains("không đọc được kích thước", Assert.Single(kq.CanhBao));
    }

    [Fact]
    public void Tuyen_cat_hai_diem_trung_nhau_thi_bao_loi_khong_dung_gi()
    {
        var kq = SectionBuilder.Dung(
            new Diem2(500, 500), new Diem2(500, 500), [TimDung("A1", "duct-supp", "300x200", "WxH", 500)], 1.0);

        Assert.Empty(kq.KyHieu);
        Assert.Contains("Tuyến cắt quá ngắn", Assert.Single(kq.CanhBao));
    }

    [Fact]
    public void Tuyen_chu_U_cat_hai_lan_thi_ra_hai_ky_hieu()
    {
        var u = Tim("U1", "chw-pipe", "DN50", "DN", (1000, 2000), (1000, -2000), (4000, -2000), (4000, 2000));

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [u], 1.0);

        Assert.Equal(2, kq.KyHieu.Count);
        Assert.Equal(0, kq.KyHieu[0].LechNgang, 6);
        Assert.Equal(3000, kq.KyHieu[1].LechNgang, 6);
    }

    [Fact]
    public void Giao_dung_dinh_chung_cua_hai_doan_chi_tinh_mot_lan()
    {
        // Đỉnh gãy nằm ĐÚNG trên tuyến cắt: 2 đoạn cùng cho 1 giao điểm — không được đếm đôi.
        var gay = Tim("G1", "chw-pipe", "DN50", "DN", (1000, -2000), (2000, 0), (3000, 2000));

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10000, 0), [gay], 1.0);

        Assert.Single(kq.KyHieu);
        Assert.Equal(2000, kq.KyHieu[0].KhoangCachDoc, 6);
    }

    // ===== Cung tròn =====

    [Fact]
    public void Cung_tron_cat_tuyen_cat_ra_dung_giao_diem()
    {
        // Nửa cung ngược kim tâm (2000, 0) bán kính 1000: từ (3000,0) tới (1000,0) —
        // đỉnh cung ở (2000, 1000). Tuyến cắt y = 500 cắt cung tại x = 2000 ± 866.03.
        var cung = new TimMatCat
        {
            Handle = "K1",
            ItemId = "chw-pipe",
            Size = "DN50",
            SizeKind = "DN",
            Dinh = [new DinhPolyline(3000, 0, 1.0), new DinhPolyline(1000, 0, 0)],
        };

        var kq = SectionBuilder.Dung(new Diem2(0, 500), new Diem2(10000, 500), [cung], 1.0);

        Assert.Equal(2, kq.KyHieu.Count);
        var x = kq.KyHieu.Select(k => k.GiaoDiem.X).OrderBy(v => v).ToList();
        Assert.Equal(2000 - Math.Sqrt(1000.0 * 1000 - 500 * 500), x[0], 3);
        Assert.Equal(2000 + Math.Sqrt(1000.0 * 1000 - 500 * 500), x[1], 3);
        Assert.All(kq.KyHieu, k => Assert.Equal(500, k.GiaoDiem.Y, 6));
    }

    [Fact]
    public void Tuyen_cat_tiep_tuyen_dinh_cung_thi_coi_la_song_song_bo_qua()
    {
        var cung = new TimMatCat
        {
            Handle = "K2",
            ItemId = "chw-pipe",
            Size = "DN50",
            SizeKind = "DN",
            Dinh = [new DinhPolyline(3000, 0, 1.0), new DinhPolyline(1000, 0, 0)],
        };

        // y = 1000 chạm đúng đỉnh cung → tiếp tuyến nằm ngang, cùng phương tuyến cắt.
        var kq = SectionBuilder.Dung(new Diem2(0, 1000), new Diem2(10000, 1000), [cung], 1.0);

        Assert.Empty(kq.KyHieu);
        Assert.Contains("song song", Assert.Single(kq.CanhBao));
    }

    [Fact]
    public void Cung_khong_cham_tuyen_cat_thi_khong_ra_giao_diem()
    {
        var cung = new TimMatCat
        {
            Handle = "K3",
            ItemId = "chw-pipe",
            Size = "DN50",
            SizeKind = "DN",
            Dinh = [new DinhPolyline(3000, 0, 1.0), new DinhPolyline(1000, 0, 0)],
        };

        // Nửa dưới đường tròn KHÔNG thuộc cung → tuyến cắt y = -500 không cắt gì.
        var kq = SectionBuilder.Dung(new Diem2(0, -500), new Diem2(10000, -500), [cung], 1.0);

        Assert.Empty(kq.KyHieu);
    }

    // ===== Đơn vị bản vẽ =====

    [Fact]
    public void Ban_ve_don_vi_met_quy_doi_dung_kich_thuoc_ky_hieu()
    {
        var tim = Tim("M1", "duct-supp", "300x200", "WxH", (1, -2), (1, 2));

        var kq = SectionBuilder.Dung(new Diem2(0, 0), new Diem2(10, 0), [tim], 1000.0);

        var kh = Assert.Single(kq.KyHieu);
        Assert.Equal(0.3, kh.RongDv, 9);
        Assert.Equal(0.2, kh.CaoDv, 9);
    }

    // ===== Cao độ nhập tay + hình ký hiệu =====

    [Fact]
    public void ToaDoKyHieu_dat_tam_dung_cao_do_nhap_tay_va_khoang_cach_ngang()
    {
        var kq = SectionBuilder.Dung(
            new Diem2(0, 0), new Diem2(10000, 0),
            [TimDung("A1", "duct-supp", "300x200", "WxH", 1000), TimDung("B2", "chw-pipe", "DN50", "DN", 3500)],
            1.0);

        var dat = new Diem2(50000, 10000);
        var tam0 = SectionBuilder.ToaDoKyHieu(kq.KyHieu[0], dat, 2700);
        var tam1 = SectionBuilder.ToaDoKyHieu(kq.KyHieu[1], dat, 3000);

        Assert.Equal(50000, tam0.X, 6);
        Assert.Equal(12700, tam0.Y, 6);
        Assert.Equal(52500, tam1.X, 6);
        Assert.Equal(13000, tam1.Y, 6);
    }

    [Fact]
    public void Khung_chu_nhat_va_net_day_mang_dung_toa_do()
    {
        var goc = SectionBuilder.KhungChuNhat(new Diem2(100, 200), 300, 200);
        Assert.Equal(4, goc.Count);
        Assert.Equal(new Diem2(-50, 100), goc[0]);
        Assert.Equal(new Diem2(250, 100), goc[1]);
        Assert.Equal(new Diem2(250, 300), goc[2]);
        Assert.Equal(new Diem2(-50, 300), goc[3]);

        var (trai, phai) = SectionBuilder.NetDayMang(new Diem2(0, 0), 200, 100);
        Assert.Equal(new Diem2(-100, -25), trai);
        Assert.Equal(new Diem2(100, -25), phai);
    }
}
