using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR3 — hình học cung (bulge) + diễn giải size + XData của bộ lệnh vẽ.
/// Đây là toàn bộ phần "tính được" của XBOSS_VE: Adapter chỉ còn gọi API AutoCAD, nên
/// mọi công thức phải bị kẹp chặt ở đây (Adapter không build được trên CI — M100 §9).
/// </summary>
public class DrawGeometryTests
{
    private const double Do = Math.PI / 180;

    [Fact]
    public void Cung_1_4_nguoc_kim_ra_dung_tam_ban_kinh_chieu()
    {
        var bulge = Math.Tan(22.5 * Do);
        var cung = BulgeMath.Cung(new Diem2(1000, 0), new Diem2(0, 1000), bulge);

        Assert.NotNull(cung);
        Assert.Equal(0, cung!.Value.Tam.X, 6);
        Assert.Equal(0, cung.Value.Tam.Y, 6);
        Assert.Equal(1000, cung.Value.BanKinh, 6);
        Assert.True(cung.Value.NguocKim);
        Assert.Equal(90 * Do, BulgeMath.GocMo(bulge), 9);
    }

    [Fact]
    public void Cung_thuan_kim_giu_ban_kinh_duong_va_bao_dung_chieu()
    {
        var cung = BulgeMath.Cung(new Diem2(0, 1000), new Diem2(1000, 0), -Math.Tan(22.5 * Do));

        Assert.NotNull(cung);
        Assert.Equal(0, cung!.Value.Tam.X, 6);
        Assert.Equal(0, cung.Value.Tam.Y, 6);
        Assert.Equal(1000, cung.Value.BanKinh, 6);
        Assert.False(cung.Value.NguocKim);
    }

    [Fact]
    public void Doan_thang_khong_phai_cung()
    {
        Assert.Null(BulgeMath.Cung(new Diem2(0, 0), new Diem2(100, 0), 0));
        Assert.True(BulgeMath.LaThang(0));
        Assert.False(BulgeMath.LaThang(0.001));
    }

    [Fact]
    public void Huong_tiep_tuyen_dau_cuoi_dung_voi_cung_1_4()
    {
        var bulge = Math.Tan(22.5 * Do);
        var dau = new Diem2(1000, 0);
        var cuoi = new Diem2(0, 1000);

        Assert.Equal(90 * Do, BulgeMath.HuongDauDoan(dau, cuoi, bulge), 9);
        Assert.Equal(180 * Do, BulgeMath.HuongCuoiDoan(dau, cuoi, bulge), 9);
        // Đoạn thẳng: hướng vào = hướng ra = hướng dây cung.
        Assert.Equal(0, BulgeMath.HuongDauDoan(new Diem2(0, 0), new Diem2(500, 0), 0), 9);
        Assert.Equal(0, BulgeMath.HuongCuoiDoan(new Diem2(0, 0), new Diem2(500, 0), 0), 9);
    }

    [Fact]
    public void Bulge_tiep_tuyen_dung_cong_thuc_PLINE_che_do_cung()
    {
        // Đang chạy hướng +X tại (0,0), bấm điểm (1000,1000) ⇒ cung 1/4 ngược kim.
        var bulge = BulgeMath.BulgeTiepTuyen(new Diem2(0, 0), 0, new Diem2(1000, 1000));

        Assert.NotNull(bulge);
        Assert.Equal(Math.Tan(22.5 * Do), bulge!.Value, 9);
        var cung = BulgeMath.Cung(new Diem2(0, 0), new Diem2(1000, 1000), bulge.Value);
        Assert.NotNull(cung);
        Assert.Equal(0, cung!.Value.Tam.X, 6);
        Assert.Equal(1000, cung.Value.Tam.Y, 6);
    }

    [Fact]
    public void Bulge_tiep_tuyen_diem_nam_nguoc_huong_thi_khong_co_cung()
    {
        Assert.Null(BulgeMath.BulgeTiepTuyen(new Diem2(0, 0), 0, new Diem2(-500, 0)));
        Assert.Null(BulgeMath.BulgeTiepTuyen(new Diem2(0, 0), 0, new Diem2(0, 0)));
        // Điểm thẳng phía trước ⇒ bulge 0 (đoạn thẳng), không phải null.
        Assert.Equal(0, BulgeMath.BulgeTiepTuyen(new Diem2(0, 0), 0, new Diem2(500, 0))!.Value, 12);
    }

    [Fact]
    public void Chieu_dai_doan_thang_va_cung()
    {
        Assert.Equal(1000, BulgeMath.ChieuDaiDoan(new Diem2(0, 0), new Diem2(1000, 0), 0), 9);
        // Nửa vòng tròn R=1000 ⇒ π·1000.
        Assert.Equal(Math.PI * 1000, BulgeMath.ChieuDaiDoan(new Diem2(0, 0), new Diem2(2000, 0), 1), 6);
    }

    [Theory]
    [InlineData("300x200", 300, 200)]
    [InlineData("1000X400", 1000, 400)]
    [InlineData("300 x 200", 300, 200)]
    [InlineData("200*150", 200, 150)]
    public void Size_WxH_doc_ra_rong_va_cao(string size, double rong, double cao)
    {
        var kt = DrawSize.PhanTich(size);
        Assert.NotNull(kt);
        Assert.Equal(rong, kt!.RongMm);
        Assert.Equal(cao, kt.CaoMm);
    }

    [Theory]
    [InlineData("DN50", 50)]
    [InlineData("dn125", 125)]
    [InlineData("350", 350)]
    public void Size_DN_doc_ra_duong_kinh_khong_co_chieu_cao(string size, double dn)
    {
        var kt = DrawSize.PhanTich(size);
        Assert.NotNull(kt);
        Assert.Equal(dn, kt!.RongMm);
        Assert.Null(kt.CaoMm);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("ống to")]
    [InlineData("0x200")]
    public void Size_khong_doc_duoc_tra_null(string? size) => Assert.Null(DrawSize.PhanTich(size));

    [Fact]
    public void Nhan_tuyen_ghep_size_va_do_doc()
    {
        Assert.Equal("300x200", DrawSize.NhanTuyen("300x200", null));
        Assert.Equal("300x200", DrawSize.NhanTuyen("300x200", "  "));
        Assert.Equal("DN100  i=2%", DrawSize.NhanTuyen("DN100", "2%"));
    }

    [Fact]
    public void XData_tim_ma_hoa_giai_ma_khong_mat_du_lieu()
    {
        var tt = new VeXDataInfo
        {
            VaiTro = VaiTroVe.Tim,
            HeId = "HVAC",
            ItemId = "duct-supp",
            Size = "300x200",
            RulePackVersion = "v4",
            SizeTuNhap = true,
            DoDoc = "2%",
            HandleBien = ["2A1", "2A2"],
            HandleNhan = ["2B7"],
        };

        var lai = VeXData.GiaiMa(VeXData.MaHoa(tt));

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.Tim, lai!.VaiTro);
        Assert.Equal("HVAC", lai.HeId);
        Assert.Equal("duct-supp", lai.ItemId);
        Assert.Equal("300x200", lai.Size);
        Assert.Equal("v4", lai.RulePackVersion);
        Assert.True(lai.SizeTuNhap);
        Assert.Equal("2%", lai.DoDoc);
        Assert.Equal(new[] { "2A1", "2A2" }, lai.HandleBien);
        Assert.Equal(new[] { "2B7" }, lai.HandleNhan);
        Assert.Null(lai.HandleTim);
    }

    [Fact]
    public void XData_bien_giu_handle_tim()
    {
        var lai = VeXData.GiaiMa(VeXData.MaHoa(new VeXDataInfo { VaiTro = VaiTroVe.Bien, HandleTim = "1F3" }));

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.Bien, lai!.VaiTro);
        Assert.Equal("1F3", lai.HandleTim);
        Assert.False(lai.SizeTuNhap);
        Assert.Empty(lai.HandleBien);
    }

    [Fact]
    public void XData_cua_app_khac_hoac_rong_thi_khong_nhan_nham()
    {
        Assert.Null(VeXData.GiaiMa([]));
        Assert.Null(VeXData.GiaiMa(["duct-supp", "v4", "2026-08-25", "bylayer"])); // đúng dạng XBOSS_BOCKL
    }

    [Fact]
    public void XData_khoa_la_cua_ban_moi_hon_bi_bo_qua_chu_khong_lam_hong()
    {
        var lai = VeXData.GiaiMa(["ve=9", "vaitro=nhan", "tim=42", "giado=7", "matcat=A-A"]);

        Assert.NotNull(lai);
        Assert.Equal(VaiTroVe.Nhan, lai!.VaiTro);
        Assert.Equal("42", lai.HandleTim);
    }

    [Fact]
    public void XData_appname_khong_dung_appname_cua_M99()
    {
        Assert.Equal("XBOSS_VE", VeXData.AppName);
        Assert.NotEqual("XBOSS_BOCKL", VeXData.AppName);
    }
}
